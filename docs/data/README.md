# 台股資料層（taiwan_data）

`packages/taiwan_data` 是從 `taiwan_stock_advisor` 拆出的資料層：一個 SQLite 檔＋從官方來源
增量更新的 CLI（`taiwan-data`）。不依賴 Neon、FinMind 或任何 API key。

## 目錄

```text
packages/taiwan_data/        套件原始碼與測試
scripts/windows/             本機每日排程（Windows 工作排程器）
var/data/taiwan_stock.sqlite 資料庫（不進 Git，約 1 GB）
var/logs/                    排程與手動更新紀錄（不進 Git）
docs/data/                   本文件、回補評估、上雲規劃
```

## 本機建置

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -e "packages/taiwan_data[test,bootstrap]"
.venv\Scripts\python.exe -m pytest packages/taiwan_data -q
```

資料庫初始來源是舊專案產出的 snapshot（`taiwan_data_kit_20261009`），複製到
`var/data/taiwan_stock.sqlite` 後以 manifest 的 SHA-256 驗證
（`15d6903e…5b9772`）。原始 snapshot 仍留在舊專案，可隨時重新複製。

```powershell
$env:TAIWAN_DATA_DB = "$PWD\var\data\taiwan_stock.sqlite"
.venv\Scripts\taiwan-data.exe status
```

## 資料集與更新方式

`taiwan-data refresh all` 依序執行下表各項。各資料集獨立執行：單一項失敗會記錄在
`ingest_runs`／`dataset_status` 並讓 CLI 以 exit code 1 結束，但不阻斷其他項目。

| target | 資料表 | 來源 | 增量方式 |
|---|---|---|---|
| `market` | `daily_prices`、`institutional_trading` | TWSE MI_INDEX／T86、TPEX dailyQuotes／insti | 從最後交易日續抓；`--lookback-days` 重抓近 N 天 |
| `stocks` | `stocks`、當日 `daily_prices` | TWSE／TPEX OpenAPI 當日行情 | 每次全量 upsert |
| `revenue` | `monthly_revenue` | MOPS 月營收彙總（每月 10 日後公布上月） | 從最後月份續抓，並重抓最新月 |
| `financials` | `quarterly_financials` | TWSE／TPEX OpenAPI（最新一季、一般業） | 每次覆寫最新季並重算單季值 |
| `margin` | `margin_trading` | TWSE MI_MARGN、TPEX margin/balance | 同 `market` |
| `dividends` | `dividend_events` | TWSE TWT49U、TPEX exDailyQ | 從最後除權息日往回 14 天重抓 |
| `disposition` | `disposition_events`、`notice_events` | TWSE punish／notice、TPEX disposal／attention | 從最後公告日往回 14 天重抓 |
| `delisted` | `delisted_stocks`、`stocks.is_active` | TWSE OpenAPI、TPEX 終止上櫃查詢 | TWSE 全量＋TPEX 當年度；下市日後仍有成交的代號不標下市 |
| `industries` | `industries`、`stock_industry_map`、`stocks` | TWSE／TPEX OpenAPI 公司基本資料 | **只補空值**，不覆寫舊 snapshot 的分類 |

所有寫入都是 primary key upsert，重跑不會產生重複。

### 歷史回補

`taiwan-data backfill TARGET --since 2015-01-01` 用正式來源補歷史缺口。每個季度、市場日、月份或
年度都會寫入 `backfill_checkpoints`；成功單位重跑時自動跳過，失敗單位可直接續跑。
逐日資料可加 `--market TWSE` 或 `--market TPEX`，讓兩個官方網域分流回補。

| target | 單位 | 補入內容 |
|---|---|---|
| `financials` | 季度 × 市場 | MOPS 損益表與資產負債表、累計轉單季、point-in-time 可用日 |
| `disposition` | 月 | 兩市場處置股與注意股，整月原子取代以反映更正／撤回 |
| `margin` | 交易日 × 市場 | 只抓資料庫中該市場整日缺失的日期 |
| `institutional` | 交易日 × 市場 | 只抓買進／賣出明細仍為 NULL 的日期，支援 2015 舊欄位 |
| `delisted` | TWSE 全量、TPEX 年度 | 上市下市與上櫃終止上櫃公司 |

## 每日排程（本機）

```powershell
# 手動跑一次（與排程相同）
powershell -ExecutionPolicy Bypass -File scripts\windows\daily_update.ps1

# 註冊排程：週一至週五 21:30，錯過會在開機後補跑
powershell -ExecutionPolicy Bypass -File scripts\windows\register_daily_task.ps1
```

- 每次執行產生 `var/logs/daily_<時間>.log`（JSON 結果）、`.err.log`、`status_<時間>.json`，
  並在 `var/logs/daily_summary.log` 追加一行 exit code 摘要。
- 只在使用者登入時執行；電腦關機或睡眠時不會喚醒，開機後補跑。
- 移除：`Unregister-ScheduledTask -TaskName TradingRadarDailyData -Confirm:$false`

上雲規劃見 [cloud-scheduling.md](cloud-scheduling.md)。

## 資料語意與已知限制

- **`quarterly_financials` 原欄位仍是「年初至今累計」**；`*_quarter` 才是真單季值。
  Q1 直接取累計值，Q2–Q4 只有在同年上一季存在時才相減，缺季不硬算。資產負債欄位是季底時點值。
- `available_date` 採所有產業都安全的保守日期（5/31、8/31、11/30、次年 3/31），回測必須以它
  限制可見資料；`statement_type` 區分一般業、銀行、金控、證券等格式。
- 特殊產業不具一般業可比性的營收／毛利欄位保留 NULL；淨利、EPS、資產、負債、權益照官方欄位保留。
- 融資券與法人買賣明細屬逐日大量回補；以 `backfill_checkpoints` 與 `status --json` 確認完成度，
  不可只看資料表最大日期。
- TPEX 終止上櫃 API 可查早期年度，已納入歷史回補；`delisted_stocks` 仍沿用每個代號一列的 schema，
  同一代號重複終止掛牌時保留較晚日期。
- 產業分類以舊 snapshot（FinMind 名稱）為主，官方公司基本資料只補缺漏；同一檔可能有多個分類
  （例如「半導體業」與舊的「電子工業」）。
- 行情／融資融券只要某市場某日抓取失敗，該日會記為 `partial`；排程的 `--lookback-days 5`
  會在之後 5 天內自動重抓。超過 5 天的缺口需手動
  `taiwan-data refresh market --since YYYY-MM-DD`。
