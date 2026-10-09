from taiwan_data.db import DataStore


def test_schema_and_idempotent_upsert(tmp_path):
    store = DataStore(tmp_path / "test.sqlite")
    store.ensure_schema()
    rows = [{
        "stock_id": "2330", "trade_date": "2026-10-08", "open": 100.0,
        "high": 102.0, "low": 99.0, "close": 101.0, "volume": 10,
        "turnover": 1010, "change_pct": 1.0,
    }]
    assert store.upsert("daily_prices", rows, ("stock_id", "trade_date")) == 1
    rows[0]["close"] = 103.0
    store.upsert("daily_prices", rows, ("stock_id", "trade_date"))
    assert store.scalar(
        "SELECT close FROM daily_prices WHERE stock_id=? AND trade_date=?",
        ("2330", "2026-10-08"),
    ) == 103.0
    assert store.status()["tables"]["daily_prices"]["rows"] == 1


def test_ingest_records_success_and_failure(tmp_path):
    store = DataStore(tmp_path / "test.sqlite")
    store.ensure_schema()
    with store.ingest("prices", "fixture") as run:
        run.update(row_count=3, as_of_value="2026-10-08")
    row = store.status()["dataset_status"][0]
    assert row["status"] == "success"
    assert row["row_count"] == 3


def test_replace_date_window_removes_corrected_and_withdrawn_rows(tmp_path):
    store = DataStore(tmp_path / "test.sqlite")
    store.ensure_schema()
    store.upsert("notice_events", [
        {"stock_id": "2330", "notice_date": "2026-10-08", "reason": "舊原因", "market": "TWSE"},
        {"stock_id": "1101", "notice_date": "2026-09-01", "reason": "區間外", "market": "TWSE"},
    ], ("stock_id", "notice_date", "reason"))

    result = store.replace_date_window(
        "notice_events", "notice_date", "2026-10-01", "2026-10-31",
        [{"stock_id": "2330", "notice_date": "2026-10-08", "reason": "更正原因", "market": "TWSE"}],
        ("stock_id", "notice_date", "reason"),
    )

    assert result == {"deleted": 1, "inserted": 1}
    assert store.scalar("SELECT COUNT(*) FROM notice_events WHERE reason='舊原因'") == 0
    assert store.scalar("SELECT COUNT(*) FROM notice_events WHERE reason='更正原因'") == 1
    assert store.scalar("SELECT COUNT(*) FROM notice_events WHERE reason='區間外'") == 1

