from taiwan_data.fetchers.market import (
    URL_TPEX_PRICE,
    URL_TWSE_PRICE,
    fetch_latest_stocks_and_prices,
)


class Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class Session:
    def get(self, url, **kwargs):
        if url == URL_TWSE_PRICE:
            return Response([{
                "Code": "2330", "Name": "台積電", "Date": "1151008",
                "OpeningPrice": "100", "HighestPrice": "105", "LowestPrice": "99",
                "ClosingPrice": "104", "Change": "+4", "TradeVolume": "1,000",
                "TradeValue": "104,000",
            }])
        if url == URL_TPEX_PRICE:
            return Response([{
                "SecuritiesCompanyCode": "6488", "CompanyName": "環球晶",
                "Date": "1151008", "Open": "400", "High": "410", "Low": "395",
                "Close": "405", "Change": "5", "TradingShares": "2,000",
                "TransactionAmount": "810,000",
            }])
        raise AssertionError(url)


def test_latest_market_builds_stock_master_and_prices():
    stocks, prices = fetch_latest_stocks_and_prices(Session())
    assert [row["stock_id"] for row in stocks] == ["2330", "6488"]
    assert stocks[0]["stock_name"] == "台積電"
    assert prices[0]["trade_date"].isoformat() == "2026-10-08"
    assert prices[0]["turnover"] == 104000

