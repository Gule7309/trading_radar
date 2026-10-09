import pytest

from taiwan_data.fetchers.financials import merge_financials


def test_merge_financials_calculates_ratios():
    income = [{
        "公司代號": "2330", "年度": "115", "季別": "2", "營業收入": "1,000,000",
        "營業毛利（毛損）淨額": "300,000", "營業利益（損失）": "150,000",
        "淨利（淨損）歸屬於母公司業主": "100,000", "基本每股盈餘（元）": "2.5",
    }]
    balance = [{
        "公司代號": "2330", "資產總額": "5,000,000", "負債總額": "2,000,000",
        "歸屬於母公司業主之權益合計": "3,000,000",
    }]
    row = merge_financials(income, balance, "TWSE", "2026-10-09T12:00:00+08:00")[0]
    assert row["year"] == 2026
    assert row["operating_margin"] == pytest.approx(15.0)
    assert row["debt_ratio"] == pytest.approx(40.0)
    assert row["roe"] == pytest.approx(100000 / 3000000 * 100)

