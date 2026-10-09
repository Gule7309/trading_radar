from __future__ import annotations

import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import requests

from .db import DataStore
from .fetchers.corporate import (
    COMPANY_SOURCES,
    DELISTED_SOURCES,
    DIVIDEND_SOURCES,
    fetch_company_profiles,
    fetch_tpex_dividends,
    fetch_twse_delisted,
    fetch_twse_dividends,
)
from .fetchers.disposition import SOURCES as DISPOSITION_SOURCES
from .fetchers.disposition import (
    fetch_tpex_disposition,
    fetch_tpex_notice,
    fetch_twse_disposition,
    fetch_twse_notice,
)
from .fetchers.financials import SOURCES as FINANCIAL_SOURCES
from .fetchers.financials import fetch_latest_financials
from .fetchers.market import (
    HISTORY_SOURCES,
    INSTITUTIONAL_SOURCES,
    PRICE_SOURCES,
    fetch_latest_stocks_and_prices,
    fetch_tpex_institutional_by_date,
    fetch_tpex_prices_by_date,
    fetch_twse_institutional,
    fetch_twse_prices_by_date,
)
from .fetchers.margin import SOURCES as MARGIN_SOURCES
from .fetchers.margin import fetch_tpex_margin_by_date, fetch_twse_margin_by_date
from .fetchers.revenue import (
    SOURCE as REVENUE_SOURCE,
    fetch_month,
    iter_months,
    latest_published_month,
    month_after,
)

TAIPEI = ZoneInfo("Asia/Taipei")
# 處置／注意公告可能事後更正，每次往回重抓這段期間；upsert 不會產生重複。
EVENT_REFETCH_DAYS = 14
# 除權息事件同上；官方查詢以月為安全粒度。
DIVIDEND_REFETCH_DAYS = 14


class RefreshService:
    def __init__(self, store: DataStore, *, session=None):
        self.store = store
        self.session = session or requests.Session()
        self.store.ensure_schema()

    def refresh_all(self, *, since: date | None = None, until: date | None = None,
                    delay: float = 0.8, lookback_days: int = 0) -> dict[str, object]:
        """依序更新所有資料集；單一資料集失敗只記錄在 errors，不阻斷其他資料集。"""
        steps = [
            ("market", lambda: self.refresh_market(
                since=since, until=until, delay=delay, lookback_days=lookback_days)),
            ("stocks", self.refresh_stocks_and_latest_prices),
            ("revenue", lambda: self.refresh_revenue(delay=delay)),
            ("financials", self.refresh_financials),
            ("margin", lambda: self.refresh_margin(
                since=since, until=until, delay=delay, lookback_days=lookback_days)),
            ("dividends", lambda: self.refresh_dividends(until=until, delay=delay)),
            ("disposition", lambda: self.refresh_disposition(until=until, delay=delay)),
            ("delisted", self.refresh_delisted),
            ("industries", self.refresh_industries),
        ]
        results: dict[str, object] = {}
        errors: dict[str, str] = {}
        for name, step in steps:
            try:
                result = step()
                results[name] = result
                if isinstance(result, dict) and result.get("status") == "partial":
                    details = result.get("partial_days") or result.get("error") or "partial result"
                    errors[name] = f"partial: {details}"
            except Exception as exc:
                errors[name] = f"{type(exc).__name__}: {exc}"
        results["errors"] = errors
        return results

    def refresh_stocks_and_latest_prices(self) -> dict[str, object]:
        with self.store.ingest("stocks_and_latest_prices", PRICE_SOURCES) as run:
            stocks, prices = fetch_latest_stocks_and_prices(session=self.session)
            if not stocks or not prices:
                raise RuntimeError("官方最近交易日端點未回傳股票 master／行情")
            stock_count = self.store.upsert("stocks", stocks, ("stock_id",))
            historical_names = self.store.fill_stock_names_from_delisted()
            price_count = self.store.upsert("daily_prices", prices, ("stock_id", "trade_date"))
            as_of = max(str(row["trade_date"]) for row in prices)
            run.update(row_count=stock_count + price_count, as_of_value=as_of)
            return {"stocks": stock_count, "historical_names": historical_names,
                    "prices": price_count, "as_of": as_of}

    def refresh_market(
        self, *, since: date | None = None, until: date | None = None, delay: float = 0.8,
        lookback_days: int = 0,
    ) -> dict[str, object]:
        until = until or taipei_today()
        since = since or _resume_date(
            self.store.max_value("daily_prices", "trade_date"), until, lookback_days
        )
        if since > until:
            return {"days": 0, "prices": 0, "institutional": 0,
                    "as_of": self.store.max_value("daily_prices", "trade_date")}

        total_prices = total_institutional = processed_days = 0
        partial_days: list[str] = []
        source = f"{HISTORY_SOURCES};{INSTITUTIONAL_SOURCES}"
        with self.store.ingest("market_history", source) as run:
            current = since
            while current <= until:
                if current.weekday() >= 5:
                    current += timedelta(days=1)
                    continue

                market_prices: list[dict] = []
                failures = []
                for market, fetcher in (
                    ("TWSE", fetch_twse_prices_by_date),
                    ("TPEX", fetch_tpex_prices_by_date),
                ):
                    try:
                        rows = fetcher(current, session=self.session)
                        market_prices.extend(rows)
                    except Exception as exc:
                        failures.append(f"{market} price: {exc}")

                # Both empty normally means a public holiday. A transport failure is not a holiday.
                if not market_prices:
                    if failures:
                        partial_days.append(f"{current}: {' | '.join(failures)}")
                    current += timedelta(days=1)
                    if delay:
                        time.sleep(delay)
                    continue

                total_prices += self.store.upsert(
                    "daily_prices", market_prices, ("stock_id", "trade_date")
                )
                institutional: list[dict] = []
                for market, fetcher in (
                    ("TWSE", fetch_twse_institutional),
                    ("TPEX", fetch_tpex_institutional_by_date),
                ):
                    try:
                        institutional.extend(fetcher(current, session=self.session))
                    except Exception as exc:
                        failures.append(f"{market} institutional: {exc}")
                if institutional:
                    total_institutional += self.store.upsert(
                        "institutional_trading", institutional, ("stock_id", "trade_date")
                    )
                if failures:
                    partial_days.append(f"{current}: {' | '.join(failures)}")
                processed_days += 1
                current += timedelta(days=1)
                if delay:
                    time.sleep(delay)

            as_of = self.store.max_value("daily_prices", "trade_date")
            run.update(
                row_count=total_prices + total_institutional,
                as_of_value=as_of,
                status="partial" if partial_days else "success",
                error="\n".join(partial_days) if partial_days else None,
            )
        return {
            "days": processed_days, "prices": total_prices,
            "institutional": total_institutional,
            "as_of": self.store.max_value("daily_prices", "trade_date"),
            "status": "partial" if partial_days else "success",
            "partial_days": partial_days,
        }

    def refresh_revenue(self, *, delay: float = 0.5) -> dict[str, object]:
        end = latest_published_month()
        last = self.store.max_value("monthly_revenue", "year_month")
        start = month_after(last) if last else end
        # If already current, re-fetch the latest month because MOPS may revise it.
        if start > end:
            start = end
        total = 0
        with self.store.ingest("monthly_revenue", REVENUE_SOURCE) as run:
            for year, month in iter_months(start, end):
                rows = fetch_month(year, month, session=self.session)
                if not rows:
                    raise RuntimeError(f"MOPS {year:04d}-{month:02d} 回傳 0 筆")
                stock_rows = [
                    {"stock_id": row["stock_id"], "stock_name": row["stock_name"]}
                    for row in rows if row.get("stock_name")
                ]
                if stock_rows:
                    self.store.upsert("stocks", stock_rows, ("stock_id",))
                revenue_rows = [
                    {key: value for key, value in row.items() if key != "stock_name"}
                    for row in rows
                ]
                total += self.store.upsert(
                    "monthly_revenue", revenue_rows, ("stock_id", "year_month")
                )
                if delay:
                    time.sleep(delay)
            as_of = self.store.max_value("monthly_revenue", "year_month")
            run.update(row_count=total, as_of_value=as_of)
        return {"rows": total, "as_of": self.store.max_value("monthly_revenue", "year_month")}

    def refresh_financials(self) -> dict[str, object]:
        with self.store.ingest("quarterly_financials", FINANCIAL_SOURCES) as run:
            rows = fetch_latest_financials(session=self.session)
            if not rows:
                raise RuntimeError("官方財報 OpenAPI 回傳 0 筆")
            count = self.store.upsert(
                "quarterly_financials", rows, ("stock_id", "year", "quarter")
            )
            as_of = max(f"{r['year']}-Q{r['quarter']}" for r in rows)
            run.update(row_count=count, as_of_value=as_of)
            return {"rows": count, "as_of": as_of}

    def refresh_margin(
        self, *, since: date | None = None, until: date | None = None, delay: float = 0.8,
        lookback_days: int = 0,
    ) -> dict[str, object]:
        until = until or taipei_today()
        since = since or _resume_date(
            self.store.max_value("margin_trading", "trade_date"), until, lookback_days
        )
        total = processed_days = 0
        partial_days: list[str] = []
        with self.store.ingest("margin_trading", MARGIN_SOURCES) as run:
            for current in _weekdays(since, until):
                rows: list[dict] = []
                failures = []
                for market, fetcher in (
                    ("TWSE", fetch_twse_margin_by_date),
                    ("TPEX", fetch_tpex_margin_by_date),
                ):
                    try:
                        rows.extend(fetcher(current, session=self.session))
                    except Exception as exc:
                        failures.append(f"{market} margin: {exc}")
                if failures:
                    partial_days.append(f"{current}: {' | '.join(failures)}")
                if rows:
                    total += self.store.upsert("margin_trading", rows, ("stock_id", "trade_date"))
                    processed_days += 1
                if delay:
                    time.sleep(delay)
            as_of = self.store.max_value("margin_trading", "trade_date")
            run.update(
                row_count=total, as_of_value=as_of,
                status="partial" if partial_days else "success",
                error="\n".join(partial_days) if partial_days else None,
            )
        return {"days": processed_days, "rows": total, "as_of": as_of,
                "status": "partial" if partial_days else "success",
                "partial_days": partial_days}

    def refresh_dividends(self, *, until: date | None = None,
                          delay: float = 0.8) -> dict[str, object]:
        until = until or taipei_today()
        last = self.store.max_value("dividend_events", "ex_date")
        since = (date.fromisoformat(last) - timedelta(days=DIVIDEND_REFETCH_DAYS)
                 if last else until - timedelta(days=DIVIDEND_REFETCH_DAYS))
        total = 0
        deleted = 0
        with self.store.ingest("dividend_events", DIVIDEND_SOURCES) as run:
            for start, end in _month_chunks(since, until):
                rows = fetch_twse_dividends(start, end, session=self.session)
                if delay:
                    time.sleep(delay)
                rows += fetch_tpex_dividends(start, end, session=self.session)
                replaced = self.store.replace_date_window(
                    "dividend_events", "ex_date", start, end, rows,
                    ("stock_id", "ex_date"),
                )
                total += replaced["inserted"]
                deleted += replaced["deleted"]
                if delay:
                    time.sleep(delay)
            as_of = self.store.max_value("dividend_events", "ex_date")
            run.update(row_count=total, as_of_value=as_of)
        return {"rows": total, "deleted": deleted, "as_of": as_of}

    def refresh_disposition(self, *, until: date | None = None,
                            delay: float = 0.8) -> dict[str, object]:
        """處置股與注意股（兩市場）。"""
        until = until or taipei_today()
        last = min(filter(None, (
            self.store.max_value("disposition_events", "announce_date"),
            self.store.max_value("notice_events", "notice_date"),
        )), default=None)
        since = (date.fromisoformat(last) if last else until) - timedelta(days=EVENT_REFETCH_DAYS)
        disposition = notice = disposition_deleted = notice_deleted = 0
        with self.store.ingest("disposition_events", DISPOSITION_SOURCES) as run:
            for start, end in _month_chunks(since, until):
                disposition_rows = []
                notice_rows = []
                for fetcher in (fetch_twse_disposition, fetch_tpex_disposition):
                    disposition_rows.extend(fetcher(start, end, session=self.session))
                    if delay:
                        time.sleep(delay)
                for fetcher in (fetch_twse_notice, fetch_tpex_notice):
                    notice_rows.extend(fetcher(start, end, session=self.session))
                    if delay:
                        time.sleep(delay)
                disposition_result = self.store.replace_date_window(
                    "disposition_events", "announce_date", start, end, disposition_rows,
                    ("stock_id", "start_date", "end_date"),
                )
                notice_result = self.store.replace_date_window(
                    "notice_events", "notice_date", start, end, notice_rows,
                    ("stock_id", "notice_date", "reason"),
                )
                disposition += disposition_result["inserted"]
                notice += notice_result["inserted"]
                disposition_deleted += disposition_result["deleted"]
                notice_deleted += notice_result["deleted"]
            as_of = self.store.max_value("notice_events", "notice_date")
            run.update(row_count=disposition + notice, as_of_value=as_of)
        return {
            "disposition": disposition,
            "notice": notice,
            "disposition_deleted": disposition_deleted,
            "notice_deleted": notice_deleted,
            "as_of": as_of,
        }

    def refresh_delisted(self) -> dict[str, object]:
        with self.store.ingest("delisted_stocks", DELISTED_SOURCES) as run:
            rows = fetch_twse_delisted(session=self.session)
            if not rows:
                raise RuntimeError("TWSE 下市清單回傳 0 筆")
            count = self.store.upsert("delisted_stocks", rows, ("stock_id",))
            stocks_updated = self.store.apply_delistings()
            names = self.store.fill_stock_names_from_delisted()
            as_of = self.store.max_value("delisted_stocks", "delisting_date")
            run.update(row_count=count, as_of_value=as_of)
        return {"rows": count, "stocks_updated": stocks_updated,
                "historical_names": names, "as_of": as_of}

    def refresh_industries(self) -> dict[str, object]:
        with self.store.ingest("stock_profiles", COMPANY_SOURCES) as run:
            profiles = fetch_company_profiles(session=self.session)
            if not profiles:
                raise RuntimeError("官方公司基本資料回傳 0 筆")
            unmapped = sorted({
                str(p["official_industry_code"]) for p in profiles
                if p["official_industry_code"] and not p["industry_name"]
            })
            counts = self.store.fill_stock_profiles(profiles, "official_company_profile")
            as_of = taipei_today().isoformat()
            run.update(
                row_count=sum(counts.values()), as_of_value=as_of,
                error=f"未對應的產業代碼：{','.join(unmapped)}" if unmapped else None,
            )
        return {"profiles": len(profiles), **counts, "unmapped_industry_codes": unmapped}


def taipei_today() -> date:
    return datetime.now(TAIPEI).date()


def _resume_date(last: str | None, until: date, lookback_days: int) -> date:
    """從資料庫最後一天的隔天續抓；lookback_days 讓排程重抓近幾天，補回暫時性失敗的缺口。"""
    resume = date.fromisoformat(last) + timedelta(days=1) if last else until
    if lookback_days > 0:
        resume = min(resume, until - timedelta(days=lookback_days))
    return resume


def _weekdays(since: date, until: date):
    current = since
    while current <= until:
        if current.weekday() < 5:
            yield current
        current += timedelta(days=1)


def _month_chunks(since: date, until: date):
    start = since
    while start <= until:
        next_month = date(start.year + start.month // 12, start.month % 12 + 1, 1)
        end = min(next_month - timedelta(days=1), until)
        yield start, end
        start = next_month
