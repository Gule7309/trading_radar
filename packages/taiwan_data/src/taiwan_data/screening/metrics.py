"""Resolve screening periods and derive the four core metrics, with cross-verification.

所有查詢都是整批 SQL；指標值一律取自原始資料表重算，並與來源已提供的衍生欄位交叉比對。
缺資料或無法驗證的股票只會被標示原因，不會被補值。
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from .config import ScreeningConfig, ScreeningError

VERIFIED, PARTIAL, CONFLICT, INSUFFICIENT = "verified", "partial", "conflict", "insufficient"
METRICS = ("revenue_yoy", "operating_margin", "debt_ratio", "avg_turnover_20d")
UNGROUPED_INDUSTRY = None


def add_months(year_month: str, n: int) -> str:
    index = int(year_month[:4]) * 12 + int(year_month[5:7]) - 1 + n
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def quarter_label(code: int) -> str:
    return f"{code // 10}Q{code % 10}"


@dataclass(frozen=True)
class Periods:
    as_of_date: str
    price_as_of: str
    window_dates: tuple[str, ...]  # ascending, exactly turnover_window_days market trading days
    revenue_month: str
    revenue_coverage: float
    financial_quarter: int  # year * 10 + quarter
    financial_coverage: float

    @property
    def financial_label(self) -> str:
        return quarter_label(self.financial_quarter)


@dataclass
class MetricValue:
    value: float | None = None
    status: str = INSUFFICIENT
    inputs: dict[str, Any] = field(default_factory=dict)


@dataclass
class Record:
    stock_id: str
    stock_name: str | None
    market: str | None
    industry: str | None
    is_active: bool
    financial_row: dict[str, Any] | None = None
    metrics: dict[str, MetricValue] = field(default_factory=dict)
    notice_flag: bool = False
    disposition_flag: bool = False
    exclusion_reason: str | None = None
    percentiles: dict[str, float] = field(default_factory=dict)  # growth／profitability／safety
    percentile_scope: str | None = None
    quant_score: float | None = None
    rank: int | None = None


def resolve_periods(conn: sqlite3.Connection, as_of: date, config: ScreeningConfig) -> Periods:
    iso = as_of.isoformat()
    price_as_of = conn.execute(
        "SELECT MAX(trade_date) FROM daily_prices WHERE trade_date <= ?", (iso,)).fetchone()[0]
    if not price_as_of:
        raise ScreeningError(f"{iso} 以前沒有任何行情資料")
    window = [r[0] for r in conn.execute(
        "SELECT DISTINCT trade_date FROM daily_prices WHERE trade_date <= ? "
        "ORDER BY trade_date DESC LIMIT ?", (price_as_of, config.turnover_window_days))]
    if len(window) < config.turnover_window_days:
        raise ScreeningError(f"行情不足 {config.turnover_window_days} 個交易日")

    month, month_coverage = _resolve_revenue_month(conn, as_of, config)
    quarter, quarter_coverage = _resolve_financial_quarter(conn, iso, config)
    return Periods(
        as_of_date=iso, price_as_of=price_as_of, window_dates=tuple(reversed(window)),
        revenue_month=month, revenue_coverage=month_coverage,
        financial_quarter=quarter, financial_coverage=quarter_coverage,
    )


def _resolve_revenue_month(conn: sqlite3.Connection, as_of: date, config: ScreeningConfig):
    # 月 M 的營收在次月 10 日（法定公告期限）起才視為可用，避免前視偏誤。
    cap = add_months(as_of.strftime("%Y-%m"), -1 if as_of.day >= 10 else -2)
    counts = dict(conn.execute(
        "SELECT year_month, COUNT(revenue) FROM monthly_revenue "
        "WHERE year_month BETWEEN ? AND ? GROUP BY year_month",
        (add_months(cap, -config.scan_periods), cap)).fetchall())
    for i in range(config.scan_periods):
        month = add_months(cap, -i)
        previous = counts.get(add_months(month, -1), 0)
        if previous and counts.get(month, 0) / previous >= config.revenue_coverage_threshold:
            return month, counts[month] / previous
    raise ScreeningError(
        f"{cap} 起往前 {config.scan_periods} 個月內沒有營收涵蓋率達 "
        f"{config.revenue_coverage_threshold:.0%} 的月份")


def _resolve_financial_quarter(conn: sqlite3.Connection, iso: str, config: ScreeningConfig):
    rows = conn.execute(
        "SELECT year * 10 + quarter AS q, COUNT(*) FROM quarterly_financials "
        "WHERE statement_type = 'general' AND available_date <= ? "
        "GROUP BY q ORDER BY q DESC LIMIT ?", (iso, config.scan_periods + 1)).fetchall()
    for i in range(len(rows) - 1):
        coverage = rows[i][1] / rows[i + 1][1] if rows[i + 1][1] else 0.0
        if coverage >= config.financial_coverage_threshold:
            return rows[i][0], coverage
    raise ScreeningError(
        f"{iso} 之前沒有財報涵蓋率達 {config.financial_coverage_threshold:.0%} 的季度")


def load_records(
    conn: sqlite3.Connection, periods: Periods, config: ScreeningConfig, as_of: date,
) -> list[Record]:
    iso = periods.as_of_date
    revenue_now = {r[0]: (r[1], r[2]) for r in conn.execute(
        "SELECT stock_id, revenue, yoy_pct FROM monthly_revenue WHERE year_month = ?",
        (periods.revenue_month,))}
    prior_month = add_months(periods.revenue_month, -12)
    revenue_prior = {r[0]: r[1] for r in conn.execute(
        "SELECT stock_id, revenue FROM monthly_revenue WHERE year_month = ?", (prior_month,))}

    financials = {r["stock_id"]: dict(r) for r in conn.execute(
        "SELECT * FROM quarterly_financials WHERE year * 10 + quarter = ? AND available_date <= ?",
        (periods.financial_quarter, iso))}
    earlier = {r[0]: r[1] for r in conn.execute(
        "SELECT stock_id, MAX(statement_type = 'general') FROM quarterly_financials "
        "WHERE year * 10 + quarter < ? AND available_date <= ? GROUP BY stock_id",
        (periods.financial_quarter, iso))}

    turnover = {r[0]: (r[1], r[2]) for r in conn.execute(
        "SELECT stock_id, COUNT(turnover), SUM(turnover) FROM daily_prices "
        "WHERE trade_date BETWEEN ? AND ? GROUP BY stock_id",
        (periods.window_dates[0], periods.window_dates[-1]))}

    disposed = {r[0] for r in conn.execute(
        "SELECT DISTINCT stock_id FROM disposition_events WHERE start_date <= ? AND end_date >= ?",
        (iso, iso))}
    notice_from = (as_of - timedelta(days=config.notice_lookback_days)).isoformat()
    noticed = {r[0] for r in conn.execute(
        "SELECT DISTINCT stock_id FROM notice_events WHERE notice_date BETWEEN ? AND ?",
        (notice_from, iso))}

    records: list[Record] = []
    for row in conn.execute(
            "SELECT stock_id, stock_name, market, industry_code, is_active FROM stocks ORDER BY stock_id"):
        record = Record(
            stock_id=row["stock_id"], stock_name=row["stock_name"], market=row["market"],
            industry=row["industry_code"] or UNGROUPED_INDUSTRY, is_active=bool(row["is_active"]),
            notice_flag=row["stock_id"] in noticed, disposition_flag=row["stock_id"] in disposed,
        )
        record.financial_row = financials.get(record.stock_id)
        reason = _scope_exclusion(record, earlier)
        if reason is None:
            record.metrics = {
                "revenue_yoy": _revenue_yoy(
                    periods.revenue_month, prior_month,
                    revenue_now.get(record.stock_id), revenue_prior.get(record.stock_id),
                    config.yoy_tolerance_pp),
                "operating_margin": _operating_margin(
                    periods.financial_label, record.financial_row, config.margin_tolerance_pp),
                "debt_ratio": _debt_ratio(
                    periods.financial_label, record.financial_row, config.debt_tolerance_pp),
                "avg_turnover_20d": _avg_turnover(
                    periods, turnover.get(record.stock_id), config.turnover_window_days),
            }
            for name in METRICS:
                if record.metrics[name].status != VERIFIED:
                    reason = f"{record.metrics[name].status}:{name}"
                    break
        record.exclusion_reason = reason
        records.append(record)
    return records


def _scope_exclusion(record: Record, earlier: dict[str, int]) -> str | None:
    if not record.is_active:
        return "inactive"
    row = record.financial_row
    if row is not None:
        return None if row["statement_type"] == "general" else "not_general_statement"
    if record.stock_id not in earlier:
        return "missing_financials"
    return "financials_not_common_quarter" if earlier[record.stock_id] else "not_general_statement"


def _difference(computed: float, source: float | None) -> tuple[float | None, float | None]:
    if source is None:
        return None, None
    return source, round(computed - source, 4)


def _classify(computed: float, source: float | None, tolerance: float) -> str:
    if source is None:
        return PARTIAL
    return VERIFIED if abs(computed - source) <= tolerance else CONFLICT


def _revenue_yoy(month, prior_month, current, prior, tolerance) -> MetricValue:
    inputs: dict[str, Any] = {
        "month": month, "priorYearMonth": prior_month, "revenueUnit": "TWD thousand",
        "revenue": current[0] if current else None, "priorYearRevenue": prior,
        "sourceYoYPct": current[1] if current else None,
    }
    if current is None or current[0] is None or prior is None or prior <= 0:
        return MetricValue(None, INSUFFICIENT, inputs)
    computed = (current[0] / prior - 1) * 100
    source, diff = _difference(computed, current[1])
    inputs["differencePp"] = diff
    return MetricValue(round(computed, 4), _classify(computed, source, tolerance), inputs)


def _operating_margin(label, row, tolerance) -> MetricValue:
    income = row.get("operating_income_quarter") if row else None
    revenue = row.get("revenue_quarter") if row else None
    inputs: dict[str, Any] = {
        "quarter": label, "amountUnit": "TWD thousand", "operatingIncomeQuarter": income,
        "revenueQuarter": revenue,
        "sourceOperatingMarginQuarter": row.get("operating_margin_quarter") if row else None,
        "availabilityCutoff": row.get("available_date") if row else None,
    }
    if income is None or revenue is None or revenue <= 0:
        return MetricValue(None, INSUFFICIENT, inputs)
    computed = income / revenue * 100
    source, diff = _difference(computed, inputs["sourceOperatingMarginQuarter"])
    inputs["differencePp"] = diff
    return MetricValue(round(computed, 4), _classify(computed, source, tolerance), inputs)


def _debt_ratio(label, row, tolerance) -> MetricValue:
    liabilities = row.get("total_liabilities") if row else None
    assets = row.get("total_assets") if row else None
    inputs: dict[str, Any] = {
        "quarter": label, "amountUnit": "TWD thousand", "totalLiabilities": liabilities,
        "totalAssets": assets, "sourceDebtRatio": row.get("debt_ratio") if row else None,
        "availabilityCutoff": row.get("available_date") if row else None,
    }
    if liabilities is None or assets is None or assets <= 0:
        return MetricValue(None, INSUFFICIENT, inputs)
    computed = liabilities / assets * 100
    source, diff = _difference(computed, inputs["sourceDebtRatio"])
    inputs["differencePp"] = diff
    return MetricValue(round(computed, 4), _classify(computed, source, tolerance), inputs)


def _avg_turnover(periods: Periods, observed, window_days: int) -> MetricValue:
    days, total = observed if observed else (0, None)
    inputs = {
        "windowStart": periods.window_dates[0], "windowEnd": periods.window_dates[-1],
        "tradingDays": window_days, "observedDays": days, "totalTurnover": total, "currency": "TWD",
    }
    if not days or total is None:
        return MetricValue(None, INSUFFICIENT, inputs)
    status = VERIFIED if days == window_days else PARTIAL
    return MetricValue(round(total / days, 2), status, inputs)
