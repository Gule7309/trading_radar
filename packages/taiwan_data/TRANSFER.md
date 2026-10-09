# 搬到另一個 repo

## 建議目錄

```text
other-repo/
├─ packages/
│  └─ taiwan_data/          # 本 package 原始碼；或改裝 wheel
├─ var/
│  └─ data/
│     └─ taiwan_stock.sqlite
└─ .gitignore
```

`.gitignore` 至少加入：

```gitignore
var/data/*.sqlite
var/data/*.sqlite-wal
var/data/*.sqlite-shm
```

不要把 1 GB SQLite 寫進一般 Git history。團隊共享時用 release artifact、Git LFS、
內部物件儲存或共用磁碟；下載後必須比對 manifest 的 SHA-256。

## Python 專案

```powershell
python -m pip install .\taiwan_stock_data-0.1.0-py3-none-any.whl
$env:TAIWAN_DATA_DB = "$PWD\var\data\taiwan_stock.sqlite"
taiwan-data status
taiwan-data refresh all
taiwan-data manifest --artifact .\taiwan_stock_data-0.1.0-py3-none-any.whl
```

## Node／TypeScript 專案

Node app 可直接用 SQLite driver 讀 `TAIWAN_DATA_DB`；更新工作仍由這個 Python CLI 執行，
不必把已驗證的官方站台解析器重寫一次。建議讓應用程式只讀 DB，排程工作負責寫入。

應用程式至少檢查：

```sql
SELECT * FROM dataset_status ORDER BY dataset;
SELECT MAX(trade_date) FROM daily_prices;
SELECT MAX(year_month) FROM monthly_revenue;
SELECT MAX(year * 10 + quarter) FROM quarterly_financials;
```

## 排程與持久化

每日收盤後執行：

```text
taiwan-data refresh all
```

SQLite 必須位於持久化磁碟。一般 GitHub-hosted Actions runner 每次都是新的；若使用它，
workflow 開始時要下載上一版 snapshot，完成後再上傳到持久化 artifact／物件儲存。
不要只在 runner 裡更新後結束，否則資料會隨 runner 消失。

月營收與財報指令可每天重跑，primary-key upsert 會覆蓋同一期，不會產生重複資料。

## 已知限制

- 官方財報 OpenAPI 只提供最新一般業季度；舊季資料不能靠此端點回補。
- 產業分類目前從舊 snapshot 帶入，尚未自動更新。
- 停牌、無營收且不在下市清單的少數舊代號可能缺少 `stock_name`；不要自行猜名稱。
