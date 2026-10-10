from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from contextlib import closing
from datetime import date, datetime
from pathlib import Path
from typing import Callable, Iterable

from .db import DataStore, now_iso


def build_snapshot(
    source_db: str | os.PathLike[str],
    parquet_dir: str | os.PathLike[str],
    output_db: str | os.PathLike[str],
    *,
    manifest_path: str | os.PathLike[str] | None = None,
) -> dict[str, object]:
    source = Path(source_db).expanduser().resolve()
    parquet_root = Path(parquet_dir).expanduser().resolve()
    output = Path(output_db).expanduser().resolve()
    partial = output.with_suffix(output.suffix + ".partial")
    if not source.is_file():
        raise FileNotFoundError(source)
    if not parquet_root.is_dir():
        raise FileNotFoundError(parquet_root)
    if output.exists() or partial.exists():
        raise FileExistsError(f"輸出或 partial 已存在，為避免覆寫請改用新路徑：{output}")
    output.parent.mkdir(parents=True, exist_ok=True)

    _sqlite_backup(source, partial)
    store = DataStore(partial)
    store.ensure_schema()

    imported: dict[str, int] = {}
    imported["stocks"] = _import_parquet(
        store, parquet_root / "stocks.parquet", "stocks", ("stock_id",),
        mapper=lambda row: {
            "stock_id": row["stock_id"], "stock_name": None, "market": row.get("market"),
            "listing_date": row.get("listing_date"), "is_active": row.get("is_active", True),
        },
    )
    imported["industries"] = _import_parquet(
        store, parquet_root / "industries.parquet", "industries", ("industry_code",),
        mapper=lambda row: {
            "industry_code": row["industry_code"], "name_zh": row["name_zh"],
            "source": "legacy_snapshot",
        },
    )
    imported["stock_industry_map"] = _import_parquet(
        store, parquet_root / "stock_industry_map.parquet", "stock_industry_map",
        ("stock_id", "industry_code"),
    )
    imported["stock_universe_history"] = _import_parquet(
        store, parquet_root / "stock_universe_history.parquet", "stock_universe_history",
        ("snapshot_date", "stock_id"),
    )

    # Only append facts newer than the SQLite backup. Existing 4.8M rows are not rewritten.
    fact_specs = [
        ("prices.parquet", "daily_prices", ("stock_id", "trade_date"), "trade_date"),
        ("institutional.parquet", "institutional_trading",
         ("stock_id", "trade_date"), "trade_date"),
        ("monthly_revenue.parquet", "monthly_revenue",
         ("stock_id", "year_month"), "year_month"),
        ("margin.parquet", "margin_trading", ("stock_id", "trade_date"), "trade_date"),
        ("dividend_events.parquet", "dividend_events", ("stock_id", "ex_date"), "ex_date"),
    ]
    for filename, table, keys, cursor_column in fact_specs:
        imported[table] = _import_parquet(
            store, parquet_root / filename, table, keys,
            newer_than=(cursor_column, store.max_value(table, cursor_column)),
        )

    imported["delisted_stocks"] = _import_parquet(
        store, parquet_root / "delisted_stocks.parquet", "delisted_stocks", ("stock_id",)
    )
    imported["disposition_events"] = _import_parquet(
        store, parquet_root / "disposition_events.parquet", "disposition_events",
        ("stock_id", "start_date", "end_date"),
    )
    imported["notice_events"] = _import_parquet(
        store, parquet_root / "notice_events.parquet", "notice_events",
        ("stock_id", "notice_date", "reason"),
    )
    imported["historical_stock_names"] = store.fill_stock_names_from_delisted()

    with closing(store.connect()) as conn:
        conn.execute(
            "UPDATE stocks SET industry_code=("
            "SELECT MIN(m.industry_code) FROM stock_industry_map m "
            "WHERE m.stock_id=stocks.stock_id) "
            "WHERE industry_code IS NULL"
        )
        conn.execute(
            "INSERT INTO schema_meta(key, value, updated_at) VALUES ('snapshot_built_at', ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (now_iso(), now_iso()),
        )
        conn.execute(
            "INSERT INTO schema_meta(key, value, updated_at) VALUES ('source_research_db', ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (str(source), now_iso()),
        )
        conn.commit()
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    # Close every connection before the atomic final rename; the source and original remain untouched.
    partial.replace(output)
    final_store = DataStore(output)
    status = final_store.status()
    manifest = {
        "format": "taiwan-stock-data-snapshot-v1",
        "created_at": now_iso(),
        "database": output.name,
        "database_bytes": output.stat().st_size,
        "sha256": _sha256(output),
        "source_db": str(source),
        "parquet_dir": str(parquet_root),
        "parquet_rows_imported": imported,
        "status": status,
        "limitations": [
            "quarterly_financials starts empty until refresh financials is run",
            "official financial APIs expose only the latest general-industry quarter",
            "stock names are filled by refresh stocks from the current official market endpoints",
        ],
    }
    manifest_file = Path(manifest_path).resolve() if manifest_path else output.with_suffix(".manifest.json")
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return {"database": str(output), "manifest": str(manifest_file),
            "sha256": manifest["sha256"], "imported": imported, "status": status}


def _sqlite_backup(source: Path, target: Path) -> None:
    source_uri = f"file:{source.as_posix()}?mode=ro"
    with closing(sqlite3.connect(source_uri, uri=True)) as source_conn, \
            closing(sqlite3.connect(target)) as target_conn:
        source_conn.backup(target_conn, pages=16_384)


def _import_parquet(
    store: DataStore,
    path: Path,
    table: str,
    keys: tuple[str, ...],
    *,
    mapper: Callable[[dict], dict] | None = None,
    newer_than: tuple[str, object] | None = None,
) -> int:
    if not path.is_file():
        return 0
    try:
        import pyarrow as pa
        import pyarrow.dataset as ds
    except ImportError as exc:
        raise RuntimeError("bootstrap 需要安裝 optional dependency：pip install '.[bootstrap]'") from exc

    dataset = ds.dataset(path, format="parquet")
    expression = None
    if newer_than and newer_than[1] is not None:
        column, cursor = newer_than
        field_type = dataset.schema.field(column).type
        value = _arrow_cursor(cursor, field_type)
        expression = ds.field(column) > pa.scalar(value, type=field_type)

    total = 0
    scanner = dataset.scanner(filter=expression, batch_size=50_000)
    for batch in scanner.to_batches():
        rows = batch.to_pylist()
        if mapper:
            rows = [mapper(row) for row in rows]
        if rows:
            total += store.upsert(table, rows, keys, batch_size=10_000)
    return total


def _arrow_cursor(value, field_type):
    import pyarrow as pa
    if pa.types.is_date(field_type):
        return date.fromisoformat(str(value))
    if pa.types.is_timestamp(field_type):
        return datetime.fromisoformat(str(value))
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def refresh_manifest(
    database: str | os.PathLike[str],
    manifest_path: str | os.PathLike[str] | None = None,
    artifacts: Iterable[str | os.PathLike[str]] = (),
) -> dict[str, object]:
    db_path = Path(database).expanduser().resolve()
    if not db_path.is_file():
        raise FileNotFoundError(db_path)
    target = Path(manifest_path).expanduser().resolve() if manifest_path else db_path.with_suffix(".manifest.json")
    existing: dict[str, object] = {}
    if target.is_file():
        try:
            existing = json.loads(target.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
    existing.update({
        "format": "taiwan-stock-data-snapshot-v1",
        "updated_at": now_iso(),
        "database": db_path.name,
        "database_bytes": db_path.stat().st_size,
        "sha256": _sha256(db_path),
        "status": DataStore(db_path).status(),
    })
    artifact_rows = []
    for artifact in artifacts:
        artifact_path = Path(artifact).expanduser().resolve()
        if not artifact_path.is_file():
            raise FileNotFoundError(artifact_path)
        artifact_rows.append({
            "name": artifact_path.name,
            "bytes": artifact_path.stat().st_size,
            "sha256": _sha256(artifact_path),
        })
    if artifact_rows:
        existing["artifacts"] = artifact_rows
    target.write_text(json.dumps(existing, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return {"database": str(db_path), "manifest": str(target),
            "database_bytes": existing["database_bytes"], "sha256": existing["sha256"],
            "artifacts": artifact_rows}
