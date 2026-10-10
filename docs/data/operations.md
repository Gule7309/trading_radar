# 維運手冊（給資料維護者）

完整資料庫只有一份、只有一個寫入者。這份文件記錄日常更新、發佈給隊友、備份與故障排除的做法。
指令中的 `taiwan-data` 在 Windows 為 `.venv\Scripts\taiwan-data.exe`，並假設已設定
`$env:TAIWAN_DATA_DB = "$PWD\var\data\taiwan_stock.sqlite"`。

## 核心原則

1. **單一寫入者**：同一時間只能有一個程序寫完整資料庫（每日排程、回補、`manifest`、`snapshot` 都算）。
   本機與未來的雲端排程不能同時寫。
2. **原始資料只由官方來源寫入**；使用端只讀。`screen` 只新增 `screening_*` 資料表。
3. **任何發佈或備份都用 SQLite 的一致性機制**（`VACUUM INTO`），不要在資料庫使用中直接複製檔案。
4. **絕對不要手動刪除 `-wal` 檔**：裡面可能有尚未合併的資料，刪掉等於遺失資料。

## 每日更新

排程：週一至五 21:30，執行 `scripts/windows/daily_update.ps1`（`refresh all --lookback-days 5`）。
細節見 [README](README.md) 的「每日排程（本機）」。

每次執行後檢查：

| 位置 | 看什麼 |
|---|---|
| `var/logs/daily_summary.log` | 最後一行的 `exit=0`（1 代表有資料集失敗） |
| `var/logs/status_<時間>.json` | 各表筆數與最大日期 |
| `taiwan-data status` | `dataset_status` 中是否有 `partial` 或 `failed` |

- 單日抓取失敗會記為 `partial`，之後 5 天內的排程會自動重抓。
- 超過 5 天的缺口：`taiwan-data refresh market --since YYYY-MM-DD`（融資融券用 `refresh margin`）。
- 官方站台偶爾回傳非 JSON（多半是限流），錯誤訊息會是 `JSONDecodeError`；隔一段時間重跑即可。

## 發佈新資料給隊友

Release `data-latest` 上的快照是靜態的，需要時（例如月營收或季財報更新後、重要 Demo 前）手動發佈：

```powershell
# 0. 確認沒有其他程序在寫資料庫（排程、回補），且 -wal 為 0 bytes 或不存在
Get-Process taiwan-data -ErrorAction SilentlyContinue

# 1. 健康檢查
taiwan-data status

# 2. 更新本機 manifest（SHA-256 與 data_version；之後的 screening run 會引用它）
taiwan-data manifest

# 3. 產生快照（輸出到專案外的資料夾）
taiwan-data snapshot --kind demo --out-dir <dir> --version 2026-11-15
taiwan-data snapshot --kind full --out-dir <dir> --version 2026-11-15

# 4. 上傳（同名覆蓋 manifest；新版本檔名不同，會與舊檔並存）
gh release upload data-latest <dir>\manifest-demo.json <dir>\manifest-full.json `
  <dir>\taiwan_stock_demo_2026-11-15.sqlite.gz <dir>\taiwan_stock_full_2026-11-15.sqlite.gz --clobber

# 5. 驗證：用預設網址下載到暫存位置
taiwan-data download --demo --db <暫存路徑>\check.sqlite
```

完成後：

- 更新 Release 說明中的版本與資料日期：`gh release edit data-latest --notes "..."`。
- 舊版快照可刪除以免混淆：`gh release delete-asset data-latest taiwan_stock_full_<舊版本>.sqlite.gz`。
  `manifest` 只指向最新檔，舊檔不影響下載。
- 通知隊友重跑 `taiwan-data download`。
- 更新 [data-status.md](data-status.md) 的日期與數字。

## 備份

建議：每次發佈前、執行大型回補或 schema 變更前，各做一次。備份放在**專案外、另一顆磁碟**，並保留最近幾份。

```python
# backup.py：一致性備份 + SHA-256 + 每張表筆數比對
import hashlib, json, sqlite3, sys
src, dst = "var/data/taiwan_stock.sqlite", sys.argv[1]          # dst 例如 <備份資料夾>/taiwan_stock_2026-11-15.sqlite
sqlite3.connect(src, timeout=600).execute("VACUUM INTO ?", (dst,))
with open(dst, "rb") as f:
    h = hashlib.file_digest(f, "sha256").hexdigest()       # 串流計算，不會整個讀進記憶體
def counts(p):
    c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    names = [r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
    return {n: c.execute(f'select count(*) from "{n}"').fetchone()[0] for n in names}
assert counts(src) == counts(dst), "筆數不一致"
assert sqlite3.connect(dst).execute("pragma quick_check").fetchone()[0] == "ok"
json.dump({"file": dst, "sha256": h, "table_row_counts": counts(dst)}, open(dst + ".manifest.json", "w"), indent=2)
print(h)
```

GitHub Release 上的 full 快照也是一份異地備份，但它只在發佈時更新。

## WAL 與長時間讀取

資料庫使用 WAL 模式。寫入先進 `-wal` 檔，沒有讀取者時才合併回主檔。

**2026-10-10 的實際案例**：兩個卡住的唯讀查詢程序從凌晨一直開著，擋住合併，`-wal` 長到 **12.5 GB**
（主檔只有 1.1 GB）。處理方式：

1. 找出長時間開著資料庫的程序（PowerShell：`Get-CimInstance Win32_Process` 篩選命令列含 `taiwan_data` 者）。
2. 確認它們只是唯讀查詢後結束它們。
3. 手動合併：

   ```python
   import sqlite3
   print(sqlite3.connect("var/data/taiwan_stock.sqlite", timeout=600).execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall())
   # 第一個值為 0 代表成功；為 1（busy）代表仍有讀取者
   ```

預防：查詢腳本用完要關連線；不要讓 Notebook 或 DB 工具長時間開著完整資料庫；`-wal` 超過幾百 MB 就該檢查。

## 歷史回補

```powershell
taiwan-data backfill institutional --since 2015-01-01 --delay 2
```

- 進度記在 `backfill_checkpoints`，中斷後重跑會跳過已成功的單位。
- `--market TWSE|TPEX` 可分市場執行（融資融券、法人）；**不要同時開兩個回補程序寫同一個資料庫**。
- 被限流時加大 `--delay`。
- 完成度要看 `backfill_checkpoints` 與缺口數，不能只看資料表最大日期。

目前所有資料集的回補都已完成（見 [backfill-evaluation.md](backfill-evaluation.md)）。

## 復原

| 狀況 | 做法 |
|---|---|
| `quick_check` 不是 ok／資料庫損毀 | 從最近的備份還原，或 `taiwan-data download`（full）取得 Release 版本，再執行 `taiwan-data refresh all --lookback-days <落後天數>` 補到最新 |
| 誤刪或誤改資料 | 同上；備份與 Release 都附 SHA-256 與筆數可核對 |
| 每日更新長期失敗 | 看 `var/logs/*.err.log` 與 `dataset_status.error`；官方端點改版時需要修 fetcher 並補測試 |

## Schema 變更

- `ensure_schema()` 每次執行都會套用 `schema.sql`，只能做**新增**（`CREATE TABLE IF NOT EXISTS`、補欄位）。
- 變更時同步更新 `schema_version`、[data-dictionary.md](data-dictionary.md) 與測試。
- 動到 Candidate／Evidence 輸出時，依 [契約文件](candidate-evidence-contract.md#版本與變更規則) 判斷是否要升版，並重新產生 fixture：

  ```powershell
  taiwan-data screen --limit 8 --output packages/taiwan_data/tests/fixtures/sample_screening_output.json
  ```

## CI

每個 PR 會跑 GitHub Actions（`.github/workflows/ci.yml`）：`taiwan-data`（完整 pytest）與 `validate`。
CI 不使用真實資料庫；測試用合成資料，fixture 只驗證結構。

## 之後上雲

規劃見 [cloud-scheduling.md](cloud-scheduling.md)：建議容器批次工作＋物件儲存，切換時先乾跑比對，再停用本機排程，
確保仍只有一個寫入者。
