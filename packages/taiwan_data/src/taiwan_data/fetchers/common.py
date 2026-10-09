from __future__ import annotations

import re
import time
from datetime import date
from typing import Any

import requests

USER_AGENT = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def clean_num(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace(" ", "")
    if text in ("", "-", "--", "---", "X", "x", "N/A", "不適用"):
        return None
    text = text.lstrip("X").replace("+", "")
    try:
        return float(text)
    except ValueError:
        return None


def clean_int(value) -> int:
    number = clean_num(value)
    return int(number) if number is not None else 0


def roc_to_date(value) -> date | None:
    text = str(value).strip()
    if not text.isdigit() or len(text) < 7:
        return None
    try:
        return date(int(text[:-4]) + 1911, int(text[-4:-2]), int(text[-2:]))
    except ValueError:
        return None


_ROC_TEXT_DATE = re.compile(r"^\*?\s*(\d{2,3})\s*[/.年]\s*(\d{1,2})\s*[/.月]\s*(\d{1,2})\s*日?\s*$")


def parse_roc_date(value) -> date | None:
    """'115/10/07'、'115.10.07'、'115年10月07日'、'*115/07/24'（更正標記）→ date。"""
    if value is None:
        return None
    match = _ROC_TEXT_DATE.match(str(value).strip())
    if not match:
        return None
    year, month, day = (int(x) for x in match.groups())
    try:
        return date(year + 1911, month, day)
    except ValueError:
        return None


def parse_roc_period(value) -> tuple[date | None, date | None]:
    """'115/10/08～115/10/19' 或半形 '~' → (起, 迄)。"""
    parts = re.split(r"[～~]", str(value or ""))
    if len(parts) != 2:
        return None, None
    return parse_roc_date(parts[0]), parse_roc_date(parts[1])


def is_stock_code(value) -> bool:
    return bool(re.fullmatch(r"\d{4}", str(value).strip()))


def get_json(
    url: str,
    *,
    params: dict[str, object] | None = None,
    session=None,
    timeout: int = 60,
    retries: int = 3,
) -> Any:
    client = session or requests
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = client.get(url, params=params, headers=USER_AGENT, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # requests has several transport/JSON failure types
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    assert last_error is not None
    raise last_error


def change_pct(close: float | None, change: float | None) -> float | None:
    if close is None or change is None:
        return None
    previous = close - change
    return None if previous == 0 else round(change / previous * 100, 4)

