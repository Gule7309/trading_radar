from __future__ import annotations

from datetime import date

from .common import get_json, is_stock_code, parse_roc_date, parse_roc_period

URL_TWSE_PUNISH = "https://www.twse.com.tw/rwd/zh/announcement/punish"
URL_TWSE_NOTICE = "https://www.twse.com.tw/rwd/zh/announcement/notice"
URL_TPEX_PUNISH = "https://www.tpex.org.tw/www/zh-tw/bulletin/disposal"
URL_TPEX_NOTICE = "https://www.tpex.org.tw/www/zh-tw/bulletin/attention"
SOURCES = ";".join([URL_TWSE_PUNISH, URL_TWSE_NOTICE, URL_TPEX_PUNISH, URL_TPEX_NOTICE])

# 長度上限沿用舊 snapshot；notice_events 的 primary key 含 reason，截斷規則必須一致才不會重複。
_REASON_LIMIT = 100
_MEASURE_LIMIT = 50
_NOTICE_REASON_LIMIT = 200


def fetch_twse_disposition(start: date, end: date, session=None) -> list[dict]:
    payload = get_json(URL_TWSE_PUNISH, params=_twse_range(start, end), session=session)
    if payload.get("stat") != "OK":
        return []
    # 1 公布日期、2 代號、4 累計、5 處置條件、6 處置起迄、7 處置措施
    return _disposition_rows(payload.get("data"), "TWSE", period=6, reason=5, measure=7)


def fetch_tpex_disposition(start: date, end: date, session=None) -> list[dict]:
    payload = get_json(URL_TPEX_PUNISH, params=_tpex_range(start, end), session=session)
    tables = payload.get("tables") or []
    if str(payload.get("stat", "")).lower() != "ok" or not tables:
        return []
    # 1 公布日期、2 代號、4 累計、5 處置起訖、6 處置原因、7 處置措施
    return _disposition_rows(tables[0].get("data"), "TPEX", period=5, reason=6, measure=7)


def fetch_twse_notice(start: date, end: date, session=None) -> list[dict]:
    payload = get_json(URL_TWSE_NOTICE, params=_twse_range(start, end), session=session)
    if payload.get("stat") != "OK":
        return []
    return _notice_rows(payload.get("data"), "TWSE")


def fetch_tpex_notice(start: date, end: date, session=None) -> list[dict]:
    payload = get_json(URL_TPEX_NOTICE, params=_tpex_range(start, end), session=session)
    tables = payload.get("tables") or []
    if str(payload.get("stat", "")).lower() != "ok" or not tables:
        return []
    return _notice_rows(tables[0].get("data"), "TPEX")


def _disposition_rows(data, market: str, *, period: int, reason: int, measure: int) -> list[dict]:
    rows: dict[tuple, dict] = {}
    for raw in data or []:
        if len(raw) <= max(period, reason, measure):
            continue
        stock_id = str(raw[2]).strip()
        start, end = parse_roc_period(raw[period])
        if not is_stock_code(stock_id) or start is None or end is None:
            continue
        rows[(stock_id, start, end)] = {
            "stock_id": stock_id, "announce_date": parse_roc_date(raw[1]),
            "start_date": start, "end_date": end, "cumulative": _int_or_none(raw[4]),
            "reason": _text(raw[reason], _REASON_LIMIT),
            "measure": _text(raw[measure], _MEASURE_LIMIT), "market": market,
        }
    return list(rows.values())


def _notice_rows(data, market: str) -> list[dict]:
    # TWSE 與 TPEX 欄位位置相同：1 代號、4 注意交易資訊、5 日期（115.10.07 或 115/10/08）
    rows: dict[tuple, dict] = {}
    for raw in data or []:
        if len(raw) < 6:
            continue
        stock_id = str(raw[1]).strip()
        notice_date = parse_roc_date(raw[5])
        if not is_stock_code(stock_id) or notice_date is None:
            continue
        reason = _text(raw[4], _NOTICE_REASON_LIMIT)
        rows[(stock_id, notice_date, reason)] = {
            "stock_id": stock_id, "notice_date": notice_date, "reason": reason, "market": market,
        }
    return list(rows.values())


def _twse_range(start: date, end: date) -> dict[str, str]:
    return {"startDate": start.strftime("%Y%m%d"), "endDate": end.strftime("%Y%m%d"),
            "response": "json"}


def _tpex_range(start: date, end: date) -> dict[str, str]:
    return {"startDate": start.strftime("%Y/%m/%d"), "endDate": end.strftime("%Y/%m/%d"),
            "response": "json"}


def _text(value, limit: int) -> str | None:
    return str(value).strip()[:limit] if value is not None else None


def _int_or_none(value) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None
