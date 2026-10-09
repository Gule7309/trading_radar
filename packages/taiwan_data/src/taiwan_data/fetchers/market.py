from __future__ import annotations

import re
import time
from datetime import date

from .common import (
    change_pct,
    clean_int,
    clean_num,
    get_json,
    is_stock_code,
    roc_to_date,
)

URL_TWSE_PRICE = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
URL_TPEX_PRICE = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
URL_TWSE_PRICE_BY_DATE = "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX"
URL_TPEX_PRICE_BY_DATE = "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes"
URL_TWSE_INSTITUTIONAL = "https://www.twse.com.tw/rwd/zh/fund/T86"
URL_TPEX_INSTITUTIONAL_BY_DATE = "https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade"

PRICE_SOURCES = f"{URL_TWSE_PRICE};{URL_TPEX_PRICE}"
HISTORY_SOURCES = f"{URL_TWSE_PRICE_BY_DATE};{URL_TPEX_PRICE_BY_DATE}"
INSTITUTIONAL_SOURCES = f"{URL_TWSE_INSTITUTIONAL};{URL_TPEX_INSTITUTIONAL_BY_DATE}"


def fetch_latest_stocks_and_prices(session=None) -> tuple[list[dict], list[dict]]:
    stocks: list[dict] = []
    prices: list[dict] = []
    twse = get_json(URL_TWSE_PRICE, session=session)
    tpex = get_json(URL_TPEX_PRICE, session=session)

    for item in twse:
        code = str(item.get("Code", "")).strip()
        close = clean_num(item.get("ClosingPrice"))
        trade_date = roc_to_date(item.get("Date"))
        if not is_stock_code(code) or close is None or trade_date is None:
            continue
        stocks.append({"stock_id": code, "stock_name": str(item.get("Name", "")).strip(),
                       "market": "TWSE", "is_active": 1})
        change = clean_num(item.get("Change"))
        prices.append({
            "stock_id": code, "trade_date": trade_date,
            "open": clean_num(item.get("OpeningPrice")),
            "high": clean_num(item.get("HighestPrice")),
            "low": clean_num(item.get("LowestPrice")), "close": close,
            "volume": clean_int(item.get("TradeVolume")),
            "turnover": clean_int(item.get("TradeValue")),
            "change_pct": change_pct(close, change),
        })

    for item in tpex:
        code = str(item.get("SecuritiesCompanyCode", "")).strip()
        close = clean_num(item.get("Close"))
        trade_date = roc_to_date(item.get("Date"))
        if not is_stock_code(code) or close is None or trade_date is None:
            continue
        stocks.append({"stock_id": code,
                       "stock_name": str(item.get("CompanyName", "")).strip(),
                       "market": "TPEX", "is_active": 1})
        change = clean_num(item.get("Change"))
        prices.append({
            "stock_id": code, "trade_date": trade_date,
            "open": clean_num(item.get("Open")), "high": clean_num(item.get("High")),
            "low": clean_num(item.get("Low")), "close": close,
            "volume": clean_int(item.get("TradingShares")),
            "turnover": clean_int(item.get("TransactionAmount")),
            "change_pct": change_pct(close, change),
        })
    return _deduplicate(stocks, "stock_id"), _deduplicate(prices, "stock_id")


def fetch_prices_by_date(trade_date: date, session=None) -> dict[str, list[dict]]:
    return {
        "TWSE": fetch_twse_prices_by_date(trade_date, session=session),
        "TPEX": fetch_tpex_prices_by_date(trade_date, session=session),
    }


def fetch_twse_prices_by_date(trade_date: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TWSE_PRICE_BY_DATE,
        params={"date": trade_date.strftime("%Y%m%d"), "type": "ALLBUT0999", "response": "json"},
        session=session,
    )
    if payload.get("stat") != "OK":
        return []
    table = next(
        (t for t in payload.get("tables", []) if "每日收盤行情" in t.get("title", "")),
        None,
    )
    rows = []
    for raw in (table or {}).get("data", []):
        if len(raw) < 11 or not is_stock_code(raw[0]):
            continue
        close = clean_num(raw[8])
        if close is None:
            continue
        spread = clean_num(raw[10])
        change = None if spread is None else (-spread if "green" in str(raw[9]) else spread)
        rows.append({
            "stock_id": str(raw[0]).strip(), "trade_date": trade_date,
            "open": clean_num(raw[5]), "high": clean_num(raw[6]), "low": clean_num(raw[7]),
            "close": close, "volume": clean_int(raw[2]), "turnover": clean_int(raw[4]),
            "change_pct": change_pct(close, change),
        })
    return rows


def fetch_tpex_prices_by_date(trade_date: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TPEX_PRICE_BY_DATE,
        params={"date": trade_date.strftime("%Y/%m/%d"), "type": "EW", "response": "json"},
        session=session,
    )
    tables = payload.get("tables") or []
    if str(payload.get("stat", "")).lower() != "ok" or not tables:
        return []
    rows = []
    for raw in tables[0].get("data", []):
        if len(raw) < 10 or not is_stock_code(raw[0]):
            continue
        close = clean_num(raw[2])
        if close is None:
            continue
        rows.append({
            "stock_id": str(raw[0]).strip(), "trade_date": trade_date,
            "open": clean_num(raw[4]), "high": clean_num(raw[5]), "low": clean_num(raw[6]),
            "close": close, "volume": clean_int(raw[8]), "turnover": clean_int(raw[9]),
            "change_pct": change_pct(close, clean_num(raw[3])),
        })
    return rows


def fetch_institutional_by_date(trade_date: date, session=None) -> dict[str, list[dict]]:
    return {
        "TWSE": fetch_twse_institutional(trade_date, session=session),
        "TPEX": fetch_tpex_institutional_by_date(trade_date, session=session),
    }


def fetch_twse_institutional(trade_date: date, session=None) -> list[dict]:
    payload = {}
    for attempt in range(1, 4):
        payload = get_json(
            URL_TWSE_INSTITUTIONAL,
            params={"date": trade_date.strftime("%Y%m%d"),
                    "selectType": "ALLBUT0999", "response": "json"},
            session=session,
        )
        if payload.get("stat") == "OK" and payload.get("data"):
            break
        if attempt < 3:
            time.sleep(5 * attempt)
    if payload.get("stat") != "OK" or not payload.get("data"):
        return []

    fields = payload["fields"]

    def column(*keywords):
        return next((i for i, name in enumerate(fields)
                     if all(keyword in name for keyword in keywords)), None)

    positions = {
        "foreign_buy": column("外陸資買進", "不含外資自營商"),
        "foreign_sell": column("外陸資賣出", "不含外資自營商"),
        "invest_buy": column("投信買進"), "invest_sell": column("投信賣出"),
        "dealer_buy_self": column("自營商買進股數", "自行買賣"),
        "dealer_sell_self": column("自營商賣出股數", "自行買賣"),
        "dealer_buy_hedge": column("自營商買進股數", "避險"),
        "dealer_sell_hedge": column("自營商賣出股數", "避險"),
        "total_net": column("三大法人買賣超股數"),
    }
    rows = []
    for raw in payload["data"]:
        code = str(raw[0]).strip()
        if not is_stock_code(code):
            continue
        value = lambda key: clean_int(raw[positions[key]]) if (
            positions[key] is not None and positions[key] < len(raw)
        ) else 0
        foreign_buy, foreign_sell = value("foreign_buy"), value("foreign_sell")
        invest_buy, invest_sell = value("invest_buy"), value("invest_sell")
        dealer_buy = value("dealer_buy_self") + value("dealer_buy_hedge")
        dealer_sell = value("dealer_sell_self") + value("dealer_sell_hedge")
        rows.append(_institutional_row(
            code, trade_date, foreign_buy, foreign_sell, invest_buy, invest_sell,
            dealer_buy, dealer_sell, value("total_net"),
        ))
    return rows


def fetch_tpex_institutional_by_date(trade_date: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TPEX_INSTITUTIONAL_BY_DATE,
        params={"date": trade_date.strftime("%Y/%m/%d"), "type": "Daily",
                "response": "json", "sect": "EW"},
        session=session,
    )
    tables = payload.get("tables") or []
    if str(payload.get("stat", "")).lower() != "ok" or not tables:
        return []
    rows = []
    for raw in tables[0].get("data", []):
        if len(raw) < 24 or not is_stock_code(raw[0]):
            continue
        value = lambda index: clean_int(raw[index])
        rows.append(_institutional_row(
            str(raw[0]).strip(), trade_date,
            value(2), value(3), value(11), value(12), value(20), value(21), value(23),
        ))
    return rows


def _institutional_row(
    stock_id: str, trade_date: date, foreign_buy: int, foreign_sell: int,
    invest_buy: int, invest_sell: int, dealer_buy: int, dealer_sell: int, total_net: int,
) -> dict:
    return {
        "stock_id": stock_id, "trade_date": trade_date,
        "foreign_buy": foreign_buy, "foreign_sell": foreign_sell,
        "foreign_net": foreign_buy - foreign_sell,
        "invest_buy": invest_buy, "invest_sell": invest_sell,
        "invest_net": invest_buy - invest_sell,
        "dealer_buy": dealer_buy, "dealer_sell": dealer_sell,
        "dealer_net": dealer_buy - dealer_sell, "total_net": total_net,
    }


def _deduplicate(rows: list[dict], key: str) -> list[dict]:
    return list({row[key]: row for row in rows}.values())
