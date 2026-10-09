from __future__ import annotations

from datetime import date, datetime

from .common import clean_num, get_json, is_stock_code, parse_roc_date

URL_TWSE_DIVIDEND = "https://www.twse.com.tw/rwd/zh/exRight/TWT49U"
URL_TPEX_DIVIDEND = "https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ"
URL_TWSE_DELISTED = "https://openapi.twse.com.tw/v1/company/suspendListingCsvAndHtml"
URL_TWSE_COMPANY = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
URL_TPEX_COMPANY = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O"

DIVIDEND_SOURCES = f"{URL_TWSE_DIVIDEND};{URL_TPEX_DIVIDEND}"
DELISTED_SOURCES = URL_TWSE_DELISTED
COMPANY_SOURCES = f"{URL_TWSE_COMPANY};{URL_TPEX_COMPANY}"

# 官方「產業別」代碼。名稱沿用舊 snapshot（FinMind）同代碼股票的多數標籤，
# 讓新補的對照與既有 stock_industry_map 用同一套名稱。
INDUSTRY_NAMES = {
    "01": "水泥工業", "02": "食品工業", "03": "塑膠工業", "04": "紡織纖維",
    "05": "電機機械", "06": "電器電纜", "08": "玻璃陶瓷", "09": "造紙工業",
    "10": "鋼鐵工業", "11": "橡膠工業", "12": "汽車工業", "14": "建材營造",
    "15": "航運業", "16": "觀光餐旅", "17": "金融保險", "18": "貿易百貨",
    "19": "綜合", "20": "其他", "21": "化學工業", "22": "生技醫療業",
    "23": "油電燃氣業", "24": "半導體業", "25": "電腦及週邊設備業", "26": "光電業",
    "27": "通信網路業", "28": "電子零組件業", "29": "電子通路業", "30": "資訊服務業",
    "31": "其他電子業", "32": "文化創意業", "33": "農業科技業", "34": "電子商務業",
    "35": "綠能環保", "36": "數位雲端", "37": "運動休閒", "38": "居家生活",
    "80": "管理股票", "91": "存託憑證",
}


def fetch_twse_dividends(start: date, end: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TWSE_DIVIDEND,
        params={"startDate": start.strftime("%Y%m%d"), "endDate": end.strftime("%Y%m%d"),
                "response": "json"},
        session=session,
    )
    if payload.get("stat") != "OK":
        return []
    # 0 資料日期（115年09月01日）、1 代號、3 除權息前收盤價、4 除權息參考價
    return _dividend_rows(payload.get("data"))


def fetch_tpex_dividends(start: date, end: date, session=None) -> list[dict]:
    payload = get_json(
        URL_TPEX_DIVIDEND,
        params={"startDate": start.strftime("%Y/%m/%d"), "endDate": end.strftime("%Y/%m/%d"),
                "response": "json"},
        session=session,
    )
    tables = payload.get("tables") or []
    if str(payload.get("stat", "")).lower() != "ok" or not tables:
        return []
    # 欄位順序與 TWSE 相同：0 除權息日期（115/09/01）、1 代號、3 前收盤、4 參考價
    return _dividend_rows(tables[0].get("data"))


def _dividend_rows(data) -> list[dict]:
    rows: dict[tuple[str, date], dict] = {}
    for raw in data or []:
        if len(raw) < 5:
            continue
        stock_id = str(raw[1]).strip()
        ex_date = parse_roc_date(raw[0])
        if not is_stock_code(stock_id) or ex_date is None:
            continue
        rows[(stock_id, ex_date)] = {
            "stock_id": stock_id, "ex_date": ex_date,
            "pre_close": clean_num(raw[3]), "ref_price": clean_num(raw[4]),
        }
    return list(rows.values())


def fetch_twse_delisted(session=None) -> list[dict]:
    rows = []
    for item in get_json(URL_TWSE_DELISTED, session=session):
        stock_id = str(item.get("Code", "")).strip()
        if not is_stock_code(stock_id):
            continue
        rows.append({
            "stock_id": stock_id,
            "stock_name": str(item.get("Company") or "").strip() or None,
            "delisting_date": parse_roc_date(item.get("DelistingDate")),
            "market": "TWSE",
        })
    return rows


def fetch_company_profiles(session=None) -> list[dict]:
    """上市＋上櫃公司基本資料：產業別、上市櫃日期、簡稱。"""
    rows = []
    for item in get_json(URL_TWSE_COMPANY, session=session):
        rows.append(_profile(item.get("公司代號"), item.get("公司簡稱"), item.get("產業別"),
                             item.get("上市日期"), "TWSE"))
    for item in get_json(URL_TPEX_COMPANY, session=session):
        rows.append(_profile(item.get("SecuritiesCompanyCode"), item.get("CompanyAbbreviation"),
                             item.get("SecuritiesIndustryCode"), item.get("DateOfListing"), "TPEX"))
    return [row for row in rows if row is not None]


def _profile(code, name, industry, listing, market: str) -> dict | None:
    stock_id = str(code or "").strip()
    if not is_stock_code(stock_id):
        return None
    industry_code = str(industry or "").strip()
    return {
        "stock_id": stock_id,
        "stock_name": str(name or "").strip() or None,
        "market": market,
        "industry_name": INDUSTRY_NAMES.get(industry_code),
        "official_industry_code": industry_code or None,
        "listing_date": _yyyymmdd(listing),
    }


def _yyyymmdd(value) -> date | None:
    try:
        return datetime.strptime(str(value).strip(), "%Y%m%d").date()
    except ValueError:
        return None
