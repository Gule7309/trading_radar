"""Evidence: 每個量化數字的來源、期間、抓取時間與計算方式。

Evidence 由 screening 階段的指標推導產生，不修改任何原始資料表。
sourceUrl 只取自 dataset_status 實際記錄的官方端點，不編造；找不到時為 None。
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from .metrics import Periods, Record, VERIFIED

# 輸出用 metric 名稱（camelCase）與內部名稱的對應，順序即 Evidence ID 的配發順序。
METRIC_KEYS: dict[str, str] = {
    "revenue_yoy": "revenueYoY",
    "operating_margin": "operatingMargin",
    "debt_ratio": "debtRatio",
    "avg_turnover_20d": "avgTurnover20d",
}


@dataclass(frozen=True)
class Evidence:
    id: str
    stock_id: str
    metric: str
    claim: str
    value: float
    unit: str
    dataset: str
    source: str
    source_url: str | None
    reference_url: str | None
    data_as_of: str
    window_start: str
    window_end: str
    fetched_at: str | None
    fetched_at_scope: str
    calculation: dict[str, Any]
    verification_status: str


# 每個指標實際做了哪一種驗證；財報兩項沒有第二個獨立來源，必須如實說明，不能稱為交叉驗證。
VERIFICATION_METHODS: dict[str, str] = {
    "revenue_yoy": "以營收重算年增率，並與 MOPS 公布的年增率交叉比對（獨立比對，容差見 config）",
    "operating_margin": "以 MOPS 財報的單季營業利益與單季營收重算，確認輸入完整且與資料表內推導值一致；"
                        "此指標沒有第二個獨立來源可比對",
    "debt_ratio": "以 MOPS 資產負債表的總負債與總資產重算，確認輸入完整且與資料表內推導值一致；"
                  "此指標沒有第二個獨立來源可比對",
    "avg_turnover_20d": "窗口內每個市場交易日都必須有該股成交資料",
}
# 依股票市場挑選官方端點（MOPS 同時服務兩個市場，不需要挑）。
_MARKET_HOSTS = {"TWSE": "twse.com.tw", "TPEX": "tpex.org.tw"}


class SourceRegistry:
    """從 dataset_status 讀取來源端點；fetchedAt 只採用最近一次**成功**的抓取時間。"""

    def __init__(self, conn: sqlite3.Connection):
        self._rows = {r["dataset"]: (r["source"] or "", r["fetched_at"], r["status"]) for r in conn.execute(
            "SELECT dataset, source, fetched_at, status FROM dataset_status")}
        # 失敗或部分失敗的抓取也會更新 dataset_status.fetched_at，所以要另外找最後一次成功的時間。
        self._last_success = dict(conn.execute(
            "SELECT dataset, MAX(finished_at) FROM ingest_runs WHERE status = 'success' GROUP BY dataset"
        ).fetchall())

    def fetched_at(self, dataset: str) -> str | None:
        row = self._rows.get(dataset)
        if row and row[2] == "success":
            return row[1]
        return self._last_success.get(dataset)

    def url(self, dataset: str, *keywords: str, market: str | None = None) -> str | None:
        """第一個含有任一關鍵字的端點；給 market 時只接受該市場網域的端點，找不到回傳 None。"""
        urls = [u for u in (self._rows.get(dataset, ("", None, None))[0]).split(";") if u]
        matches = [u for u in urls if not keywords or any(k in u for k in keywords)]
        if market is not None:
            host = _MARKET_HOSTS.get(market)
            matches = [u for u in matches if host and host in u]
        return matches[0] if matches else None


def build_evidence(
    record: Record, metric: str, evidence_id: str, periods: Periods, registry: SourceRegistry,
) -> Evidence:
    result = record.metrics[metric]
    if result.status != VERIFIED or result.value is None:
        raise ValueError(f"{record.stock_id}.{metric} 不是 verified，不得產生正式 Evidence")
    value, inputs = result.value, dict(result.inputs)
    base = dict(id=evidence_id, stock_id=record.stock_id, metric=METRIC_KEYS[metric],
                value=value, verification_status=result.status)

    if metric == "revenue_yoy":
        direction = "年增" if value >= 0 else "年減"
        return Evidence(
            **base, claim=f"{periods.revenue_month} 月營收{direction} {abs(value):.1f}%", unit="%",
            dataset="monthly_revenue", source="MOPS",
            source_url=registry.url("monthly_revenue"), reference_url=None,
            data_as_of=periods.revenue_month, window_start=inputs["priorYearMonth"],
            window_end=periods.revenue_month, fetched_at=registry.fetched_at("monthly_revenue"),
            fetched_at_scope="dataset",
            calculation={"formula": "revenue(month) / revenue(same month last year) - 1",
                         "method": VERIFICATION_METHODS[metric], "inputs": inputs})

    if metric in ("operating_margin", "debt_ratio"):
        row = record.financial_row or {}
        history = row.get("source_kind") == "mops_historical"
        status_dataset = "quarterly_financials_history" if history else "quarterly_financials"
        if metric == "operating_margin":
            keywords, formula = ("t163sb04", "t187ap06"), "operating_income_quarter / revenue_quarter"
            claim = f"{periods.financial_label} 單季營業利益率 {value:.1f}%"
        else:
            keywords, formula = ("t163sb05", "t187ap07"), "total_liabilities / total_assets"
            claim = f"{periods.financial_label} 負債比 {value:.1f}%"
        source = "MOPS" if history else {"TWSE": "TWSE OpenAPI", "TPEX": "TPEx OpenAPI"}.get(
            record.market or "", "official OpenAPI")
        return Evidence(
            **base, claim=claim, unit="%", dataset="quarterly_financials", source=source,
            source_url=registry.url(status_dataset, *keywords, market=None if history else record.market),
            reference_url=None,
            data_as_of=periods.financial_label, window_start=periods.financial_label,
            window_end=periods.financial_label, fetched_at=row.get("fetched_at"),
            fetched_at_scope="row",
            calculation={"formula": formula, "method": VERIFICATION_METHODS[metric], "inputs": inputs})

    start, end = inputs["windowStart"], inputs["windowEnd"]
    twse = record.market == "TWSE"
    return Evidence(
        **base,
        claim=f"近 {inputs['tradingDays']} 個交易日（{start} 至 {end}）日均成交金額 {value / 1e8:,.1f} 億元",
        unit="TWD", dataset="daily_prices", source="TWSE" if twse else "TPEx",
        source_url=registry.url("market_history", "MI_INDEX" if twse else "dailyQuotes", market=record.market),
        reference_url=None, data_as_of=periods.price_as_of, window_start=start, window_end=end,
        fetched_at=registry.fetched_at("market_history"), fetched_at_scope="dataset",
        calculation={"formula": "AVG(turnover) over the last N market trading days",
                     "method": VERIFICATION_METHODS[metric], "inputs": inputs})
