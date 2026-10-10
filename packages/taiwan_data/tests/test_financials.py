import pytest

from taiwan_data.fetchers.financials import URL_BALANCE, URL_INCOME, fetch_latest_financials, merge_financials


def test_merge_financials_calculates_ratios():
    income = [{
        "公司代號": "2330", "年度": "115", "季別": "2", "營業收入": "1,000,000",
        "營業毛利（毛損）淨額": "300,000", "營業利益（損失）": "150,000",
        "淨利（淨損）歸屬於母公司業主": "100,000", "基本每股盈餘（元）": "2.5",
    }]
    balance = [{
        "公司代號": "2330", "年度": "115", "季別": "2",
        "資產總額": "5,000,000", "負債總額": "2,000,000",
        "歸屬於母公司業主之權益合計": "3,000,000",
    }]
    row = merge_financials(income, balance, "TWSE", "2026-10-09T12:00:00+08:00")[0]
    assert row["year"] == 2026
    assert row["operating_margin"] == pytest.approx(15.0)
    assert row["debt_ratio"] == pytest.approx(40.0)
    assert row["roe"] == pytest.approx(100000 / 3000000 * 100)


def test_merge_financials_never_combines_different_periods():
    income = [{
        "公司代號": "2330", "年度": "115", "季別": "3", "營業收入": "1,000",
        "淨利（淨損）歸屬於母公司業主": "100",
    }]
    stale_balance = [{
        "公司代號": "2330", "年度": "115", "季別": "2",
        "資產總額": "5,000", "負債總額": "2,000",
        "歸屬於母公司業主之權益合計": "3,000",
    }]

    row = merge_financials(income, stale_balance, "TWSE", "2026-10-09T12:00:00+08:00")[0]

    assert row["year"] == 2026 and row["quarter"] == 3
    assert row["total_assets"] is None
    assert row["roe"] is None
    assert row["roa"] is None


def test_latest_financials_rejects_a_single_market_failure(monkeypatch):
    income = [{"公司代號": "2330", "年度": "115", "季別": "2", "營業收入": "1,000"}]
    balance = [{"公司代號": "2330", "年度": "115", "季別": "2", "資產總額": "5,000"}]

    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    class Session:
        def get(self, url, **kwargs):
            if url == URL_INCOME["TWSE"]:
                return Response(income)
            if url == URL_BALANCE["TWSE"]:
                return Response(balance)
            raise ConnectionError("TPEX unavailable")

    monkeypatch.setattr("taiwan_data.fetchers.common.time.sleep", lambda seconds: None)
    with pytest.raises(RuntimeError, match="市場資料不完整"):
        fetch_latest_financials(Session())

