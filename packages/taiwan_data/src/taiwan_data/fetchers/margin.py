from __future__ import annotations

from datetime import date

from .common import clean_num, get_json, is_stock_code

URL_TWSE_MARGIN = "https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN"
URL_TPEX_MARGIN = "https://www.tpex.org.tw/www/zh-tw/margin/balance"
SOURCES = f"{URL_TWSE_MARGIN};{URL_TPEX_MARGIN}"


def fetch_twse_margin_by_date(trade_date: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TWSE_MARGIN,
        params={"date": trade_date.strftime("%Y%m%d"), "selectType": "STOCK", "response": "json"},
        session=session,
    )
    if payload.get("stat") != "OK":
        return []
    # 第一張表是全市場彙總（沒有 fields）；個股表欄位：代號, 名稱, 融資 6 欄, 融券 6 欄, 資券互抵, 註記
    table = next((t for t in payload.get("tables") or []
                  if len(t.get("fields") or []) >= 13 and t.get("data")), None)
    # 融資：5 前日餘額、6 今日餘額；融券：11 前日餘額、12 今日餘額（單位：張）
    return _margin_rows((table or {}).get("data"), trade_date, 5, 6, 11, 12)


def fetch_tpex_margin_by_date(trade_date: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TPEX_MARGIN,
        params={"date": trade_date.strftime("%Y/%m/%d"), "response": "json"},
        session=session,
    )
    tables = payload.get("tables") or []
    if str(payload.get("stat", "")).lower() != "ok" or not tables:
        return []
    # 2 前資餘額、6 資餘額、10 前券餘額、14 券餘額（單位：張）
    return _margin_rows(tables[0].get("data"), trade_date, 2, 6, 10, 14)


def _margin_rows(data, trade_date: date, margin_prev: int, margin_today: int,
                 short_prev: int, short_today: int) -> list[dict]:
    rows = []
    width = max(margin_prev, margin_today, short_prev, short_today) + 1
    for raw in data or []:
        if len(raw) < width or not is_stock_code(raw[0]):  # 濾掉合計列與 ETF／權證
            continue
        m_prev, m_today = clean_num(raw[margin_prev]), clean_num(raw[margin_today])
        s_prev, s_today = clean_num(raw[short_prev]), clean_num(raw[short_today])
        rows.append({
            "stock_id": str(raw[0]).strip(), "trade_date": trade_date,
            "margin_balance": m_today,
            "margin_change": _diff(m_today, m_prev),
            "short_balance": s_today,
            "short_change": _diff(s_today, s_prev),
        })
    return rows


def _diff(today: float | None, previous: float | None) -> float | None:
    return today - previous if today is not None and previous is not None else None
