# 使用指南（給隊友）

從 clone 到拿到資料、跑出 Candidate JSON，大約 10 分鐘。

> **目前狀態**：`taiwan-data screen` 在 PR #5（`feat/screening-candidates`）審查中。merge 前請先
> `git switch feat/screening-candidates`；`download`、`status` 等其他指令在 `main` 已可用。

## 選一種資料模式

| 模式 | 需要什麼 | 適合 |
|---|---|---|
| **A. Fixture** | 什麼都不用裝 | Frontend 畫面、Agent prompt 開發 |
| **B. Demo DB**（約 25 MB） | Python 3.12 | 開發、整合測試、跑 `screen` |
| **C. Full DB**（下載約 420 MB，解壓 1.2 GB） | Python 3.12、約 3 GB 空間 | 回測、正式 Demo |

三種模式的 JSON 格式完全相同，程式不用因模式而改。Demo 的資料窗口足夠計算所有 screening 指標，
所以 Demo 與 Full 跑出的 Candidate 相同；差別只在 Demo 沒有長期歷史。

## A. Fixture：不需要資料庫

直接讀 [`packages/taiwan_data/tests/fixtures/sample_screening_output.json`](../../packages/taiwan_data/tests/fixtures/sample_screening_output.json)
（真實資料 8 檔、32 筆 Evidence）。格式說明見 [candidate-evidence-contract.md](candidate-evidence-contract.md)。

## B／C. 建立環境並下載資料

Windows（PowerShell）：

```powershell
git clone https://github.com/Gule7309/trading_radar.git
cd trading_radar
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -e "packages/taiwan_data[test]"

$env:TAIWAN_DATA_DB = "$PWD\var\data\taiwan_stock.sqlite"
.venv\Scripts\taiwan-data.exe download --demo     # 模式 C 去掉 --demo
.venv\Scripts\taiwan-data.exe status
```

macOS／Linux：

```bash
python3.12 -m venv .venv
.venv/bin/pip install -e "packages/taiwan_data[test]"
export TAIWAN_DATA_DB="$PWD/var/data/taiwan_stock.sqlite"
.venv/bin/taiwan-data download --demo
```

`download` 會自動驗證 SHA-256 與資料庫完整性，失敗時保留原本的檔案；版本沒變時直接跳過。
`var/` 已被 `.gitignore` 排除，資料庫不會被 commit。

## 產生 Candidate JSON

```powershell
.venv\Scripts\taiwan-data.exe screen --limit 20 --output var/output/candidates.json
```

常用參數：

| 參數 | 說明 |
|---|---|
| `--limit N` | 回傳前 N 名（1–50） |
| `--as-of YYYY-MM-DD` | 以過去某天為基準（預設今天） |
| `--min-liquidity 50000000` | 改流動性門檻（元）；`0` 關閉 |
| `--max-debt-ratio 60` | 負債比上限（%） |
| `--exclude-industry 航運業` | 排除產業，可重複 |
| `--include-disposition` | 不排除處置中股票 |
| `--profile profile.json` | 用檔案提供完整 profile（camelCase，見契約文件） |

相同條件、相同資料重跑會得到同一個 `runId`，不會重複寫入。

Python 直接呼叫：

```python
from taiwan_data.db import DataStore
from taiwan_data.screening import Profile, get_candidates

store = DataStore("var/data/taiwan_stock.sqlite")
doc = get_candidates(store, Profile(max_debt_ratio=60), limit=20)
print(doc["run"]["revenueAsOf"], [c["stockId"] for c in doc["candidates"]])
```

Node 呼叫 CLI：

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

execFileSync(".venv/Scripts/taiwan-data.exe",   // macOS／Linux：.venv/bin/taiwan-data
  ["screen", "--limit", "20", "--output", "var/output/candidates.json"],
  { env: { ...process.env, TAIWAN_DATA_DB: "var/data/taiwan_stock.sqlite" } });
const doc = JSON.parse(readFileSync("var/output/candidates.json", "utf8"));
```

## 直接查 SQL

建議以**唯讀**模式開啟，避免誤寫：

```python
import sqlite3
conn = sqlite3.connect("file:var/data/taiwan_stock.sqlite?mode=ro", uri=True)
```

```sql
-- 某檔最近 60 日收盤與成交金額（元）
SELECT trade_date, close, turnover FROM daily_prices
WHERE stock_id = '2330' ORDER BY trade_date DESC LIMIT 60;

-- 最近 13 個月營收（千元）與年增率（%）
SELECT year_month, revenue, yoy_pct FROM monthly_revenue
WHERE stock_id = '2330' ORDER BY year_month DESC LIMIT 13;

-- 單季營業利益率趨勢（請用 *_quarter 欄位，不要用累計值）
SELECT year, quarter, operating_margin_quarter, debt_ratio, available_date
FROM quarterly_financials WHERE stock_id = '2330' ORDER BY year DESC, quarter DESC LIMIT 8;

-- 目前處置中的股票（SQLite 的 now 是 UTC，+8 小時換成台北日期）
SELECT * FROM disposition_events WHERE date('now', '+8 hours') BETWEEN start_date AND end_date;

-- 現行股票與產業
SELECT stock_id, stock_name, market, industry_code FROM stocks WHERE is_active = 1;
```

欄位單位與陷阱見 [data-dictionary.md](data-dictionary.md)。最容易踩的幾個：

- `stock_id` 是文字，`'0050'` 不能寫成 `50`。
- 月營收與財報金額是**千元**，成交金額是**元**，成交量是**股**，融資融券是**張**。
- `quarterly_financials` 的 `revenue`、`operating_margin` 等是**年初至今累計**；跨季比較請用 `*_quarter`。
- 判斷是否已下市用 `stocks.is_active`，不要用 `delisted_stocks`（含上櫃轉上市）。
- 回測時財報要用 `available_date`、月營收要用「次月 10 日」限制可見資料，避免前視偏誤。

## 使用規則

1. **不要寫入資料庫**。唯一例外是 `screen`，它只會新增 screening 結果，不改原始資料。
2. **不要把 SQLite 放進 Google Drive／OneDrive／Dropbox 同步資料夾**，也不要多人共用同一個檔案。每人各自下載一份。
3. 維護者發佈新版後，重跑 `download` 即可更新。`download` 會**整個取代**本機資料庫，你本機的 screening 結果會消失（重跑 `screen` 就會回來）。
4. 不要對 Demo DB 執行 `refresh` 或 `backfill`；資料更新只在維護者的完整資料庫上進行。
5. 這是研究用資料，不構成投資建議（見 [limitations-and-decisions.md](limitations-and-decisions.md)）。

## 常見問題

| 狀況 | 原因與處理 |
|---|---|
| `請用 --db 或 TAIWAN_DATA_DB 指定 SQLite 路徑` | 沒有設定環境變數；設定 `TAIWAN_DATA_DB` 或加 `--db` |
| `download` 回報 SHA-256 不符 | 下載中斷或檔案損毀；重跑即可，原檔不受影響 |
| `download` 拒絕替換，提到 `-wal` | 有程式正在開著資料庫（DB 工具、Notebook、另一個終端機）；關掉後再試 |
| `screen` 回報 `ScreeningError`（沒有涵蓋率達標的月份／季度） | 資料太舊或 `--as-of` 太早；先 `download` 取得新版 |
| `limit 必須介於 1 與 evidence_top_k（50）之間` | 一次最多 50 名 |
| Windows 終端機中文變亂碼 | 主控台編碼問題，資料本身沒壞；用 `--output` 寫檔，或先執行 `$env:PYTHONIOENCODING = "utf-8"` |
| 9 月營收已公布，但 `revenueAsOf` 還是 8 月 | 正常：涵蓋率未達 95% 前不會切換月份，避免不同公司用不同月份比較 |
| `screen` 回報某天「行情只有 N 筆」 | 窗口內某個交易日缺了一部分資料（多半是某市場當天抓取失敗）；等維護者補齊並重新發佈，或用 `--as-of` 避開 |
| `priceAsOf` 比最新交易日早一天 | 正常：最新一天資料不完整（例如只有上市）時，會退回前一個完整交易日 |
| 想要新欄位或新指標 | 開 Issue 描述需求；不要在使用端自行修改資料庫 |
