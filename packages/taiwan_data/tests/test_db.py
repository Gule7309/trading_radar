from datetime import date

from taiwan_data.db import DataStore
from taiwan_data.service import RefreshService


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


def test_backfill_checkpoints_are_idempotent(tmp_path):
    store = DataStore(tmp_path / "test.sqlite")
    store.ensure_schema()
    store.set_checkpoint("history", "2025-Q1:TWSE", "success", row_count=10)
    store.set_checkpoint("history", "2025-Q2:TWSE", "failed", error="temporary")
    assert store.successful_checkpoints("history") == {"2025-Q1:TWSE"}
    assert {row["status"] for row in store.status()["backfill_status"]} == {
        "success", "failed"
    }


def test_market_backfill_dates_only_return_real_gaps(tmp_path):
    store = DataStore(tmp_path / "test.sqlite")
    store.ensure_schema()
    store.upsert("stocks", [
        {"stock_id": "2330", "market": "TWSE"},
        {"stock_id": "6488", "market": "TPEX"},
    ], ("stock_id",))
    store.upsert("daily_prices", [
        {"stock_id": stock_id, "trade_date": trade_date, "close": 100}
        for stock_id in ("2330", "6488")
        for trade_date in ("2026-10-07", "2026-10-08")
    ], ("stock_id", "trade_date"))
    store.upsert("margin_trading", [
        {"stock_id": "2330", "trade_date": "2026-10-07", "margin_balance": 10},
        {"stock_id": "6488", "trade_date": "2026-10-08", "margin_balance": 20},
    ], ("stock_id", "trade_date"))
    store.upsert("institutional_trading", [
        {"stock_id": "2330", "trade_date": "2026-10-07", "foreign_buy": None},
        {"stock_id": "2330", "trade_date": "2026-10-08", "foreign_buy": 10},
    ], ("stock_id", "trade_date"))

    window = (date(2026, 10, 7), date(2026, 10, 8))
    assert store.market_backfill_dates("margin_trading", "TWSE", *window) == [
        date(2026, 10, 8)
    ]
    assert store.market_backfill_dates("margin_trading", "TPEX", *window) == [
        date(2026, 10, 7)
    ]
    assert store.market_backfill_dates(
        "institutional_trading", "TWSE", *window, detail_columns=("foreign_buy",)
    ) == [date(2026, 10, 7)]


def test_gap_targeted_backfill_retries_stale_success_checkpoint(tmp_path):
    store = DataStore(tmp_path / "test.sqlite")
    store.ensure_schema()
    trade_date = date(2026, 10, 7)
    store.upsert("stocks", [{"stock_id": "2330", "market": "TWSE"}], ("stock_id",))
    store.upsert("daily_prices", [
        {"stock_id": "2330", "trade_date": trade_date, "close": 100},
    ], ("stock_id", "trade_date"))
    store.upsert("institutional_trading", [
        {"stock_id": "2330", "trade_date": trade_date, "foreign_buy": None},
    ], ("stock_id", "trade_date"))
    store.set_checkpoint(
        "institutional_history", "2026-10-07:TWSE", "success", row_count=1
    )

    def fetcher(target_date, *, session=None):
        assert target_date == trade_date
        return [{
            "stock_id": "2330", "trade_date": target_date,
            "foreign_buy": 10, "foreign_sell": 3, "foreign_net": 7,
            "invest_buy": 2, "invest_sell": 1, "invest_net": 1,
            "dealer_buy": 4, "dealer_sell": 2, "dealer_net": 2,
            "total_net": 10,
        }]

    result = RefreshService(store)._backfill_daily_market_data(
        dataset="institutional_history", source="test", table="institutional_trading",
        fetchers=(("TWSE", fetcher),), since=trade_date, until=trade_date, delay=0,
        dates_by_market={"TWSE": [trade_date]},
    )

    assert result["units"] == 1
    assert store.scalar(
        "SELECT foreign_buy FROM institutional_trading WHERE stock_id='2330'"
    ) == 10

