from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from .common import USER_AGENT, clean_num, is_stock_code

URL_TEMPLATE = "https://mopsov.twse.com.tw/nas/t21/{market}/t21sc03_{roc}_{month}_0.html"
SOURCE = "https://mopsov.twse.com.tw/nas/t21/"


def taipei_today() -> date:
    from datetime import datetime
    return datetime.now(ZoneInfo("Asia/Taipei")).date()


def latest_published_month(today: date | None = None) -> tuple[int, int]:
    today = today or taipei_today()
    year = today.year
    month = today.month - (1 if today.day > 10 else 2)
    while month <= 0:
        year -= 1
        month += 12
    return year, month


def fetch_month(year: int, month: int, session=None) -> list[dict]:
    client = session or requests
    year_month = f"{year:04d}-{month:02d}"
    rows: list[dict] = []
    errors: list[str] = []
    for market in ("sii", "otc"):
        url = URL_TEMPLATE.format(market=market, roc=year - 1911, month=month)
        try:
            response = client.get(url, headers=USER_AGENT, timeout=30)
            response.raise_for_status()
            response.encoding = "big5"
        except Exception as exc:
            errors.append(f"{market}: {exc}")
            continue
        soup = BeautifulSoup(response.text, "html.parser")
        for tr in soup.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(cells) < 7 or not is_stock_code(cells[0]):
                continue
            revenue = clean_num(cells[2])
            rows.append({
                "stock_id": cells[0], "stock_name": cells[1], "year_month": year_month,
                "revenue": int(revenue) if revenue is not None else None,
                "mom_pct": clean_num(cells[5]), "yoy_pct": clean_num(cells[6]),
            })
    if not rows and errors:
        raise RuntimeError(f"月營收 {year_month} 兩市場皆抓取失敗：{' | '.join(errors)}")
    return rows


def month_after(value: str) -> tuple[int, int]:
    year, month = map(int, value.split("-"))
    month += 1
    if month == 13:
        year, month = year + 1, 1
    return year, month


def iter_months(start: tuple[int, int], end: tuple[int, int]):
    year, month = start
    while (year, month) <= end:
        yield year, month
        month += 1
        if month == 13:
            year, month = year + 1, 1
