from taiwan_data.fetchers.revenue import fetch_month, latest_published_month
from datetime import date


HTML = """
<table><tr>
<td>2330</td><td>台積電</td><td>13,382,706</td><td>x</td><td>x</td><td>6.11</td><td>32.39</td>
</tr></table>
"""


class Response:
    text = HTML
    encoding = None

    def raise_for_status(self):
        return None


class Session:
    def get(self, url, **kwargs):
        return Response()


def test_revenue_parser_and_publish_cutoff():
    rows = fetch_month(2026, 8, Session())
    assert len(rows) == 2  # fixture is returned once for sii and once for otc; upsert will deduplicate
    assert rows[0]["stock_name"] == "台積電"
    assert rows[0]["revenue"] == 13_382_706
    assert rows[0]["yoy_pct"] == 32.39
    assert latest_published_month(date(2026, 10, 9)) == (2026, 8)
    assert latest_published_month(date(2026, 10, 11)) == (2026, 9)
