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


class SourceRegistry:
    """從 dataset_status 讀取各資料集記錄的來源端點與最近更新時間。"""

    def __init__(self, conn: sqlite3.Connection):
        self._rows = {r["dataset"]: (r["source"] or "", r["fetched_at"]) for r in conn.execute(
            "SELECT dataset, source, fetched_at FROM dataset_status")}

    def fetched_at(self, dataset: str) -> str | None:
        row = self._rows.get(dataset)
        return row[1] if row else None

    def url(self, dataset: str, *keywords: str) -> str | None:
        """第一個含有任一關鍵字的端點；不給關鍵字時取第一個。"""
        urls = [u for u in (self._rows.get(dataset, ("", None))[0]).split(";") if u]
        for url in urls:
            if not keywords or any(k in url for k in keywords):
                return url
        return None


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
            calculation={"formula": "revenue(month) / revenue(same month last year) - 1", "inputs": inputs})

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
            source_url=registry.url(status_dataset, *keywords), reference_url=None,
            data_as_of=periods.financial_label, window_start=periods.financial_label,
            window_end=periods.financial_label, fetched_at=row.get("fetched_at"),
            fetched_at_scope="row", calculation={"formula": formula, "inputs": inputs})

    start, end = inputs["windowStart"], inputs["windowEnd"]
    twse = record.market == "TWSE"
    return Evidence(
        **base,
        claim=f"近 {inputs['tradingDays']} 個交易日（{start} 至 {end}）日均成交金額 {value / 1e8:,.1f} 億元",
        unit="TWD", dataset="daily_prices", source="TWSE" if twse else "TPEx",
        source_url=registry.url("market_history", "MI_INDEX" if twse else "dailyQuotes"),
        reference_url=None, data_as_of=periods.price_as_of, window_start=start, window_end=end,
        fetched_at=registry.fetched_at("market_history"), fetched_at_scope="dataset",
        calculation={"formula": "AVG(turnover) over the last N market trading days", "inputs": inputs})
