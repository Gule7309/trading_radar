# Taiwan Stock Data Kit

這是從 `taiwan_stock_advisor` 拆出的可攜資料層。它把研究資料與後續更新能力收斂到同一個 SQLite，另一個專案不需要 Neon、FinMind 或舊專案的 agent 程式。

## 提供的資料

- 股票 master（上市／上櫃代號、名稱、市場）
- 日價量 OHLCV 與成交金額
- 三大法人
- 月營收、MoM、YoY
- 2015 起上市櫃季財報（原始累計值＋推導單季值，含保守可用日與報表類型）
- 融資融券（上市＋上櫃）
- 除權息事件（上市＋上櫃）
- 處置股、注意股（上市＋上櫃）
- 上市下市與上櫃終止上櫃清單
- 產業對照、上市櫃日期（官方公司基本資料補缺漏）
- 每次抓取的狀態、資料日期、來源與錯誤紀錄

日常更新使用官方 OpenAPI；歷史季報由 MOPS 彙總報表回補。金融、保險、證券等特殊格式會保留
可比較的淨利、EPS 與資產負債欄位，不把產業專屬收入硬套成一般業營收。
各資料集的來源、資料契約與 checkpoint 規則見 repo 的 `docs/data/README.md`。

## 在本 repo 建立 snapshot

```powershell
cd packages/taiwan_data
..\..\.venv\Scripts\python.exe -m pip install -e ".[bootstrap]"
taiwan-data bootstrap `
  --source-db ..\..\data\research\research.db `
  --parquet-dir ..\..\data\research `
  --out ..\..\data_release_bundles\taiwan_data_kit_20261009\taiwan_stock.sqlite
taiwan-data status --db ..\..\data_release_bundles\taiwan_data_kit_20261009\taiwan_stock.sqlite
```

Bootstrap 會使用 SQLite backup 建立新檔，不會修改來源 `research.db`。較新的 Parquet 資料會用 primary key upsert 補進 snapshot。

## 搬到另一個 repo

程式碼與資料分開：

1. 把本目錄放進另一個 repo 的 `packages/taiwan_data/`，或把它獨立成 Git repo 後安裝固定 commit。
2. 把 `taiwan_stock.sqlite` 當 release artifact、Git LFS 檔案或內部物件儲存下載項目，不放一般 Git history。
3. 在另一個 repo 安裝：

```powershell
python -m pip install -e "packages/taiwan_data"
```

4. 設定資料庫路徑並更新：

```powershell
$env:TAIWAN_DATA_DB = "$PWD\var\data\taiwan_stock.sqlite"
taiwan-data refresh all
taiwan-data status
```

`refresh all` 依序補行情／法人缺口、更新股票 master、月營收、最新季財報、融資融券、除權息、
處置／注意股、下市清單與產業對照，所有寫入都使用 idempotent upsert。單一資料集失敗不阻斷其他
項目，結束時以 exit code 1 回報。

## CLI

```text
taiwan-data bootstrap --source-db PATH --parquet-dir PATH --out PATH
taiwan-data refresh all --db PATH --lookback-days 5
taiwan-data refresh market --db PATH --since 2026-08-01 --until 2026-10-09
taiwan-data refresh margin --db PATH --since 2026-08-01
taiwan-data refresh revenue --db PATH
taiwan-data refresh financials --db PATH
taiwan-data refresh stocks --db PATH
taiwan-data refresh dividends --db PATH
taiwan-data refresh disposition --db PATH
taiwan-data refresh delisted --db PATH
taiwan-data refresh industries --db PATH
taiwan-data backfill all --db PATH --since 2015-01-01
taiwan-data backfill financials --db PATH --since 2015-01-01
taiwan-data backfill disposition --db PATH --since 2015-01-01
taiwan-data backfill margin --db PATH --since 2015-01-01
taiwan-data backfill institutional --db PATH --since 2015-01-01
taiwan-data backfill institutional --db PATH --market TPEX --since 2015-01-01
taiwan-data backfill delisted --db PATH
taiwan-data status --db PATH --json
taiwan-data manifest --db PATH --artifact dist/taiwan_stock_data-0.1.0-py3-none-any.whl
```

資料更新完、準備交付 artifact 前執行 `manifest`，讓檔案大小、各表範圍與 SHA-256
反映更新後的 SQLite。

建議由使用端 repo 的 GitHub Actions／cron 呼叫 CLI，不在 package 內常駐背景服務。
