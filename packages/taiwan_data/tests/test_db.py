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

