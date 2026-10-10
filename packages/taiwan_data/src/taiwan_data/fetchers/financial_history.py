from __future__ import annotations

import re
import time
from typing import Iterable

import requests
from bs4 import BeautifulSoup

from ..db import now_iso
from .common import USER_AGENT, clean_num, is_stock_code
from .financials import clamp_ratio, financial_available_date

URL_INCOME = "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04"
URL_BALANCE = "https://mopsov.twse.com.tw/mops/web/ajax_t163sb05"
SOURCES = f"{URL_INCOME};{URL_BALANCE}"

_MARKET_TYPE = {"TWSE": "sii", "TPEX": "otc"}


def fetch_historical_financials(
    year: int, quarter: int, market: str, *, session=None,
) -> list[dict]:
    if market not in _MARKET_TYPE:
        raise ValueError(f"不支援的市場：{market}")
    if quarter not in (1, 2, 3, 4):
        raise ValueError(f"不合法的季度：{quarter}")

    income_html = _post_statement(URL_INCOME, year, quarter, market, session=session)
    balance_html = _post_statement(URL_BALANCE, year, quarter, market, session=session)
    income = parse_statement_tables(income_html)
    balance = parse_statement_tables(balance_html)
    if not income or not balance:
        raise RuntimeError(f"MOPS {market} {year}Q{quarter} 回傳 0 筆財報")

    fetched_at = now_iso()
    rows = []
    for stock_id, income_row in income.items():
        balance_row = balance.get(stock_id)
        if balance_row is None:
            continue
        rows.append(_merge_row(
            stock_id, year, quarter, market, income_row, balance_row, fetched_at
        ))
    if not rows:
        raise RuntimeError(f"MOPS {market} {year}Q{quarter} 損益表與資產負債表無法配對")
    return rows


def parse_statement_tables(html: str) -> dict[str, dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    result: dict[str, dict[str, str]] = {}
    for table in soup.select("table.hasBorder"):
        table_rows = table.select("tr")
        header_index = None
        headers: list[str] = []
        for index, tr in enumerate(table_rows):
            cells = tr.find_all(["th", "td"])
            candidate = [_normalize_header(cell.get_text(" ", strip=True)) for cell in cells]
            if "公司代號" in candidate:
                header_index = index
                headers = candidate
                break
        if header_index is None:
            continue
        statement_type = _statement_type(headers)
        for tr in table_rows[header_index + 1:]:
            values = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
            if len(values) < len(headers):
                continue
            row = dict(zip(headers, values))
            stock_id = str(row.get("公司代號") or "").strip()
            if not is_stock_code(stock_id):
                continue
            row["_statement_type"] = statement_type
            result[stock_id] = row
    return result


def _post_statement(url: str, year: int, quarter: int, market: str, *, session=None) -> str:
    client = session or requests
    payload = {
        "TYPEK": _MARKET_TYPE[market], "year": str(year - 1911),
        "season": f"{quarter:02d}", "step": "1", "firstin": "1",
    }
    headers = {
        **USER_AGENT,
        "Referer": url.replace("ajax_", ""),
    }
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = client.post(url, data=payload, headers=headers, timeout=90)
            response.raise_for_status()
            response.encoding = "utf-8"
            return response.text
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 * attempt)
    assert last_error is not None
    raise last_error


def _merge_row(
    stock_id: str, year: int, quarter: int, market: str,
    income: dict[str, str], balance: dict[str, str], fetched_at: str,
) -> dict:
    revenue = _number(income, "營業收入")
    gross_profit = _number(income, "營業毛利（毛損）淨額", "營業毛利（毛損）")
    operating_income = _number(income, "營業利益（損失）", "營業利益")
    net_income = _number(
        income, "淨利（淨損）歸屬於母公司業主", "淨利（損）歸屬於母公司業主",
        "本期稅後淨利（淨損）", "本期淨利（淨損）",
    )
    eps = _number(income, "基本每股盈餘（元）")
    assets = _number(balance, "資產總額", "資產總計")
    liabilities = _number(balance, "負債總額", "負債總計")
    equity = _number(
        balance, "歸屬於母公司業主之權益合計", "歸屬於母公司業主權益合計",
        "歸屬於母公司業主之權益", "權益總額", "權益總計",
    )
    return {
        "stock_id": stock_id, "year": year, "quarter": quarter,
        "revenue": _integer(revenue), "gross_profit": _integer(gross_profit),
        "operating_income": _integer(operating_income), "net_income": _integer(net_income),
        "total_assets": _integer(assets), "total_liabilities": _integer(liabilities),
        "equity": _integer(equity), "eps": clamp_ratio(eps),
        "roe": clamp_ratio(_ratio(net_income, equity)),
        "roa": clamp_ratio(_ratio(net_income, assets)),
        "gross_margin": clamp_ratio(_ratio(gross_profit, revenue)),
        "operating_margin": clamp_ratio(_ratio(operating_income, revenue)),
        "debt_ratio": clamp_ratio(_ratio(liabilities, assets)),
        "available_date": financial_available_date(year, quarter),
        "statement_type": income.get("_statement_type") or "unknown",
        "source_kind": "mops_historical", "market": market, "fetched_at": fetched_at,
    }


def _statement_type(headers: Iterable[str]) -> str:
    fields = set(headers)
    if "營業收入" in fields:
        return "general"
    if "利息淨收益" in fields and "淨收益" in fields:
        return "financial_holding"
    if "利息淨收益" in fields:
        return "bank"
    if "收益" in fields:
        return "securities"
    if "收入" in fields:
        return "other"
    return "unknown"


def _normalize_header(value: str) -> str:
    return re.sub(r"\s+", "", value).replace("－", "-")


def _number(row: dict[str, str], *names: str) -> float | None:
    for name in names:
        value = row.get(_normalize_header(name))
        if value not in (None, ""):
            parsed = clean_num(value)
            if parsed is not None:
                return parsed
    return None


def _integer(value: float | None) -> int | None:
    return int(value) if value is not None else None


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator * 100
