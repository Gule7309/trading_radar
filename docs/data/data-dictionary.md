# 資料字典

`var/data/taiwan_stock.sqlite` 每張表的欄位、單位與語意。完整 DDL 在
[`schema.sql`](../../packages/taiwan_data/src/taiwan_data/schema.sql)（`schema_version` = 3）。

## 共通慣例

| 項目 | 慣例 |
|---|---|
| 日期 | `TEXT`，ISO 格式 `YYYY-MM-DD`；月份 `YYYY-MM` |
| 股票代號 `stock_id` | `TEXT`（保留前導 0，例如 `0050`），**不要轉成數字** |
| 市場 `market` | `TWSE`（上市）或 `TPEX`（上櫃） |
| 季度 | 資料表用 `year`＋`quarter` 兩欄；Screening 輸出用 `2026Q2` |
| 百分比 | 欄位名含 `pct`、`margin`、`ratio`、`roe`、`roa` 者為**百分比數值**（`12.5` 代表 12.5%），不是 0–1 小數 |
| 金額單位 | **成交金額為新台幣元；月營收與財報金額為新台幣千元**（見各表） |
| 寫入方式 | 一律 primary key upsert，重跑不會重複 |
| NULL | 代表來源沒有提供或無法計算，**不要當成 0** |

## 市場資料

### `stocks` — 股票主檔

| 欄位 | 說明 |
|---|---|
| `stock_id` (PK) | 股票代號 |
| `stock_name` | 簡稱 |
| `market` | `TWSE`／`TPEX` |
| `industry_code` | 產業名稱（中文，例如「半導體業」）。粒度不一致，見 [限制](limitations-and-decisions.md) |
| `listing_date`、`delisting_date` | 上市（櫃）日、下市日 |
| `is_active` | 1 = 現行；0 = 已下市／終止上櫃。**判斷是否現行請用這欄** |

### `daily_prices` — 日 K

PK：`(stock_id, trade_date)`

| 欄位 | 單位 | 說明 |
|---|---|---|
| `open`、`high`、`low`、`close` | 元 | 未還原權值 |
| `volume` | **股** | 成交股數（1 張 = 1,000 股） |
| `turnover` | **元** | 成交金額 |
| `change_pct` | % | `漲跌 ÷ 前一日收盤 × 100` |

價格**未做除權息還原**；需要還原價時請搭配 `dividend_events` 自行計算。

### `institutional_trading` — 三大法人

PK：`(stock_id, trade_date)`。單位皆為**股**。

| 欄位 | 說明 |
|---|---|
| `foreign_buy`／`foreign_sell`／`foreign_net` | 外資（`net = buy − sell`） |
| `invest_buy`／`invest_sell`／`invest_net` | 投信 |
| `dealer_buy`／`dealer_sell`／`dealer_net` | 自營商合計 |
| `total_net` | 三大法人買賣超（取自官方欄位） |

### `margin_trading` — 融資融券

PK：`(stock_id, trade_date)`。單位皆為**張**。

| 欄位 | 說明 |
|---|---|
| `margin_balance`、`margin_change` | 融資餘額、較前一日增減 |
| `short_balance`、`short_change` | 融券餘額、較前一日增減 |

## 基本面

### `monthly_revenue` — 月營收

PK：`(stock_id, year_month)`

| 欄位 | 單位 | 說明 |
|---|---|---|
| `year_month` | — | `YYYY-MM` |
| `revenue` | **千元** | 當月營收 |
| `mom_pct`、`yoy_pct` | % | 來源提供的月增率、年增率 |

月 M 的營收在**次月 10 日**前公布；做回測或 screening 時，M 月資料應視為次月 10 日起才可用。

### `quarterly_financials` — 季財報

PK：`(stock_id, year, quarter)`。金額單位皆為**千元**。

| 欄位 | 說明 |
|---|---|
| `revenue`、`gross_profit`、`operating_income`、`net_income`、`eps` | 損益表，**年初至今累計值**（Q2 = 1–6 月合計） |
| `gross_margin`、`operating_margin`、`roe`、`roa` | 由累計值算出的比率（%） |
| `*_quarter`（`revenue_quarter`、`operating_income_quarter`、`eps_quarter`、`operating_margin_quarter` …） | **單季值**。Q1 = 累計值；Q2–Q4 = 本季累計 − 上季累計；上季缺漏時為 NULL，不硬算 |
| `total_assets`、`total_liabilities`、`equity` | 資產負債表，**季底時點值** |
| `debt_ratio` | `total_liabilities ÷ total_assets × 100` |
| `statement_type` | `general`（一般業）、`bank`、`financial_holding`、`securities`、`other`、`unknown` |
| `available_date` | **估計可用日**（保守推算：Q1 5/31、Q2 8/31、Q3 11/30、Q4 次年 3/31），**不是實際公告日** |
| `source_kind` | `mops_historical`（MOPS 彙總報表） |
| `fetched_at` | 這一列的抓取時間 |

> 比較不同公司時，**營業利益率請用單季值**；累計值會因季度不同而無法比較。
> 金融業（非 `general`）的營收、毛利等欄位為 NULL，因為產業專屬收入不能硬套成一般業營收。

## 事件

| 資料表 | PK | 欄位 |
|---|---|---|
| `dividend_events` 除權息 | `(stock_id, ex_date)` | `ex_date` 除權息日、`pre_close` 前一日收盤（元）、`ref_price` 參考價（元） |
| `disposition_events` 處置股 | `(stock_id, start_date, end_date)` | `announce_date` 公告日、`start_date`／`end_date` 處置期間、`cumulative` 累計處置次數、`reason`、`measure`（例如「第一次處置」）、`market` |
| `notice_events` 注意股 | `(stock_id, notice_date, reason)` | `notice_date`、`reason`（官方原文）、`market` |
| `delisted_stocks` 下市清單 | `stock_id` | `stock_name`、`delisting_date`、`market` |

> `delisted_stocks` 也包含「**上櫃轉上市**」的終止上櫃記錄（約 89 檔仍在交易，例如統新、藥華藥）。
> **判斷是否已下市請用 `stocks.is_active`，不要用這張表。**

## 分類

| 資料表 | 說明 |
|---|---|
| `industries` | `industry_code`（中文名稱）、`name_zh`、`source` |
| `stock_industry_map` | `(stock_id, industry_code)`，**同一檔可能有兩個分類**（例如「半導體業」與上層「電子工業」）；需要單一分類時請用 `stocks.industry_code` |
| `stock_universe_history` | 舊專案留下的 universe 快照，**只有 2026-07-31 一份**，不要當成歷史 universe |

## 中繼資料（追溯與維運用）

| 資料表 | 說明 |
|---|---|
| `dataset_status` | 每個資料集最近一次更新：`as_of_value`（資料日期）、`fetched_at`、`source`（官方端點，`;` 分隔）、`status`（`success`／`partial`／`failed`）、`row_count`、`error`。**Evidence 的 `sourceUrl` 與 dataset 層級 `fetchedAt` 來自這裡** |
| `ingest_runs` | 每次抓取的紀錄（開始／結束時間、狀態、筆數、錯誤） |
| `backfill_checkpoints` | 回補進度：`(dataset, unit_key)` 與 `status`；續跑時跳過已成功的單位 |
| `backfill_progress` | 舊專案留下的進度表，已不使用 |
| `schema_meta` | `schema_version` 等 |

## Screening（`schema_version` 3 新增）

計算方式見 [screening.md](screening.md)；給 Agent／Frontend 的 JSON 契約見
[candidate-evidence-contract.md](candidate-evidence-contract.md)。三張表都**存值而非參照**，原始資料更新後舊結果仍可原樣讀出。

### `screening_runs` — 每次執行一列

| 欄位 | 說明 |
|---|---|
| `run_id` (PK) | `YYYYMMDD-NNN` |
| `run_at`、`as_of_date` | 執行時間、評估基準日 |
| `price_as_of`、`revenue_as_of`、`financial_as_of` | 實際使用的行情日、營收月份、財報季度 |
| `revenue_coverage`、`financial_coverage` | 實際使用期間的涵蓋率 |
| `config_version`、`config_json`、`profile_json` | 系統參數與使用者條件 |
| `input_fingerprint` | 輸入的雜湊；相同輸入會重用同一個 run |
| `data_version` | 由 `dataset_status` 算出的資料版本摘要（`ds-…`） |
| `source_snapshot` | 對應 manifest 的 SHA-256；manifest 過期時為 NULL |
| `universe_count`、`base_eligible_count`、`ranked_count` | 對帳用數字 |

### `screening_results` — 每次執行 × 每檔股票一列

PK：`(run_id, stock_id)`。包含：四個指標值（`revenue_yoy`、`operating_margin`、`debt_ratio`、`avg_turnover_20d`）、
各自的驗證狀態（`*_status`）、三個 percentile（`*_pctl`，`debt_ratio_pctl` 是 safety percentile，越高代表負債比越低）、
`percentile_scope`、`notice_flag`、`disposition_flag`、`quant_score`、`rank`、`exclusion_reason`、`data_as_of`。
沒有排名的股票 `rank` 與 `quant_score` 為 NULL，`exclusion_reason` 記錄第一個命中的原因。

### `screening_evidence` — 前 K 名的 Evidence

PK：`(run_id, id)`。欄位與 JSON 的 Evidence 物件一一對應（snake_case），`calculation_json` 存公式與原始輸入。

## 檔案格式

### 本機 manifest：`var/data/taiwan_stock.manifest.json`

由 `taiwan-data manifest` 產生，記錄 `database_bytes`、`sha256`、`data_version`、`updated_at` 與 `status`（各表筆數）。

### 分發 manifest：`manifest-full.json`／`manifest-demo.json`

由 `taiwan-data snapshot` 產生，隨快照上傳到 Release：

```json
{
  "format": "taiwan-stock-data-distribution-v1",
  "kind": "full",
  "version": "2026-10-10",
  "as_of": "2026-10-08",
  "file": "taiwan_stock_full_2026-10-10.sqlite.gz",
  "bytes": 435601862,
  "sha256": "<.gz 的 SHA-256>",
  "database": "taiwan_stock.sqlite",
  "database_bytes": 1275334656,
  "database_sha256": "<解壓後資料庫的 SHA-256>",
  "table_row_counts": { "daily_prices": 4932337, "...": 0 }
}
```
