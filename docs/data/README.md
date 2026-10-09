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
| `financials` | `quarterly_financials` | TWSE／TPEX OpenAPI（只有最新一季、一般業） | 每次覆寫最新季 |
| `margin` | `margin_trading` | TWSE MI_MARGN、TPEX margin/balance | 同 `market` |
| `dividends` | `dividend_events` | TWSE TWT49U、TPEX exDailyQ | 從最後除權息日往回 14 天重抓 |
| `disposition` | `disposition_events`、`notice_events` | TWSE punish／notice、TPEX disposal／attention | 從最後公告日往回 14 天重抓 |
| `delisted` | `delisted_stocks`、`stocks.is_active` | TWSE OpenAPI 終止上市 | 全量；下市日後仍有成交的代號不標下市 |
| `industries` | `industries`、`stock_industry_map`、`stocks` | TWSE／TPEX OpenAPI 公司基本資料 | **只補空值**，不覆寫舊 snapshot 的分類 |

所有寫入都是 primary key upsert，重跑不會產生重複。

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

- **`quarterly_financials` 的損益欄位是「年初至今累計」**：官方 OpenAPI 的 Q2 營收、淨利、EPS
  是上半年合計（已用 2330／1101／2317 對照 1–6 月營收加總驗證），ROE／ROA 也因此是累計值，
  不是單季、也未年化。資產負債欄位是季底時點值。
- `quarterly_financials` 只有 2026Q2 起逐季累積；歷史季報回補評估見
  [backfill-evaluation.md](backfill-evaluation.md)。
- `institutional_trading` 2026-07 以前的列只有買賣超淨額，買進／賣出明細為 NULL。
- `margin_trading`：上市自 2016-07；**上櫃自 2026-07-23 才有**（舊專案只抓上市）。
  舊資料含 10 檔 91xxxx 存託憑證到 2026-07-22 為止；之後與其他資料表一致，只收 4 碼代號。
- `disposition_events`／`notice_events`：上市自 2015；**上櫃自 2026-07 起**。
- `delisted_stocks` 只有上市；上櫃目前沒有已知的官方下市清單端點，回測仍有上櫃倖存者偏誤。
- 產業分類以舊 snapshot（FinMind 名稱）為主，官方公司基本資料只補缺漏；同一檔可能有多個分類
  （例如「半導體業」與舊的「電子工業」）。
- 行情／融資融券只要某市場某日抓取失敗，該日會記為 `partial`；排程的 `--lookback-days 5`
  會在之後 5 天內自動重抓。超過 5 天的缺口需手動
  `taiwan-data refresh market --since YYYY-MM-DD`。
