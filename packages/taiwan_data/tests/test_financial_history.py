from datetime import date

from taiwan_data.db import DataStore
from taiwan_data.fetchers.financial_history import (
    URL_BALANCE,
    URL_INCOME,
    fetch_historical_financials,
)


class Response:
    def __init__(self, text):
        self.text = text
        self.encoding = None

    def raise_for_status(self):
        return None


class Session:
    def post(self, url, **kwargs):
        if url == URL_INCOME:
            return Response("""
                <table class="hasBorder"><tr>
                  <th>公司 代號</th><th>公司名稱</th><th>營業收入</th>
                  <th>營業毛利（毛損）淨額</th><th>營業利益（損失）</th>
                  <th>淨利（淨損）歸屬於母公司業主</th><th>本期淨利（淨損）</th>
                  <th>基本每股盈餘（元）</th>
                </tr><tr><td>2330</td><td>台積電</td><td>1,000</td><td>600</td>
                  <td>400</td><td>(100)</td><td>90</td><td>2.5</td></tr>
                <tr><td>1234</td><td>測試公司</td><td>500</td><td>200</td>
                  <td>100</td><td>--</td><td>55</td><td>1.0</td></tr></table>
            """)
        if url == URL_BALANCE:
            return Response("""
                <table class="hasBorder"><tr>
                  <th>公司 代號</th><th>公司名稱</th><th>資產總計</th>
                  <th>負債總計</th><th>歸屬於母公司業主之權益合計</th>
                </tr><tr><td>2330</td><td>台積電</td><td>5,000</td>
                  <td>2,000</td><td>3,000</td></tr>
                <tr><td>1234</td><td>測試公司</td><td>2,000</td>
                  <td>800</td><td>1,200</td></tr></table>
            """)
        raise AssertionError(url)


def test_historical_financial_parser_normalizes_and_marks_point_in_time():
    row = fetch_historical_financials(2025, 2, "TWSE", session=Session())[0]
    assert row["stock_id"] == "2330"
    assert row["revenue"] == 1000
    assert row["net_income"] == -100
    assert row["total_assets"] == 5000
    assert row["statement_type"] == "general"
    assert row["source_kind"] == "mops_historical"
    assert row["available_date"] == date(2025, 8, 31)
    rows = fetch_historical_financials(2025, 2, "TWSE", session=Session())
    assert next(item for item in rows if item["stock_id"] == "1234")["net_income"] == 55


def test_recompute_true_single_quarter_values(tmp_path):
    store = DataStore(tmp_path / "financials.sqlite")
    store.ensure_schema()
    common = {
        "stock_id": "2330", "year": 2025, "gross_profit": 60,
        "operating_income": 40, "total_assets": 1000, "equity": 500,
        "market": "TWSE", "fetched_at": "2026-10-10T00:00:00+08:00",
    }
    store.upsert("quarterly_financials", [
        {**common, "quarter": 1, "revenue": 100, "net_income": 20, "eps": 1.0},
        {**common, "quarter": 2, "revenue": 250, "gross_profit": 150,
         "operating_income": 90, "net_income": 55, "eps": 2.5},
    ], ("stock_id", "year", "quarter"))

    assert store.recompute_financial_quarters() == 2
    with store.connect() as conn:
        q1 = conn.execute(
            "SELECT revenue_quarter, net_income_quarter, available_date "
            "FROM quarterly_financials WHERE quarter=1"
        ).fetchone()
        q2 = conn.execute(
            "SELECT revenue_quarter, gross_profit_quarter, operating_income_quarter, "
            "net_income_quarter, eps_quarter, gross_margin_quarter, available_date "
            "FROM quarterly_financials WHERE quarter=2"
        ).fetchone()
    assert tuple(q1) == (100, 20, "2025-05-31")
    assert tuple(q2[:5]) == (150, 90, 50, 35, 1.5)
    assert q2[5] == 60.0
    assert q2[6] == "2025-08-31"
