import gzip
import json
import sqlite3
from datetime import date, timedelta

import pytest

from taiwan_data.db import DataStore
from taiwan_data.distribution import create_snapshot, download_snapshot


def _seed(path):
    store = DataStore(path)
    store.ensure_schema()
    start = date(2026, 1, 1)
    days = [(start + timedelta(days=i)).isoformat() for i in range(130)]
    store.upsert("daily_prices", [
        {"stock_id": "2330", "trade_date": d, "open": 1.0, "high": 1.0, "low": 1.0,
         "close": 1.0, "volume": 1, "turnover": 1, "change_pct": 0.0} for d in days
    ], ("stock_id", "trade_date"))
    store.upsert("monthly_revenue", [
        {"stock_id": "2330", "year_month": f"{2023 + i // 12}-{i % 12 + 1:02d}",
         "revenue": 1, "mom_pct": 0.0, "yoy_pct": 0.0} for i in range(36)
    ], ("stock_id", "year_month"))
    store.upsert("quarterly_financials", [
        {"stock_id": "2330", "year": 2023 + i // 4, "quarter": i % 4 + 1,
         "fetched_at": "2026-10-10"} for i in range(12)
    ], ("stock_id", "year", "quarter"))
    store.upsert("notice_events", [
        {"stock_id": "2330", "notice_date": "2024-01-02", "reason": "舊", "market": "TWSE"},
        {"stock_id": "2330", "notice_date": days[-1], "reason": "新", "market": "TWSE"},
    ], ("stock_id", "notice_date", "reason"))
    store.upsert("stocks", [{"stock_id": "2330", "stock_name": "台積電", "market": "TWSE",
                             "listing_date": None, "is_active": 1}], ("stock_id",))
    store.upsert("backfill_checkpoints", [
        {"dataset": "margin_history", "unit_key": "x", "status": "success",
         "row_count": 1, "error": None, "updated_at": "2026-10-10"}], ("dataset", "unit_key"))
    return store


def _count(path, table):
    with sqlite3.connect(path) as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_full_snapshot_roundtrip_and_skip(tmp_path):
    src = _seed(tmp_path / "src.sqlite")
    out = tmp_path / "dist"
    manifest = create_snapshot(src.path, out, kind="full", version="t1")
    assert manifest["table_row_counts"]["daily_prices"] == 130
    assert not list(out.glob("*.sqlite"))  # 未壓縮的暫存檔已清掉

    dest = tmp_path / "dev" / "taiwan_stock.sqlite"
    first = download_snapshot(dest, kind="full", source=str(out))
    assert first["status"] == "downloaded"
    assert _count(dest, "daily_prices") == 130
    assert download_snapshot(dest, kind="full", source=str(out))["status"] == "up_to_date"


def test_demo_snapshot_trims_windows_and_clears_progress(tmp_path):
    src = _seed(tmp_path / "src.sqlite")
    out = tmp_path / "dist"
    manifest = create_snapshot(src.path, out, kind="demo", version="t1")
    counts = manifest["table_row_counts"]
    assert counts["daily_prices"] == 120
    assert counts["monthly_revenue"] == 24
    assert counts["quarterly_financials"] == 8
    assert counts["notice_events"] == 1
    assert counts["stocks"] == 1
    assert counts["backfill_checkpoints"] == 0
    # 原始資料庫不受影響
    assert _count(src.path, "daily_prices") == 130


def test_tampered_download_is_rejected_and_existing_db_kept(tmp_path):
    src = _seed(tmp_path / "src.sqlite")
    out = tmp_path / "dist"
    manifest = create_snapshot(src.path, out, kind="full", version="t1")
    dest = tmp_path / "dev.sqlite"
    dest.write_bytes(b"existing")

    gz = out / manifest["file"]
    gz.write_bytes(gzip.compress(b"not a database"))
    with pytest.raises(ValueError, match="SHA-256"):
        download_snapshot(dest, kind="full", source=str(out))
    assert dest.read_bytes() == b"existing"
    assert not list(tmp_path.glob("dev.sqlite.*"))


def test_download_refuses_when_wal_has_content(tmp_path):
    src = _seed(tmp_path / "src.sqlite")
    out = tmp_path / "dist"
    create_snapshot(src.path, out, kind="full", version="t1")
    dest = tmp_path / "dev.sqlite"
    dest.write_bytes(b"existing")
    (tmp_path / "dev.sqlite-wal").write_bytes(b"x")
    with pytest.raises(RuntimeError, match="-wal"):
        download_snapshot(dest, kind="full", source=str(out))


def test_snapshot_refuses_to_overwrite(tmp_path):
    src = _seed(tmp_path / "src.sqlite")
    create_snapshot(src.path, tmp_path / "dist", kind="full", version="t1")
    with pytest.raises(FileExistsError):
        create_snapshot(src.path, tmp_path / "dist", kind="full", version="t1")
    json.loads((tmp_path / "dist" / "manifest-full.json").read_text(encoding="utf-8"))
