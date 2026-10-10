PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stocks (
    stock_id TEXT PRIMARY KEY,
    stock_name TEXT,
    market TEXT,
    industry_code TEXT,
    listing_date TEXT,
    delisting_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industries (
    industry_code TEXT PRIMARY KEY,
    name_zh TEXT NOT NULL,
    source TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_industry_map (
    stock_id TEXT NOT NULL,
    industry_code TEXT NOT NULL,
    PRIMARY KEY (stock_id, industry_code)
);

CREATE TABLE IF NOT EXISTS stock_universe_history (
    snapshot_date TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    market TEXT,
    industry_code TEXT,
    asset_type TEXT,
    listing_date TEXT,
    delisting_date TEXT,
    is_active INTEGER,
    PRIMARY KEY (snapshot_date, stock_id)
);

CREATE TABLE IF NOT EXISTS daily_prices (
    stock_id TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume INTEGER,
    turnover INTEGER,
    change_pct REAL,
    PRIMARY KEY (stock_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_prices_date
    ON daily_prices (trade_date);

CREATE TABLE IF NOT EXISTS institutional_trading (
    stock_id TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    foreign_buy INTEGER,
    foreign_sell INTEGER,
    foreign_net INTEGER,
    invest_buy INTEGER,
    invest_sell INTEGER,
    invest_net INTEGER,
    dealer_buy INTEGER,
    dealer_sell INTEGER,
    dealer_net INTEGER,
    total_net INTEGER,
    PRIMARY KEY (stock_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_institutional_date
    ON institutional_trading (trade_date);

CREATE TABLE IF NOT EXISTS monthly_revenue (
    stock_id TEXT NOT NULL,
    year_month TEXT NOT NULL,
    revenue INTEGER,
    mom_pct REAL,
    yoy_pct REAL,
    PRIMARY KEY (stock_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_revenue_month
    ON monthly_revenue (year_month);

CREATE TABLE IF NOT EXISTS quarterly_financials (
    stock_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    revenue INTEGER,
    gross_profit INTEGER,
    operating_income INTEGER,
    net_income INTEGER,
    total_assets INTEGER,
    total_liabilities INTEGER,
    equity INTEGER,
    eps REAL,
    roe REAL,
    roa REAL,
    gross_margin REAL,
    operating_margin REAL,
    debt_ratio REAL,
    revenue_quarter INTEGER,
    gross_profit_quarter INTEGER,
    operating_income_quarter INTEGER,
    net_income_quarter INTEGER,
    eps_quarter REAL,
    gross_margin_quarter REAL,
    operating_margin_quarter REAL,
    roe_quarter REAL,
    roa_quarter REAL,
    available_date TEXT,
    statement_type TEXT,
    source_kind TEXT,
    market TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (stock_id, year, quarter)
);

CREATE TABLE IF NOT EXISTS margin_trading (
    stock_id TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    margin_balance REAL,
    margin_change REAL,
    short_balance REAL,
    short_change REAL,
    PRIMARY KEY (stock_id, trade_date)
);

CREATE TABLE IF NOT EXISTS dividend_events (
    stock_id TEXT NOT NULL,
    ex_date TEXT NOT NULL,
    pre_close REAL,
    ref_price REAL,
    PRIMARY KEY (stock_id, ex_date)
);

CREATE TABLE IF NOT EXISTS delisted_stocks (
    stock_id TEXT PRIMARY KEY,
    stock_name TEXT,
    delisting_date TEXT,
    market TEXT
);

CREATE TABLE IF NOT EXISTS disposition_events (
    stock_id TEXT NOT NULL,
    announce_date TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    cumulative INTEGER,
    reason TEXT,
    measure TEXT,
    market TEXT,
    PRIMARY KEY (stock_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS notice_events (
    stock_id TEXT NOT NULL,
    notice_date TEXT NOT NULL,
    reason TEXT,
    market TEXT,
    PRIMARY KEY (stock_id, notice_date, reason)
);

CREATE TABLE IF NOT EXISTS ingest_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    source TEXT,
    as_of_value TEXT,
    row_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_dataset_started
    ON ingest_runs (dataset, started_at DESC);

CREATE TABLE IF NOT EXISTS dataset_status (
    dataset TEXT PRIMARY KEY,
    as_of_value TEXT,
    fetched_at TEXT NOT NULL,
    source TEXT,
    status TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE TABLE IF NOT EXISTS backfill_checkpoints (
    dataset TEXT NOT NULL,
    unit_key TEXT NOT NULL,
    status TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (dataset, unit_key)
);

CREATE INDEX IF NOT EXISTS idx_backfill_checkpoints_status
    ON backfill_checkpoints (dataset, status);

-- Screening snapshots：結果與 Evidence 皆存值（非參照），之後資料庫更新仍可重現當次排名。
CREATE TABLE IF NOT EXISTS screening_runs (
    run_id TEXT PRIMARY KEY,
    run_at TEXT NOT NULL,
    as_of_date TEXT NOT NULL,
    price_as_of TEXT NOT NULL,
    revenue_as_of TEXT NOT NULL,
    revenue_coverage REAL NOT NULL,
    financial_as_of TEXT NOT NULL,
    financial_coverage REAL NOT NULL,
    config_version TEXT NOT NULL,
    config_json TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    input_fingerprint TEXT NOT NULL,
    data_version TEXT NOT NULL,
    source_snapshot TEXT,
    universe_count INTEGER NOT NULL,
    base_eligible_count INTEGER NOT NULL,
    ranked_count INTEGER NOT NULL,
    status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_screening_runs_fingerprint
    ON screening_runs (input_fingerprint);

CREATE TABLE IF NOT EXISTS screening_results (
    run_id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    stock_name TEXT,
    market TEXT,
    industry TEXT,
    revenue_yoy REAL,
    operating_margin REAL,
    debt_ratio REAL,
    avg_turnover_20d REAL,
    revenue_yoy_status TEXT,
    operating_margin_status TEXT,
    debt_ratio_status TEXT,
    avg_turnover_20d_status TEXT,
    revenue_yoy_pctl REAL,
    operating_margin_pctl REAL,
    debt_ratio_pctl REAL,
    percentile_scope TEXT,
    notice_flag INTEGER NOT NULL DEFAULT 0,
    disposition_flag INTEGER NOT NULL DEFAULT 0,
    quant_score REAL,
    rank INTEGER,
    exclusion_reason TEXT,
    data_as_of TEXT NOT NULL,
    PRIMARY KEY (run_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_screening_results_rank
    ON screening_results (run_id, rank);

CREATE TABLE IF NOT EXISTS screening_evidence (
    run_id TEXT NOT NULL,
    id TEXT NOT NULL,
    stock_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    claim TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    dataset TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    reference_url TEXT,
    data_as_of TEXT NOT NULL,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL,
    fetched_at TEXT,
    fetched_at_scope TEXT NOT NULL,
    calculation_json TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    PRIMARY KEY (run_id, id)
);

CREATE INDEX IF NOT EXISTS idx_screening_evidence_stock
    ON screening_evidence (run_id, stock_id, metric);

INSERT INTO schema_meta (key, value)
VALUES ('schema_version', '3')
ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP;
