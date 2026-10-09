import json
import sqlite3

import pyarrow as pa
import pyarrow.parquet as pq

from taiwan_data.bootstrap import build_snapshot
from taiwan_data.db import DataStore


def write_parquet(root, name, rows):
    pq.write_table(pa.Table.from_pylist(rows), root / name)


def test_bootstrap_copies_source_and_adds_dimensions_and_newer_prices(tmp_path):
    source = tmp_path / "source.sqlite"
    with sqlite3.connect(source) as conn:
        conn.execute("CREATE TABLE daily_prices (stock_id TEXT, trade_date TEXT, open REAL, high REAL, low REAL, close REAL, volume INTEGER, turnover INTEGER, change_pct REAL, PRIMARY KEY(stock_id, trade_date))")
        conn.execute("INSERT INTO daily_prices VALUES ('2330','2026-07-17',1,1,1,1,1,1,0)")
        conn.commit()

    parquet = tmp_path / "parquet"
    parquet.mkdir()
    write_parquet(parquet, "stocks.parquet", [{
        "stock_id": "2330", "market": "TWSE", "listing_date": None, "is_active": True
    }])
    write_parquet(parquet, "industries.parquet", [{
        "industry_code": "semi", "name_zh": "半導體"
    }])
    write_parquet(parquet, "stock_industry_map.parquet", [{
        "stock_id": "2330", "industry_code": "semi"
    }])
    write_parquet(parquet, "stock_universe_history.parquet", [{
        "snapshot_date": "2026-07-31", "stock_id": "2330", "market": "TWSE",
        "industry_code": "semi", "asset_type": "common_stock", "listing_date": None,
        "delisting_date": None, "is_active": True,
    }])
    write_parquet(parquet, "prices.parquet", [{
        "stock_id": "2330", "trade_date": "2026-07-31", "open": 2.0, "high": 2.0,
        "low": 2.0, "close": 2.0, "volume": 2, "turnover": 4, "change_pct": 1.0,
    }])

    output = tmp_path / "snapshot.sqlite"
    result = build_snapshot(source, parquet, output)
    assert output.is_file()
    assert DataStore(output).max_value("daily_prices", "trade_date") == "2026-07-31"
    assert DataStore(output).scalar("SELECT industry_code FROM stocks WHERE stock_id='2330'") == "semi"
    manifest = json.loads(output.with_suffix(".manifest.json").read_text(encoding="utf-8"))
    assert manifest["sha256"] == result["sha256"]
