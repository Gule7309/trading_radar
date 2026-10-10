from datetime import date

from taiwan_data.fetchers.market import (
    URL_TPEX_INSTITUTIONAL_BY_DATE,
    URL_TPEX_PRICE,
    URL_TWSE_INSTITUTIONAL,
    URL_TWSE_PRICE,
    fetch_tpex_institutional_by_date,
    fetch_twse_institutional,
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


def test_institutional_parsers_support_2015_formats():
    class OldSession:
        def get(self, url, **kwargs):
            if url == URL_TWSE_INSTITUTIONAL:
                return Response({
                    "stat": "OK",
                    "fields": [
                        "證券代號", "證券名稱", "外資買進股數", "外資賣出股數",
                        "外資買賣超股數", "投信買進股數", "投信賣出股數",
                        "投信買賣超股數", "自營商買賣超股數",
                        "自營商買進股數(自行買賣)", "自營商賣出股數(自行買賣)",
                        "自營商買賣超股數(自行買賣)", "自營商買進股數(避險)",
                        "自營商賣出股數(避險)", "自營商買賣超股數(避險)",
                        "三大法人買賣超股數",
                    ],
                    "data": [[
                        "2330", "台積電", "100", "20", "80", "30", "10", "20",
                        "12", "5", "2", "3", "10", "1", "9", "112",
                    ]],
                })
            if url == URL_TPEX_INSTITUTIONAL_BY_DATE:
                return Response({"stat": "ok", "tables": [
                    {"data": []},
                    {"data": [[
                        "6488", "環球晶", "100", "40", "60", "20", "5", "15",
                        "4", "2", "1", "1", "5", "2", "3", "79",
                    ]]},
                ]})
            raise AssertionError(url)

    session = OldSession()
    twse = fetch_twse_institutional(date(2015, 1, 5), session=session)[0]
    tpex = fetch_tpex_institutional_by_date(date(2015, 1, 5), session=session)[0]
    assert (twse["foreign_buy"], twse["dealer_buy"], twse["total_net"]) == (100, 15, 112)
    assert (tpex["foreign_buy"], tpex["dealer_buy"], tpex["total_net"]) == (100, 7, 79)

