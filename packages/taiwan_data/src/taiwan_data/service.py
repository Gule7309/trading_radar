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
    fetch_tpex_delisted,
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
from .fetchers.financial_history import SOURCES as FINANCIAL_HISTORY_SOURCES
from .fetchers.financial_history import fetch_historical_financials
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
BACKFILL_START = date(2015, 1, 1)


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
            derived = self.store.recompute_financial_quarters()
            as_of = max(f"{r['year']}-Q{r['quarter']}" for r in rows)
            run.update(row_count=count, as_of_value=as_of)
            return {"rows": count, "derived_rows": derived, "as_of": as_of}

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

    def refresh_disposition(self, *, since: date | None = None, until: date | None = None,
                            delay: float = 0.8) -> dict[str, object]:
        """處置股與注意股（兩市場）。"""
        until = until or taipei_today()
        last = min(filter(None, (
            self.store.max_value("disposition_events", "announce_date"),
            self.store.max_value("notice_events", "notice_date"),
        )), default=None)
        since = since or (
            (date.fromisoformat(last) if last else until) - timedelta(days=EVENT_REFETCH_DAYS)
        )
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
            rows += fetch_tpex_delisted([taipei_today().year], session=self.session)
            count = self.store.upsert("delisted_stocks", rows, ("stock_id",))
            stocks_updated = self.store.apply_delistings()
            names = self.store.fill_stock_names_from_delisted()
            as_of = self.store.max_value("delisted_stocks", "delisting_date")
            run.update(row_count=count, as_of_value=as_of)
        return {"rows": count, "stocks_updated": stocks_updated,
                "historical_names": names, "as_of": as_of}

    def backfill_all(
        self, *, since: date = BACKFILL_START, until: date | None = None,
        delay: float = 0.2,
    ) -> dict[str, object]:
        until = until or taipei_today()
        steps = [
            ("delisted", lambda: self.backfill_delisted(until=until, delay=delay)),
            ("financials", lambda: self.backfill_financials(
                since=since, until=until, delay=delay)),
            ("disposition", lambda: self.backfill_disposition(
                since=since, until=until, delay=delay)),
            ("margin", lambda: self.backfill_margin(
                since=since, until=until, delay=delay)),
            ("institutional", lambda: self.backfill_institutional(
                since=since, until=until, delay=delay)),
        ]
        results: dict[str, object] = {}
        errors: dict[str, str] = {}
        for name, step in steps:
            try:
                result = step()
                results[name] = result
                if result.get("status") == "partial":
                    errors[name] = f"{len(result.get('errors') or [])} 個單位失敗"
            except Exception as exc:
                errors[name] = f"{type(exc).__name__}: {exc}"
        results["errors"] = errors
        return results

    def backfill_financials(
        self, *, since: date = BACKFILL_START, until: date | None = None,
        delay: float = 0.2,
    ) -> dict[str, object]:
        until = until or taipei_today()
        periods = list(_financial_periods(since, until))
        if not periods:
            return {"units": 0, "rows": 0, "derived_rows": 0, "status": "success"}
        dataset = "quarterly_financials_history"
        completed = self.store.successful_checkpoints(dataset)
        rows_written = units = skipped = 0
        errors: list[str] = []
        with self.store.ingest(dataset, FINANCIAL_HISTORY_SOURCES) as run:
            for year, quarter in periods:
                for market in ("TWSE", "TPEX"):
                    unit = f"{year}-Q{quarter}:{market}"
                    if unit in completed:
                        skipped += 1
                        continue
                    try:
                        rows = fetch_historical_financials(
                            year, quarter, market, session=self.session
                        )
                        count = self.store.upsert(
                            "quarterly_financials", rows,
                            ("stock_id", "year", "quarter"),
                        )
                        self.store.set_checkpoint(dataset, unit, "success", row_count=count)
                        rows_written += count
                        units += 1
                    except Exception as exc:
                        message = f"{unit}: {type(exc).__name__}: {exc}"
                        self.store.set_checkpoint(dataset, unit, "failed", error=message)
                        errors.append(message)
                    if delay:
                        time.sleep(delay)
            derived = self.store.recompute_financial_quarters()
            latest_year, latest_quarter = periods[-1]
            as_of = f"{latest_year}-Q{latest_quarter}"
            run.update(
                row_count=rows_written, as_of_value=as_of,
                status="partial" if errors else "success",
                error="\n".join(errors) if errors else None,
            )
        return {
            "units": units, "skipped_units": skipped, "rows": rows_written,
            "derived_rows": derived, "status": "partial" if errors else "success",
            "errors": errors,
        }

    def backfill_disposition(
        self, *, since: date = BACKFILL_START, until: date | None = None,
        delay: float = 0.2,
    ) -> dict[str, object]:
        until = until or taipei_today()
        dataset = "disposition_history"
        completed = self.store.successful_checkpoints(dataset)
        disposition = notice = units = skipped = 0
        errors: list[str] = []
        with self.store.ingest(dataset, DISPOSITION_SOURCES) as run:
            for start, end in _month_chunks(since, until):
                unit = f"{start.isoformat()}:{end.isoformat()}"
                if unit in completed:
                    skipped += 1
                    continue
                try:
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
                        "disposition_events", "announce_date", start, end,
                        disposition_rows, ("stock_id", "start_date", "end_date"),
                    )
                    notice_result = self.store.replace_date_window(
                        "notice_events", "notice_date", start, end,
                        notice_rows, ("stock_id", "notice_date", "reason"),
                    )
                    count = disposition_result["inserted"] + notice_result["inserted"]
                    self.store.set_checkpoint(dataset, unit, "success", row_count=count)
                    disposition += disposition_result["inserted"]
                    notice += notice_result["inserted"]
                    units += 1
                except Exception as exc:
                    message = f"{unit}: {type(exc).__name__}: {exc}"
                    self.store.set_checkpoint(dataset, unit, "failed", error=message)
                    errors.append(message)
            as_of = self.store.max_value("notice_events", "notice_date")
            run.update(
                row_count=disposition + notice, as_of_value=as_of,
                status="partial" if errors else "success",
                error="\n".join(errors) if errors else None,
            )
        return {
            "units": units, "skipped_units": skipped, "disposition": disposition,
            "notice": notice, "as_of": as_of,
            "status": "partial" if errors else "success", "errors": errors,
        }

    def backfill_margin(
        self, *, since: date = BACKFILL_START, until: date | None = None,
        delay: float = 0.2, market: str | None = None,
    ) -> dict[str, object]:
        until = until or taipei_today()
        fetchers = (
            ("TWSE", fetch_twse_margin_by_date),
            ("TPEX", fetch_tpex_margin_by_date),
        )
        if market:
            fetchers = tuple(item for item in fetchers if item[0] == market)
        dates_by_market = {
            market_name: self.store.market_backfill_dates(
                "margin_trading", market_name, since, until
            )
            for market_name, _ in fetchers
        }
        return self._backfill_daily_market_data(
            dataset="margin_history", source=MARGIN_SOURCES, table="margin_trading",
            fetchers=fetchers,
            since=since, until=until, delay=delay, dates_by_market=dates_by_market,
        )

    def backfill_institutional(
        self, *, since: date = BACKFILL_START, until: date | None = None,
        delay: float = 0.2, market: str | None = None,
    ) -> dict[str, object]:
        until = until or taipei_today()
        fetchers = (
            ("TWSE", fetch_twse_institutional),
            ("TPEX", fetch_tpex_institutional_by_date),
        )
        if market:
            fetchers = tuple(item for item in fetchers if item[0] == market)
        detail_columns = (
            "foreign_buy", "foreign_sell", "invest_buy", "invest_sell",
            "dealer_buy", "dealer_sell",
        )
        dates_by_market = {
            market_name: self.store.market_backfill_dates(
                "institutional_trading", market_name, since, until,
                detail_columns=detail_columns,
            )
            for market_name, _ in fetchers
        }
        return self._backfill_daily_market_data(
            dataset="institutional_history", source=INSTITUTIONAL_SOURCES,
            table="institutional_trading",
            fetchers=fetchers,
            since=since, until=until, delay=delay, dates_by_market=dates_by_market,
        )

    def backfill_delisted(
        self, *, until: date | None = None, delay: float = 0.2,
    ) -> dict[str, object]:
        until = until or taipei_today()
        dataset = "delisted_history"
        completed = self.store.successful_checkpoints(dataset)
        rows_written = units = skipped = 0
        errors: list[str] = []
        with self.store.ingest(dataset, DELISTED_SOURCES) as run:
            if "TWSE" in completed:
                skipped += 1
            else:
                try:
                    rows = fetch_twse_delisted(session=self.session)
                    if not rows:
                        raise RuntimeError("TWSE 下市清單回傳 0 筆")
                    count = self.store.upsert("delisted_stocks", rows, ("stock_id",))
                    self.store.set_checkpoint(dataset, "TWSE", "success", row_count=count)
                    rows_written += count
                    units += 1
                except Exception as exc:
                    message = f"TWSE: {type(exc).__name__}: {exc}"
                    self.store.set_checkpoint(dataset, "TWSE", "failed", error=message)
                    errors.append(message)
            for year in range(1994, until.year + 1):
                unit = f"TPEX:{year}"
                if unit in completed:
                    skipped += 1
                    continue
                try:
                    rows = fetch_tpex_delisted([year], session=self.session)
                    count = self.store.upsert("delisted_stocks", rows, ("stock_id",))
                    self.store.set_checkpoint(dataset, unit, "success", row_count=count)
                    rows_written += count
                    units += 1
                except Exception as exc:
                    message = f"{unit}: {type(exc).__name__}: {exc}"
                    self.store.set_checkpoint(dataset, unit, "failed", error=message)
                    errors.append(message)
                if delay:
                    time.sleep(delay)
            stocks_updated = self.store.apply_delistings()
            names = self.store.fill_stock_names_from_delisted()
            as_of = self.store.max_value("delisted_stocks", "delisting_date")
            run.update(
                row_count=rows_written, as_of_value=as_of,
                status="partial" if errors else "success",
                error="\n".join(errors) if errors else None,
            )
        return {
            "units": units, "skipped_units": skipped, "rows": rows_written,
            "stocks_updated": stocks_updated, "historical_names": names, "as_of": as_of,
            "status": "partial" if errors else "success", "errors": errors,
        }

    def _backfill_daily_market_data(
        self, *, dataset: str, source: str, table: str, fetchers,
        since: date, until: date, delay: float, dates_by_market=None,
    ) -> dict[str, object]:
        gap_targeted = dates_by_market is not None
        if dates_by_market is None:
            dates_by_market = {
                market: self.store.trading_dates(since, until) for market, _ in fetchers
            }
        if not any(dates_by_market.values()):
            return {
                "units": 0, "skipped_units": 0, "rows": 0,
                "as_of": self.store.max_value(table, "trade_date"),
                "status": "success", "errors": [],
            }
        completed = self.store.successful_checkpoints(dataset)
        rows_written = units = skipped = 0
        errors: list[str] = []
        with self.store.ingest(dataset, source) as run:
            for market, fetcher in fetchers:
                for trade_date in dates_by_market.get(market, []):
                    unit = f"{trade_date.isoformat()}:{market}"
                    # A date selected by the gap query is authoritative: retry it even if
                    # an older checkpoint says success (the row may later be corrected,
                    # deleted, or still contain legacy NULL detail columns).
                    if not gap_targeted and unit in completed:
                        skipped += 1
                        continue
                    try:
                        rows = _fetch_with_backoff(
                            fetcher, trade_date, session=self.session, delay=delay
                        )
                        count = self.store.upsert(
                            table, rows, ("stock_id", "trade_date")
                        )
                        self.store.set_checkpoint(dataset, unit, "success", row_count=count)
                        rows_written += count
                        units += 1
                    except Exception as exc:
                        message = f"{unit}: {type(exc).__name__}: {exc}"
                        self.store.set_checkpoint(dataset, unit, "failed", error=message)
                        errors.append(message)
                    if delay:
                        time.sleep(delay)
            as_of = self.store.max_value(table, "trade_date")
            run.update(
                row_count=rows_written, as_of_value=as_of,
                status="partial" if errors else "success",
                error="\n".join(errors) if errors else None,
            )
        return {
            "units": units, "skipped_units": skipped, "rows": rows_written,
            "as_of": as_of, "status": "partial" if errors else "success",
            "errors": errors,
        }

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


def _financial_periods(since: date, until: date):
    year = since.year
    quarter = (since.month - 1) // 3 + 1
    while financial_available_date := _financial_available_date(year, quarter):
        if financial_available_date > until:
            break
        yield year, quarter
        quarter += 1
        if quarter == 5:
            year += 1
            quarter = 1


def _financial_available_date(year: int, quarter: int) -> date:
    if quarter == 1:
        return date(year, 5, 31)
    if quarter == 2:
        return date(year, 8, 31)
    if quarter == 3:
        return date(year, 11, 30)
    return date(year + 1, 3, 31)


def _fetch_with_backoff(fetcher, trade_date: date, *, session, delay: float) -> list[dict]:
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            rows = fetcher(trade_date, session=session)
            if not rows:
                raise RuntimeError("官方端點在已知交易日回傳 0 筆")
            return rows
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(max(10.0, delay * 10) * attempt)
    assert last_error is not None
    raise last_error
