from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import closing, contextmanager
from datetime import date, datetime
from importlib.resources import files
from pathlib import Path
from typing import Iterable, Iterator, Mapping, Sequence
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
DEFAULT_DB_ENV = "TAIWAN_DATA_DB"
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def now_iso() -> str:
    return datetime.now(TAIPEI).isoformat(timespec="seconds")


class DataStore:
    """Small SQLite repository used by bootstrap and refresh commands."""

    def __init__(self, path: str | os.PathLike[str] | None = None):
        raw = path or os.getenv(DEFAULT_DB_ENV)
        if not raw:
            raise ValueError(f"請用 --db 或 {DEFAULT_DB_ENV} 指定 SQLite 路徑")
        self.path = Path(raw).expanduser().resolve()

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=60)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=60000")
        return conn

    def ensure_schema(self) -> None:
        schema = files("taiwan_data").joinpath("schema.sql").read_text(encoding="utf-8")
        with closing(self.connect()) as conn:
            conn.executescript(schema)
            # research.db 的舊 institutional_trading 只有三個 net 欄位；保留資料並原地補欄。
            self._ensure_columns(conn, "institutional_trading", {
                "foreign_buy": "INTEGER", "foreign_sell": "INTEGER",
                "invest_buy": "INTEGER", "invest_sell": "INTEGER",
                "dealer_buy": "INTEGER", "dealer_sell": "INTEGER",
                "dealer_net": "INTEGER",
            })
            self._ensure_columns(conn, "quarterly_financials", {
                "revenue_quarter": "INTEGER",
                "gross_profit_quarter": "INTEGER",
                "operating_income_quarter": "INTEGER",
                "net_income_quarter": "INTEGER",
                "eps_quarter": "REAL",
                "gross_margin_quarter": "REAL",
                "operating_margin_quarter": "REAL",
                "roe_quarter": "REAL",
                "roa_quarter": "REAL",
                "available_date": "TEXT",
                "statement_type": "TEXT",
                "source_kind": "TEXT",
            })
            conn.commit()

    @staticmethod
    def _ensure_columns(
        conn: sqlite3.Connection, table: str, definitions: Mapping[str, str]
    ) -> None:
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info([{table}])")}
        for name, sql_type in definitions.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE [{table}] ADD COLUMN [{name}] {sql_type}")

    def scalar(self, sql: str, params: Sequence[object] = ()):
        with closing(self.connect()) as conn:
            row = conn.execute(sql, params).fetchone()
            return row[0] if row else None

    def max_value(self, table: str, column: str):
        self._check_identifier(table)
        self._check_identifier(column)
        return self.scalar(f"SELECT MAX([{column}]) FROM [{table}]")

    def fill_stock_names_from_delisted(self) -> int:
        with closing(self.connect()) as conn:
            cursor = conn.execute(
                "UPDATE stocks SET stock_name=("
                "SELECT d.stock_name FROM delisted_stocks d WHERE d.stock_id=stocks.stock_id"
                ") WHERE (stock_name IS NULL OR stock_name='') AND EXISTS ("
                "SELECT 1 FROM delisted_stocks d WHERE d.stock_id=stocks.stock_id "
                "AND d.stock_name IS NOT NULL AND d.stock_name<>'')"
            )
            conn.commit()
            return cursor.rowcount

    def apply_delistings(self) -> int:
        """把 delisted_stocks 反映到 stocks：缺的補登為 inactive，下市日後已無行情者標記下市。"""
        with closing(self.connect()) as conn:
            conn.execute(
                "INSERT INTO stocks (stock_id, stock_name, market, delisting_date, is_active) "
                "SELECT d.stock_id, d.stock_name, d.market, d.delisting_date, 0 "
                "FROM delisted_stocks d WHERE NOT EXISTS ("
                "SELECT 1 FROM stocks s WHERE s.stock_id=d.stock_id)"
            )
            inserted = conn.execute("SELECT changes()").fetchone()[0]
            # 代號可能被新公司沿用：下市日之後仍有成交的，不覆寫成下市。
            cursor = conn.execute(
                "UPDATE stocks SET delisting_date=d.delisting_date, is_active=0, "
                "updated_at=CURRENT_TIMESTAMP "
                "FROM delisted_stocks d WHERE d.stock_id=stocks.stock_id "
                "AND d.delisting_date IS NOT NULL "
                "AND (stocks.delisting_date IS NOT d.delisting_date OR stocks.is_active<>0) "
                "AND NOT EXISTS (SELECT 1 FROM daily_prices p WHERE p.stock_id=stocks.stock_id "
                "AND p.trade_date>=d.delisting_date)"
            )
            conn.commit()
            return inserted + cursor.rowcount

    def fill_stock_profiles(self, profiles: Iterable[Mapping[str, object]],
                            source: str) -> dict[str, int]:
        """只補空值：既有（舊 snapshot）的產業分類、上市日期與市場不覆寫。"""
        rows = [
            (
                str(p["stock_id"]), p.get("stock_name"), p.get("industry_name"),
                _sqlite_value(p.get("listing_date")), p.get("market"),
            )
            for p in profiles
        ]
        with closing(self.connect()) as conn:
            conn.execute("CREATE TEMP TABLE profile_import "
                         "(stock_id TEXT PRIMARY KEY, stock_name TEXT, industry TEXT, "
                         "listing_date TEXT, market TEXT)")
            conn.executemany("INSERT OR REPLACE INTO profile_import VALUES (?, ?, ?, ?, ?)", rows)
            counts = {}
            conn.execute(
                "INSERT OR IGNORE INTO industries (industry_code, name_zh, source) "
                "SELECT DISTINCT industry, industry, ? FROM profile_import WHERE industry IS NOT NULL",
                (source,),
            )
            counts["industries"] = conn.execute("SELECT changes()").fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO stock_industry_map (stock_id, industry_code) "
                "SELECT p.stock_id, p.industry FROM profile_import p "
                "WHERE p.industry IS NOT NULL AND NOT EXISTS ("
                "SELECT 1 FROM stock_industry_map m WHERE m.stock_id=p.stock_id)"
            )
            counts["stock_industry_map"] = conn.execute("SELECT changes()").fetchone()[0]
            cursor = conn.execute(
                "UPDATE stocks SET "
                "stock_name=COALESCE(stocks.stock_name, p.stock_name), "
                "industry_code=COALESCE(stocks.industry_code, p.industry), "
                "listing_date=COALESCE(stocks.listing_date, p.listing_date), "
                "market=COALESCE(stocks.market, p.market), updated_at=CURRENT_TIMESTAMP "
                "FROM profile_import p WHERE p.stock_id=stocks.stock_id AND ("
                "(stocks.stock_name IS NULL AND p.stock_name IS NOT NULL) OR "
                "(stocks.industry_code IS NULL AND p.industry IS NOT NULL) OR "
                "(stocks.listing_date IS NULL AND p.listing_date IS NOT NULL) OR "
                "(stocks.market IS NULL AND p.market IS NOT NULL))"
            )
            counts["stocks"] = cursor.rowcount
            conn.execute("DROP TABLE profile_import")
            conn.commit()
        return counts

    def upsert(
        self,
        table: str,
        rows: Iterable[Mapping[str, object]],
        key_columns: Sequence[str],
        *,
        batch_size: int = 5_000,
    ) -> int:
        self._check_identifier(table)
        materialized = iter(rows)
        first = next(materialized, None)
        if first is None:
            return 0

        columns = list(first.keys())
        if not columns or any(not _IDENTIFIER.fullmatch(c) for c in columns):
            raise ValueError("欄位名稱不合法")
        if any(k not in columns for k in key_columns):
            raise ValueError(f"{table} upsert 缺少 key 欄位")

        with closing(self.connect()) as conn:
            actual = {r[1] for r in conn.execute(f"PRAGMA table_info([{table}])")}
            unknown = set(columns) - actual
            if unknown:
                raise ValueError(f"{table} 不存在欄位：{sorted(unknown)}")

            quoted = ",".join(f"[{c}]" for c in columns)
            placeholders = ",".join("?" for _ in columns)
            conflict = ",".join(f"[{c}]" for c in key_columns)
            updates = ",".join(
                f"[{c}]=excluded.[{c}]" for c in columns if c not in key_columns
            )
            action = f"DO UPDATE SET {updates}" if updates else "DO NOTHING"
            sql = (
                f"INSERT INTO [{table}] ({quoted}) VALUES ({placeholders}) "
                f"ON CONFLICT ({conflict}) {action}"
            )

            count = 0
            batch: list[tuple[object, ...]] = []
            for row in _prepend(first, materialized):
                if list(row.keys()) != columns:
                    raise ValueError(f"{table} 每列欄位順序必須一致")
                batch.append(tuple(_sqlite_value(row[c]) for c in columns))
                if len(batch) >= batch_size:
                    conn.executemany(sql, batch)
                    count += len(batch)
                    batch.clear()
            if batch:
                conn.executemany(sql, batch)
                count += len(batch)
            conn.commit()
        return count

    def replace_rows(
        self, table: str, rows: Iterable[Mapping[str, object]], *, batch_size: int = 5_000
    ) -> int:
        """For immutable snapshot tables whose source file is authoritative."""
        self._check_identifier(table)
        materialized = list(rows)
        if not materialized:
            return 0
        columns = list(materialized[0].keys())
        quoted = ",".join(f"[{c}]" for c in columns)
        placeholders = ",".join("?" for _ in columns)
        sql = f"INSERT OR REPLACE INTO [{table}] ({quoted}) VALUES ({placeholders})"
        with closing(self.connect()) as conn:
            for start in range(0, len(materialized), batch_size):
                batch = materialized[start:start + batch_size]
                conn.executemany(
                    sql, [tuple(_sqlite_value(r[c]) for c in columns) for r in batch]
                )
            conn.commit()
        return len(materialized)

    def replace_date_window(
        self,
        table: str,
        date_column: str,
        start,
        end,
        rows: Iterable[Mapping[str, object]],
        key_columns: Sequence[str],
    ) -> dict[str, int]:
        """Atomically replace an authoritative date window, including deletions/corrections."""
        self._check_identifier(table)
        self._check_identifier(date_column)
        materialized = list(rows)

        columns: list[str] = []
        sql: str | None = None
        if materialized:
            columns = list(materialized[0].keys())
            if not columns or any(not _IDENTIFIER.fullmatch(c) for c in columns):
                raise ValueError("欄位名稱不合法")
            if any(k not in columns for k in key_columns):
                raise ValueError(f"{table} upsert 缺少 key 欄位")
            if any(list(row.keys()) != columns for row in materialized):
                raise ValueError(f"{table} 每列欄位順序必須一致")

        with closing(self.connect()) as conn:
            actual = {r[1] for r in conn.execute(f"PRAGMA table_info([{table}])")}
            if date_column not in actual:
                raise ValueError(f"{table} 不存在日期欄位：{date_column}")
            unknown = set(columns) - actual
            if unknown:
                raise ValueError(f"{table} 不存在欄位：{sorted(unknown)}")

            cursor = conn.execute(
                f"DELETE FROM [{table}] WHERE [{date_column}] BETWEEN ? AND ?",
                (_sqlite_value(start), _sqlite_value(end)),
            )
            deleted = cursor.rowcount

            if materialized:
                quoted = ",".join(f"[{c}]" for c in columns)
                placeholders = ",".join("?" for _ in columns)
                conflict = ",".join(f"[{c}]" for c in key_columns)
                updates = ",".join(
                    f"[{c}]=excluded.[{c}]" for c in columns if c not in key_columns
                )
                action = f"DO UPDATE SET {updates}" if updates else "DO NOTHING"
                sql = (
                    f"INSERT INTO [{table}] ({quoted}) VALUES ({placeholders}) "
                    f"ON CONFLICT ({conflict}) {action}"
                )
                conn.executemany(
                    sql,
                    [tuple(_sqlite_value(row[c]) for c in columns) for row in materialized],
                )
            conn.commit()
        return {"deleted": deleted, "inserted": len(materialized)}

    def successful_checkpoints(self, dataset: str) -> set[str]:
        with closing(self.connect()) as conn:
            return {
                str(row[0]) for row in conn.execute(
                    "SELECT unit_key FROM backfill_checkpoints "
                    "WHERE dataset=? AND status='success'",
                    (dataset,),
                )
            }

    def set_checkpoint(
        self, dataset: str, unit_key: str, status: str, *, row_count: int = 0,
        error: str | None = None,
    ) -> None:
        if status not in {"success", "failed"}:
            raise ValueError(f"不合法的 checkpoint 狀態：{status}")
        with closing(self.connect()) as conn:
            conn.execute(
                "INSERT INTO backfill_checkpoints "
                "(dataset, unit_key, status, row_count, error, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(dataset, unit_key) DO UPDATE SET "
                "status=excluded.status, row_count=excluded.row_count, "
                "error=excluded.error, updated_at=excluded.updated_at",
                (dataset, unit_key, status, row_count, error, now_iso()),
            )
            conn.commit()

    def trading_dates(self, since: date, until: date) -> list[date]:
        with closing(self.connect()) as conn:
            rows = conn.execute(
                "SELECT DISTINCT trade_date FROM daily_prices "
                "WHERE trade_date BETWEEN ? AND ? ORDER BY trade_date",
                (since.isoformat(), until.isoformat()),
            ).fetchall()
        return [date.fromisoformat(str(row[0])) for row in rows]

    def market_backfill_dates(
        self, table: str, market: str, since: date, until: date,
        *, detail_columns: Sequence[str] = (),
    ) -> list[date]:
        """Trading dates where a market is absent or still has NULL detail fields."""
        self._check_identifier(table)
        for column in detail_columns:
            self._check_identifier(column)
        detail_expression = "0"
        if detail_columns:
            conditions = " OR ".join(f"t.[{column}] IS NULL" for column in detail_columns)
            detail_expression = f"MAX(CASE WHEN {conditions} THEN 1 ELSE 0 END)"
        sql = (
            "WITH market_dates AS ("
            "SELECT DISTINCT p.trade_date FROM daily_prices p "
            "JOIN stocks ps ON ps.stock_id=p.stock_id "
            "WHERE p.trade_date BETWEEN ? AND ? AND ps.market=?), "
            "existing AS ("
            "SELECT t.trade_date, COUNT(*) AS rows, " + detail_expression + " AS has_null "
            "FROM [" + table + "] t JOIN stocks ts ON ts.stock_id=t.stock_id "
            "WHERE t.trade_date BETWEEN ? AND ? AND ts.market=? GROUP BY t.trade_date) "
            "SELECT d.trade_date FROM market_dates d LEFT JOIN existing e USING(trade_date) "
            "WHERE e.rows IS NULL OR e.has_null=1 ORDER BY d.trade_date"
        )
        params: list[object] = [
            since.isoformat(), until.isoformat(), market,
            since.isoformat(), until.isoformat(), market,
        ]
        with closing(self.connect()) as conn:
            rows = conn.execute(sql, params).fetchall()
        return [date.fromisoformat(str(row[0])) for row in rows]

    def recompute_financial_quarters(self) -> int:
        """Derive true single-quarter values without changing cumulative source fields."""
        with closing(self.connect()) as conn:
            rows = conn.execute(
                "SELECT stock_id, year, quarter, revenue, gross_profit, "
                "operating_income, net_income, eps, total_assets, equity, available_date "
                "FROM quarterly_financials ORDER BY stock_id, year, quarter"
            ).fetchall()
            by_period = {
                (str(row["stock_id"]), int(row["year"]), int(row["quarter"])): row
                for row in rows
            }
            updates = []
            for row in rows:
                stock_id = str(row["stock_id"])
                year = int(row["year"])
                quarter = int(row["quarter"])
                previous = by_period.get((stock_id, year, quarter - 1))

                values = []
                for column in ("revenue", "gross_profit", "operating_income", "net_income", "eps"):
                    current_value = row[column]
                    if quarter == 1:
                        values.append(current_value)
                    elif previous is not None and current_value is not None and previous[column] is not None:
                        values.append(current_value - previous[column])
                    else:
                        values.append(None)
                revenue, gross_profit, operating_income, net_income, eps = values
                gross_margin = _ratio(gross_profit, revenue)
                operating_margin = _ratio(operating_income, revenue)
                roe = _ratio(net_income, row["equity"])
                roa = _ratio(net_income, row["total_assets"])
                available = row["available_date"] or _financial_available_date(year, quarter)
                updates.append((
                    revenue, gross_profit, operating_income, net_income, eps,
                    gross_margin, operating_margin, roe, roa, available,
                    stock_id, year, quarter,
                ))
            conn.executemany(
                "UPDATE quarterly_financials SET "
                "revenue_quarter=?, gross_profit_quarter=?, operating_income_quarter=?, "
                "net_income_quarter=?, eps_quarter=?, gross_margin_quarter=?, "
                "operating_margin_quarter=?, roe_quarter=?, roa_quarter=?, available_date=? "
                "WHERE stock_id=? AND year=? AND quarter=?",
                updates,
            )
            conn.commit()
        return len(updates)

    @contextmanager
    def ingest(self, dataset: str, source: str) -> Iterator[dict[str, object]]:
        started = now_iso()
        with closing(self.connect()) as conn:
            cur = conn.execute(
                "INSERT INTO ingest_runs(dataset, started_at, status, source) "
                "VALUES (?, ?, 'running', ?)",
                (dataset, started, source),
            )
            run_id = cur.lastrowid
            conn.commit()
        result: dict[str, object] = {
            "row_count": 0, "as_of_value": None, "status": "success", "error": None
        }
        try:
            yield result
        except Exception as exc:
            result["status"] = "failed"
            result["error"] = str(exc)
            self._finish_ingest(run_id, dataset, source, result)
            raise
        else:
            self._finish_ingest(run_id, dataset, source, result)

    def _finish_ingest(
        self, run_id: int, dataset: str, source: str, result: Mapping[str, object]
    ) -> None:
        finished = now_iso()
        values = (
            finished,
            str(result.get("status") or "success"),
            result.get("as_of_value"),
            int(result.get("row_count") or 0),
            result.get("error"),
            run_id,
        )
        with closing(self.connect()) as conn:
            conn.execute(
                "UPDATE ingest_runs SET finished_at=?, status=?, as_of_value=?, "
                "row_count=?, error=? WHERE id=?",
                values,
            )
            conn.execute(
                "INSERT INTO dataset_status(dataset, as_of_value, fetched_at, source, status, row_count, error) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(dataset) DO UPDATE SET "
                "as_of_value=excluded.as_of_value, fetched_at=excluded.fetched_at, "
                "source=excluded.source, status=excluded.status, "
                "row_count=excluded.row_count, error=excluded.error",
                (
                    dataset, result.get("as_of_value"), finished, source,
                    result.get("status") or "success", int(result.get("row_count") or 0),
                    result.get("error"),
                ),
            )
            conn.commit()

    def status(self) -> dict[str, object]:
        specs = {
            "stocks": (None, None),
            "daily_prices": ("trade_date", "stock_id"),
            "institutional_trading": ("trade_date", "stock_id"),
            "monthly_revenue": ("year_month", "stock_id"),
            "quarterly_financials": ("year * 10 + quarter", "stock_id"),
            "margin_trading": ("trade_date", "stock_id"),
            "dividend_events": ("ex_date", "stock_id"),
            "disposition_events": ("start_date", "stock_id"),
            "notice_events": ("notice_date", "stock_id"),
            "delisted_stocks": ("delisting_date", "stock_id"),
            "industries": (None, None),
            "stock_industry_map": (None, None),
            "backfill_checkpoints": (None, None),
        }
        result: dict[str, object] = {"database": str(self.path), "tables": {}}
        with closing(self.connect()) as conn:
            existing = {
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            for table, (date_expr, stock_col) in specs.items():
                if table not in existing:
                    result["tables"][table] = {"exists": False}
                    continue
                count = conn.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
                entry: dict[str, object] = {"exists": True, "rows": count}
                if date_expr:
                    low, high = conn.execute(
                        f"SELECT MIN({date_expr}), MAX({date_expr}) FROM [{table}]"
                    ).fetchone()
                    entry["min"] = low
                    entry["max"] = high
                if stock_col:
                    entry["stocks"] = conn.execute(
                        f"SELECT COUNT(DISTINCT [{stock_col}]) FROM [{table}]"
                    ).fetchone()[0]
                result["tables"][table] = entry
            statuses = conn.execute(
                "SELECT dataset, as_of_value, fetched_at, source, status, row_count, error "
                "FROM dataset_status ORDER BY dataset"
            ).fetchall() if "dataset_status" in existing else []
            result["dataset_status"] = [dict(r) for r in statuses]
            checkpoints = conn.execute(
                "SELECT dataset, status, COUNT(*) AS units, SUM(row_count) AS rows, "
                "MAX(updated_at) AS updated_at FROM backfill_checkpoints "
                "GROUP BY dataset, status ORDER BY dataset, status"
            ).fetchall() if "backfill_checkpoints" in existing else []
            result["backfill_status"] = [dict(r) for r in checkpoints]
        return result

    @staticmethod
    def _check_identifier(value: str) -> None:
        if not _IDENTIFIER.fullmatch(value):
            raise ValueError(f"不合法的 SQL identifier：{value}")


def _prepend(first, iterator):
    yield first
    yield from iterator


def _sqlite_value(value):
    if value is None:
        return None
    if hasattr(value, "as_py"):
        value = value.as_py()
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return value


def _ratio(numerator, denominator) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    value = float(numerator) / float(denominator) * 100
    return value if abs(value) < 9999 else None


def _financial_available_date(year: int, quarter: int) -> str:
    # A conservative all-industry point-in-time date; later than the normal filing deadline.
    if quarter == 1:
        return date(year, 5, 31).isoformat()
    if quarter == 2:
        return date(year, 8, 31).isoformat()
    if quarter == 3:
        return date(year, 11, 30).isoformat()
    return date(year + 1, 3, 31).isoformat()
