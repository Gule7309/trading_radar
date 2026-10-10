# 每日更新上雲規劃

狀態：**規劃中**。目前用本機 Windows 工作排程器（見 [README](README.md)），這份文件記錄
之後搬上雲端的選項與建議做法。

## 限制條件

- 資料是單一 SQLite 檔，約 1.07 GB，每年約增加 100–150 MB（行情、法人、融資融券各約
  50 萬列／年）。
- 每日工作約 5–10 分鐘，時間幾乎都花在對官方站台的禮貌間隔；CPU、記憶體需求很低。
- 資料來源全部是公開端點，不需要 API key；雲端只需要存放 DB 的權限。
- 同一時間只能有**一個寫入者**。本機與雲端不能同時排程寫同一份資料。

## 選項比較

| 方案 | 做法 | 優點 | 缺點 |
|---|---|---|---|
| A. GitHub Actions＋Release asset | cron 觸發 → 下載上一版 DB → refresh → 上傳覆蓋 | 免費、設定都在 repo | 舊專案實測排程常延遲 4–10 小時；每天上下傳 1 GB；runner 在海外 |
| B. 小型 VM＋持久磁碟 | 和本機相同：cron＋本地 SQLite | 最簡單、和現在行為一致 | 要維護 OS／更新；常駐費用約 USD 5／月 |
| **C. 容器批次工作＋物件儲存** | 排程器觸發容器 → 從 bucket 拉 DB → refresh → 驗證 → 有條件上傳 | 不用維護主機、按次計費（幾乎免費）；可選台灣區域 | 要先把工作容器化、處理上傳競態 |
| D. 改用雲端資料庫 | 改寫 DataStore 到 Postgres／libSQL | 多個應用可直接查詢 | 改動最大；舊專案已在 Neon 燒過傳輸配額 |

**建議 C**，例如 GCP Cloud Run Jobs＋Cloud Scheduler＋Cloud Storage（asia-east1，彰化），
或其他雲的同類組合。理由：資料層本來就是「CLI＋單檔 DB」，拉下來跑完再推回去最貼近現況；
台灣區域對官方站台延遲低，也降低海外 IP 被擋的風險。GitHub Actions 可當備援觸發器，
用 OIDC 換短期雲端憑證，不保存長期金鑰。

## 不論哪個方案都要先做的事

1. **工作封裝**：加一個 `Dockerfile`（Python 3.12＋`packages/taiwan_data`），
   入口就是 `taiwan-data refresh all --lookback-days 5`。
2. **拉取／推送步驟**（建議做成 CLI 子命令或獨立腳本）：
   - 下載 DB 與 manifest，驗證 SHA-256；
   - refresh 後跑 `PRAGMA integrity_check` 與 `taiwan-data status`，資料筆數不得變少；
   - `taiwan-data manifest` 重算 SHA-256；
   - 以「物件版本相符才寫入」的條件上傳（GCS generation precondition 或 S3 ETag），
     避免兩個工作互相覆蓋；保留最近 N 版供回滾。
3. **通知**：exit code 非 0 或 `dataset_status` 出現 `failed`／`partial` 時發通知
   （舊專案用過 Telegram）。
4. **讀取端**：應用程式只讀，從 bucket 下載最新版並比對 manifest；不直接寫入。

## 切換步驟

1. 雲端工作先以「乾跑」模式跑幾天：寫到另一個物件路徑，和本機結果比對 `status`。
2. 停用本機排程（`Unregister-ScheduledTask -TaskName TradingRadarDailyData`），
   把本機最新 DB 上傳為基準版。
3. 切換為正式路徑；本機改為只讀下載。
