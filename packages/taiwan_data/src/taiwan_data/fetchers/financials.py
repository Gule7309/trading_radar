from __future__ import annotations

from typing import Iterable

from ..db import now_iso
from .common import clean_num, get_json, is_stock_code

URL_INCOME = {
    "TWSE": "https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci",
    "TPEX": "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci",
}
URL_BALANCE = {
    "TWSE": "https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci",
    "TPEX": "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci",
}
SOURCES = ";".join([*URL_INCOME.values(), *URL_BALANCE.values()])


def first_value(row: dict, *keys):
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def clamp_ratio(value: float | None, limit: float = 9999.0) -> float | None:
    return value if value is not None and abs(value) < limit else None


def fetch_latest_financials(session=None) -> list[dict]:
    fetched_at = now_iso()
    rows: dict[str, dict] = {}
    failures: list[str] = []
    for market in ("TWSE", "TPEX"):
        try:
            income = get_json(URL_INCOME[market], session=session)
            balance = get_json(URL_BALANCE[market], session=session)
        except Exception as exc:
            failures.append(f"{market}: {exc}")
            continue
        market_rows = merge_financials(income, balance, market, fetched_at)
        if not market_rows:
            failures.append(f"{market}: 官方財報回傳 0 筆可配對資料")
            continue
        for row in market_rows:
            rows[row["stock_id"]] = row
    if failures:
        raise RuntimeError("財報市場資料不完整：" + " | ".join(failures))
    return list(rows.values())


def merge_financials(
    income_rows: Iterable[dict],
    balance_rows: Iterable[dict],
    market: str,
    fetched_at: str,
) -> list[dict]:
    balances: dict[tuple[str, int, int], dict] = {}
    for row in balance_rows:
        stock_id = str(first_value(row, "公司代號", "SecuritiesCompanyCode") or "").strip()
        period = _period(row)
        if is_stock_code(stock_id) and period is not None:
            balances[(stock_id, *period)] = row

    result = []
    for income in income_rows:
        stock_id = str(first_value(income, "公司代號", "SecuritiesCompanyCode") or "").strip()
        period = _period(income)
        if not is_stock_code(stock_id) or period is None:
            continue
        year, quarter = period

        revenue = clean_num(first_value(income, "營業收入", "OperatingRevenue"))
        gross_profit = clean_num(first_value(
            income, "營業毛利（毛損）淨額", "營業毛利（毛損）", "GrossProfitLossFromOperations"
        ))
        operating_income = clean_num(first_value(
            income, "營業利益（損失）", "NetOperatingIncomeLoss"
        ))
        net_income = clean_num(first_value(
            income, "淨利（淨損）歸屬於母公司業主", "本期淨利（淨損）", "ProfitLoss"
        ))
        eps = clean_num(first_value(income, "基本每股盈餘（元）", "基本每股盈餘(元)", "BasicEarningsLossPerShare"))

        balance = balances.get((stock_id, year, quarter), {})
        total_assets = clean_num(first_value(balance, "資產總額", "資產總計", "TotalAssets"))
        total_liabilities = clean_num(first_value(balance, "負債總額", "負債總計", "TotalLiabilities"))
        equity = clean_num(first_value(
            balance, "歸屬於母公司業主之權益合計", "EquityAttributableToOwnersOfParent"
        ))

        gross_margin = gross_profit / revenue * 100 if gross_profit is not None and revenue else None
        operating_margin = operating_income / revenue * 100 if operating_income is not None and revenue else None
        debt_ratio = total_liabilities / total_assets * 100 if total_liabilities is not None and total_assets else None
        roa = net_income / total_assets * 100 if net_income is not None and total_assets else None
        roe = net_income / equity * 100 if net_income is not None and equity else None

        result.append({
            "stock_id": stock_id, "year": year, "quarter": quarter,
            "revenue": _integer(revenue), "gross_profit": _integer(gross_profit),
            "operating_income": _integer(operating_income), "net_income": _integer(net_income),
            "total_assets": _integer(total_assets),
            "total_liabilities": _integer(total_liabilities), "equity": _integer(equity),
            "eps": clamp_ratio(eps), "roe": clamp_ratio(roe), "roa": clamp_ratio(roa),
            "gross_margin": clamp_ratio(gross_margin),
            "operating_margin": clamp_ratio(operating_margin),
            "debt_ratio": clamp_ratio(debt_ratio), "market": market, "fetched_at": fetched_at,
        })
    return result


def _integer(value: float | None) -> int | None:
    return int(value) if value is not None else None


def _period(row: dict) -> tuple[int, int] | None:
    year_value = clean_num(first_value(row, "年度", "Year"))
    quarter_value = clean_num(first_value(row, "季別", "Season"))
    if year_value is None or quarter_value is None:
        return None
    year = int(year_value)
    quarter = int(quarter_value)
    if year < 1911:
        year += 1911
    if quarter not in (1, 2, 3, 4):
        return None
    return year, quarter
