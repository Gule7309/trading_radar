from datetime import date

import pytest

from taiwan_data.db import DataStore
from taiwan_data.cli import _result_failed
from taiwan_data.fetchers import corporate, disposition, margin
from taiwan_data.fetchers.common import parse_roc_date, parse_roc_period
from taiwan_data.service import RefreshService, _month_chunks, _resume_date


class Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class Session:
    """依 URL 回傳固定 payload；未登記的 URL 直接失敗，模擬端點故障。"""

    def __init__(self, payloads):
        self.payloads = payloads
        self.calls = []

    def get(self, url, params=None, **kwargs):
        self.calls.append((url, params))
        if url not in self.payloads:
            raise ConnectionError(f"unreachable: {url}")
        return Response(self.payloads[url])


TWSE_MARGIN = {"stat": "OK", "tables": [
    {"title": "信用交易統計", "data": []},
    {"fields": ["代號", "名稱", "買進", "賣出", "現金償還", "前日餘額", "今日餘額", "限額",
                "買進", "賣出", "現券償還", "前日餘額", "今日餘額", "限額", "資券互抵", "註記"],
     "data": [
         ["　", "合計", "1", "1", "0", "100", "101", "0", "0", "0", "0", "5", "6", "0", "0", ""],
         ["1101", "台泥", "1,349", "1,092", "40", "37,297", "37,514", "1", "0", "25", "0",
          "53", "78", "1", "1", " "],
         ["00878", "國泰永續高股息", "1", "1", "0", "10", "11", "1", "0", "0", "0", "1", "1", "1", "0", ""],
     ]},
]}

TPEX_MARGIN = {"stat": "ok", "tables": [{"data": [
    ["00679B", "元大美債20年", "4,618", "25", "184", "19", "4,440", "137", "0.28", "1",
     "5", "0", "0", "0", "5", "0", "0.0", "1", "1", ""],
    ["6488", "環球晶", "2,000", "10", "20", "0", "1,990", "0", "1", "1",
     "30", "0", "0", "0", "35", "0", "0", "1", "0", ""],
]}]}


def test_roc_date_formats():
    assert parse_roc_date("115/10/07") == date(2026, 10, 7)
    assert parse_roc_date("115.10.07") == date(2026, 10, 7)
    assert parse_roc_date("115年09月01日") == date(2026, 9, 1)
    assert parse_roc_date("*115/07/24") == date(2026, 7, 24)
    assert parse_roc_date("N/A") is None
    assert parse_roc_period("115/10/08～115/10/15") == (date(2026, 10, 8), date(2026, 10, 15))
    assert parse_roc_period("115/10/08~115/10/19") == (date(2026, 10, 8), date(2026, 10, 19))


def test_margin_parsers_compute_balance_change_and_skip_totals():
    session = Session({margin.URL_TWSE_MARGIN: TWSE_MARGIN, margin.URL_TPEX_MARGIN: TPEX_MARGIN})
    twse = margin.fetch_twse_margin_by_date(date(2026, 10, 8), session=session)
    tpex = margin.fetch_tpex_margin_by_date(date(2026, 10, 8), session=session)
    assert [r["stock_id"] for r in twse] == ["1101"]
    assert twse[0]["margin_balance"] == 37514
    assert twse[0]["margin_change"] == 217
    assert twse[0]["short_change"] == 25
    assert [r["stock_id"] for r in tpex] == ["6488"]
    assert tpex[0]["margin_change"] == -10
    assert tpex[0]["short_balance"] == 35


def test_dividend_parsers_keep_common_stocks_only():
    session = Session({
        corporate.URL_TWSE_DIVIDEND: {"stat": "OK", "data": [
            ["115年09月01日", "00939", "ETF", "23.17", "23.04", "0.125", "息"],
            ["115年09月02日", "2330", "台積電", "1,000.00", "995.00", "5.0", "息"],
        ]},
        corporate.URL_TPEX_DIVIDEND: {"stat": "ok", "tables": [{"data": [
            ["115/09/03", "6488  ", "環球晶", "400.00", "395.00", "0", "5.0", "5.0", "除息"],
        ]}]},
    })
    twse = corporate.fetch_twse_dividends(date(2026, 9, 1), date(2026, 9, 30), session=session)
    tpex = corporate.fetch_tpex_dividends(date(2026, 9, 1), date(2026, 9, 30), session=session)
    assert twse == [{"stock_id": "2330", "ex_date": date(2026, 9, 2),
                     "pre_close": 1000.0, "ref_price": 995.0}]
    assert tpex[0]["stock_id"] == "6488" and tpex[0]["ex_date"] == date(2026, 9, 3)


def test_disposition_and_notice_parsers_for_both_markets():
    session = Session({
        disposition.URL_TWSE_PUNISH: {"stat": "OK", "data": [
            [1, "115/09/30", "086845", "權證", 1, "連續三次", "115/10/01～115/10/07", "第一次處置", "", ""],
            [2, "115/10/07", "1709", "和益", 1, "最近十個營業日已有六次",
             "115/10/08～115/10/15", "第一次處置", "內容", ""],
        ]},
        disposition.URL_TPEX_PUNISH: {"stat": "ok", "tables": [{"data": [
            [1, "115/10/07", "3441", "聯一光(link)", 7, "115/10/08~115/10/19",
             "連續3個營業日及沖銷標準", "再次處置", "內容", "249.00", "102.47", ""],
        ]}]},
        disposition.URL_TWSE_NOTICE: {"stat": "OK", "data": [
            [1, "2330", "台積電", "1", "漲幅過大" * 80, "115.10.07", "1000", "20"],
        ]},
        disposition.URL_TPEX_NOTICE: {"stat": "ok", "tables": [{"data": [
            [1, "3147", "大綜", 29, "成交量放大", "115/10/08", "308.00", "19.14", "link"],
        ]}]},
    })
    window = (date(2026, 10, 1), date(2026, 10, 8))
    twse = disposition.fetch_twse_disposition(*window, session=session)
    tpex = disposition.fetch_tpex_disposition(*window, session=session)
    assert [(r["stock_id"], r["start_date"], r["end_date"]) for r in twse] == [
        ("1709", date(2026, 10, 8), date(2026, 10, 15))]
    assert twse[0]["reason"] == "最近十個營業日已有六次"
    assert tpex[0]["reason"] == "連續3個營業日及沖銷標準"
    assert tpex[0]["market"] == "TPEX" and tpex[0]["cumulative"] == 7

    notice = disposition.fetch_twse_notice(*window, session=session)
    assert notice[0]["notice_date"] == date(2026, 10, 7)
    assert len(notice[0]["reason"]) == 200  # 與舊 snapshot 相同的截斷，primary key 才對得上
    assert disposition.fetch_tpex_notice(*window, session=session)[0]["market"] == "TPEX"


def test_failed_event_source_does_not_erase_existing_window(tmp_path):
    store = DataStore(tmp_path / "t.sqlite")
    store.ensure_schema()
    store.upsert("notice_events", [{
        "stock_id": "2330", "notice_date": "2026-10-07",
        "reason": "existing", "market": "TWSE",
    }], ("stock_id", "notice_date", "reason"))
    session = Session({
        disposition.URL_TWSE_PUNISH: {"stat": "查詢失敗"},
    })

    with pytest.raises(RuntimeError, match="TWSE 處置股查詢失敗"):
        RefreshService(store, session=session).refresh_disposition(
            until=date(2026, 10, 8), delay=0
        )

    assert _query(store, "SELECT stock_id, reason FROM notice_events") == [
        ("2330", "existing")
    ]


def test_delisted_marks_inactive_but_keeps_reused_codes(tmp_path):
    store = DataStore(tmp_path / "t.sqlite")
    store.ensure_schema()
    store.upsert("stocks", [
        {"stock_id": "2867", "stock_name": "三商壽", "market": "TWSE", "is_active": 1},
        {"stock_id": "1101", "stock_name": "台泥", "market": "TWSE", "is_active": 1},
    ], ("stock_id",))
    # 1101 在「下市日」之後仍有成交，視為代號被沿用，不能標成下市
    store.upsert("daily_prices", [
        {"stock_id": "1101", "trade_date": "2026-10-08", "close": 30.0},
    ], ("stock_id", "trade_date"))
    session = Session({corporate.URL_TWSE_DELISTED: [
        {"DelistingDate": "115/09/01", "Company": "三商壽", "Code": "2867"},
        {"DelistingDate": "100/01/03", "Company": "舊台泥", "Code": "1101"},
        {"DelistingDate": "114/05/05", "Company": "已下市", "Code": "9999"},
        {"DelistingDate": "114/05/05", "Company": "權證", "Code": "030001"},
    ]})
    result = RefreshService(store, session=session).refresh_delisted()
    assert result["rows"] == 3
    rows = {r[0]: r[1:] for r in _query(store, "SELECT stock_id, is_active, delisting_date FROM stocks")}
    assert rows["2867"] == (0, "2026-09-01")
    assert rows["1101"] == (1, None)
    assert rows["9999"] == (0, "2025-05-05")


def test_industry_profiles_only_fill_blanks(tmp_path):
    store = DataStore(tmp_path / "t.sqlite")
    store.ensure_schema()
    store.upsert("stocks", [
        {"stock_id": "2330", "stock_name": "台積電", "market": "TWSE", "industry_code": "電子工業"},
        {"stock_id": "6488", "stock_name": "環球晶", "market": "TPEX", "industry_code": None},
    ], ("stock_id",))
    store.upsert("stock_industry_map", [{"stock_id": "2330", "industry_code": "電子工業"}],
                 ("stock_id", "industry_code"))
    session = Session({
        corporate.URL_TWSE_COMPANY: [
            {"公司代號": "2330", "公司簡稱": "台積電", "產業別": "24", "上市日期": "19940905"},
        ],
        corporate.URL_TPEX_COMPANY: [
            {"SecuritiesCompanyCode": "6488", "CompanyAbbreviation": "環球晶",
             "SecuritiesIndustryCode": "24", "DateOfListing": "20150925"},
            {"SecuritiesCompanyCode": "7777", "CompanyAbbreviation": "新產業",
             "SecuritiesIndustryCode": "99", "DateOfListing": "20260101"},
        ],
    })
    result = RefreshService(store, session=session).refresh_industries()
    assert result["unmapped_industry_codes"] == ["99"]
    stocks = {r[0]: r[1:] for r in _query(
        store, "SELECT stock_id, industry_code, listing_date FROM stocks")}
    assert stocks["2330"] == ("電子工業", "1994-09-05")  # 既有分類不覆寫，只補上市日
    assert stocks["6488"] == ("半導體業", "2015-09-25")
    assert "7777" not in stocks  # 不在股票 master 的代號不自行新增
    assert sorted(_query(store, "SELECT stock_id, industry_code FROM stock_industry_map")) == [
        ("2330", "電子工業"), ("6488", "半導體業")]


def test_refresh_all_isolates_failures(tmp_path, monkeypatch):
    monkeypatch.setattr("time.sleep", lambda seconds: None)  # 略過 get_json 重試的等待
    store = DataStore(tmp_path / "t.sqlite")
    service = RefreshService(store, session=Session({
        corporate.URL_TWSE_DELISTED: [{"DelistingDate": "115/09/01", "Company": "三商壽", "Code": "2867"}],
    }))
    result = service.refresh_all(since=date(2026, 10, 10), until=date(2026, 10, 9), delay=0)
    assert result["delisted"]["rows"] == 1
    assert {"stocks", "revenue", "financials", "industries"} <= set(result["errors"])
    statuses = {row["dataset"]: row["status"] for row in store.status()["dataset_status"]}
    assert statuses["delisted_stocks"] == "success"
    assert statuses["quarterly_financials"] == "failed"


def test_refresh_all_and_cli_treat_partial_as_failure(tmp_path, monkeypatch):
    service = RefreshService(DataStore(tmp_path / "t.sqlite"), session=Session({}))
    monkeypatch.setattr(
        service,
        "refresh_market",
        lambda **kwargs: {
            "status": "partial",
            "partial_days": ["2026-10-09: TPEX price unavailable"],
        },
    )
    for name in (
        "refresh_stocks_and_latest_prices", "refresh_revenue", "refresh_financials",
        "refresh_margin", "refresh_dividends", "refresh_disposition", "refresh_delisted",
        "refresh_industries",
    ):
        monkeypatch.setattr(service, name, lambda **kwargs: {"status": "success"})

    result = service.refresh_all(delay=0)

    assert "market" in result["errors"]
    assert _result_failed(result)
    assert _result_failed({"status": "partial"})
    assert not _result_failed({"status": "success"})


def test_resume_and_month_chunks():
    assert _resume_date("2026-10-06", date(2026, 10, 9), 0) == date(2026, 10, 7)
    assert _resume_date("2026-10-08", date(2026, 10, 9), 5) == date(2026, 10, 4)
    assert _resume_date(None, date(2026, 10, 9), 0) == date(2026, 10, 9)
    assert list(_month_chunks(date(2026, 11, 20), date(2027, 1, 5))) == [
        (date(2026, 11, 20), date(2026, 11, 30)),
        (date(2026, 12, 1), date(2026, 12, 31)),
        (date(2027, 1, 1), date(2027, 1, 5)),
    ]


@pytest.mark.parametrize("code", ["01", "24", "38", "91"])
def test_industry_names_cover_official_codes(code):
    assert corporate.INDUSTRY_NAMES[code]


def _query(store, sql):
    from contextlib import closing
    with closing(store.connect()) as conn:
        return [tuple(r) for r in conn.execute(sql).fetchall()]
