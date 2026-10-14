# Kevin 的 Live 接線與 Demo 指南

2026-10-14。前端在 `feat/frontend-live-demo`（基於已合併 PR #6 的 main）；本機 B worktree 在 `fix/live-controller-output-limits`，基於 `b4b29025e7bdbffcdf625a57e8c6805c20b78ff0`，已提交 controller 輸出長度提示修正 `01eef3fa5336eb33ee9e89b087771287b4da7a6e`；原有查證與發布門檻保留。待 live 驗收成功後再凍結錄影 commit。

## 1. Gemini key 放在後端

本機檔案：`C:\Code\trading_radar_backend\.env`。已建立空白金鑰欄位，僅在自己的編輯器填入：

```dotenv
GEMINI_API_KEY=你的金鑰
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_SEARCH_MODEL=gemini-3.1-flash-lite
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-flash-lite
SEARCH_PROVIDER=gemini-google-search
PORT=8787
CORS_ORIGIN=http://localhost:5173
SQLITE_PATH=C:/Code/trading_radar_backend/var/research-demo.sqlite
TAIWAN_DATA_DB=C:/Code/trading_radar/var/data/taiwan_stock_demo.sqlite
TAIWAN_DATA_CLI=C:/Code/trading_radar/.venv/Scripts/taiwan-data.exe
TAIWAN_DATA_SCREEN_TIMEOUT_MS=120000
ENABLE_DAILY_SCHEDULER=false
```

B 的 `npm run api` 自動載入工作目錄的 `.env`。檔案受 Git 忽略；不要把 key 放進任何 `VITE_` 變數或錄影片段。市場資料與研究結果使用不同 SQLite 檔。依 Kevin 降低成本的要求，研究與搜尋均改用 `gemini-3.1-flash-lite`；[Google 官方模型說明](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)列出 structured outputs 與 search grounding。金鑰本身不決定程式使用哪個模型。

2026-10-14 核對的[標準付費價格](https://ai.google.dev/gemini-api/docs/pricing)：每百萬文字輸入 token US$0.25、輸出（含 thinking）US$1.50；比 3.8 當日優惠價 US$0.75／US$3.75 分別低約 67%／60%。不含 Google Search 等工具費；此模型的 Google Search API 免費層不提供，付費層有跨 Gemini 3+ 模型共享的每月免費搜尋額度，超出另計。不能把降低 token 單價視為解除帳號配額或保證較少 503。

## 2. 真實資料來源

資料不在 Git 程式碼中，而在 [data-latest Release](https://github.com/Gule7309/trading_radar/releases/tag/data-latest)。目前發布版為 2026-10-10，行情截至 **2026-10-08**，不能稱為今天最新行情。使用完整快照可後續更新；Release 的 demo 是真實資料的縮減快照，也不是 fixture，但不適合繼續回補。

本次完整快照下載未成功，已停止該下載；改用已通過官方工具 SHA-256 與 quick_check 的 demo 快照完成接線準備。本機實際使用 `var/data/taiwan_stock_demo.sqlite`，其輸出為 `var/output/demo-screening-release.json`。下列 full 下載／重新產出命令供後續更新使用；成功後才改 `.env` 的市場 DB 路徑，不要直接對 demo DB 執行 refresh／backfill。

```powershell
cd C:\Code\trading_radar
# 本機已建好 .venv 並安裝套件；換電腦時先安裝 Python >= 3.11：
# python -m venv .venv
# .venv\Scripts\python.exe -m pip install -e packages/taiwan_data
.venv\Scripts\taiwan-data.exe download --db C:/Code/trading_radar/var/data/taiwan_stock.sqlite
.venv\Scripts\taiwan-data.exe status --db C:/Code/trading_radar/var/data/taiwan_stock.sqlite --json
.venv\Scripts\taiwan-data.exe screen --db C:/Code/trading_radar/var/data/taiwan_stock.sqlite --limit 20 --output var/output/demo-screening-final.json
```

下載工具驗證壓縮檔與資料庫 SHA-256、SQLite quick_check，成功才安裝。匯入後核對 runId、三種資料日期、dataVersion、sourceSnapshot、counts、Candidate／Evidence 數及 risk flags。若更新資料，再重新產出 canonical JSON；不要混用不同版本。

## 3. 啟動與第一輪

兩個終端分開啟動。8787 若被 mock 佔用，先在原終端 Ctrl+C 結束它。

```powershell
cd C:\Code\trading_radar_backend
npm run api
```

```powershell
cd C:\Code\trading_radar\apps\web
npm run dev
```

本機 `apps/web/.env.local` 已準備 `VITE_DATA_MODE=live`、`VITE_RESEARCH_LIMIT=2`、`VITE_RESEARCH_CONCURRENCY=2`、`VITE_RESEARCH_TOP_K=5`。開啟 `http://localhost:5173`，先在系統頁確認 live／憑證／資料庫狀態，按模型測試，再匯入目前已驗證的 `var/output/demo-screening-release.json`。後續更新 full DB 並產出 final JSON 後，再更換正式錄影輸入。

先研究 2 檔，成功或合理拒絕後再調成 `LIMIT=4`、`CONCURRENCY=4` 並重啟 Vite。B 會強制 `researchLimit >= topK`，所以前端將送出的 topK 降為 `min(TOP_K, LIMIT)`；兩檔測試送 2，四檔展示送 4。這避免原建議 5/4/4 實際研究 5 檔。限制與併發必須為允許範圍的整數；錯誤設定不會悄悄改成較大批次。

前端維持 300 秒 timeout。逾時只表示前端尚未收到結果，後端可能仍執行；不要反覆按重試。若批次未成功送達瀏覽器，IndexedDB 不會憑空保存完整結果。

## 4. 錄影前驗收

1. 記錄前端與 B commit、JSON runId、開始／結束時間、實際研究數。
2. 記錄可發布、拒絕、略過及原因；低於 Top-K 不補假結果。
3. 從 B 的研究紀錄／telemetry 記錄 token、429、timeout、來源失敗；未設定價格時成本標示未知。批次回傳只包含 Top-K 的完整結果，不應把 Top-K token 加總冒充整批成本。
4. 至少一份真實 ResearchResult，開啟其中一個實際來源核對；`.invalid` 示範來源不算。
5. 前端收到結果後重新整理，確認 IndexedDB 可讀。固定使用同一瀏覽器、origin、API 位址、live 模式與 demo-user。
6. 錄影優先展示已完成結果；若剪接等待畫面，標示「研究等待時間已加速」。

本機 key 已配置，後端可啟動並讀取真實資料庫；模型與完整研究的驗收狀態見下方接線紀錄。

### 2026-10-14 最新驗收結果（16:42 Asia/Taipei）

- Kevin 更新金鑰／恢復額度後，最初仍收到 402；稍後結構化輸出成功（916 ms），Google Search 成功（4861 ms）。目前使用 `gemini-3.1-flash-lite`。
- 真實兩檔研究發現 controller 的 summary 超過 Zod 280 字限制。B 的 Gemini schema 轉換會移除 maxLength，因此在 schema description 與 system prompt 明確傳達字數上限；保留原本 Zod 驗證，沒有截斷結論或放寬發布門檻。修正位於 B 獨立分支。
- 修正後由前端按鈕送出真實 `20261014-001` 輸入，16:41:58.810 開始、16:42:35.443 完成，約 **36.6 秒**。HTTP 200，研究 2 檔：**2059 川湖 PUBLISHABLE**、**2305 全友 INSUFFICIENT_EVIDENCE**，另 18 檔因研究上限略過；沒有補上模擬結果。
- 川湖 runId `1d296bee-65dc-48a2-9534-fba615e7e7bc`。可直接開啟 `http://localhost:5173/runs/1d296bee-65dc-48a2-9534-fba615e7e7bc`，此連結從後端讀取，不依賴特定瀏覽器快取。
- 測試瀏覽器快照 ID `d664bd8d-a265-4f8c-8437-bd476a490d0b`。IndexedDB 僅存在完成此輪的瀏覽器；其他瀏覽器請使用上述 run 連結或執行紀錄，不保證共享本地快照。
- 已在前端打開研究、10 項證據與來源面板，並開啟實際新聞原文。上游 MOPS `https://mopsov.twse.com.tw/nas/t21/` 是目錄網址，實測 404；需 A 提供可定位資料期別的原始 URL，不將其算作已成功開啟的原文。
- 本次川湖回傳 metrics：llmCalls 26、inputTokens 86977、outputTokens 3866、totalLatencyMs 36052。併發 telemetry 有重疊，這些不能當成精確單股／整批帳單；estimatedCostUsd=0 也不代表免費（價格未配置）。
- 前端已補上模型失敗原因與相關歷史診斷連結，無可發布結果時仍顯示真實候選股；不把執行失敗描述為股票不適合投資。
- 瀏覽器實測收藏成功（理由「其他」，註記 Live 串接驗收），追蹤清單出現川湖與版本 1；thesisId `81e6879f-48fa-4e2d-9b27-b568d408d620`。重新整理後，IndexedDB 研究結果、後端收藏狀態均保留；另以獨立 `/runs/…` 連結確認可從後端讀取。自動重查未驗收，不宣稱已接通。
- 前端 14 項測試、TypeScript／production build 通過；B typecheck 與 Gemini adapter 3 項測試通過（含保留模型可見長度描述、仍拒收超長摘要）。B 既有 verification pipeline 測試落差見下文。
- 本機完整輸出：`var/output/live-published-2059.json`；金鑰與本機資料均不進 Git。

### 2026-10-14 早期模型接線紀錄（以下為歷史結果，不代表目前阻塞）

- 後續依 Kevin 要求試用 `gemini-2.5-pro`：使用現有 key 呼叫實際 B structured provider，Google 回傳 404 `NOT_FOUND`，明確表示此模型不再提供給新使用者，建議 `gemini-3.1-pro-preview`。尚未呼叫 Pro 搜尋，也未變更運行中的 Flash-Lite 設定；原始已遮蔽金鑰的診斷在 `var/output/live-pro-check.json`。

- **目前配置：`gemini-3.1-flash-lite`**，後端已重啟。實際 B structured provider 測試成功，耗時 1695 ms，回傳 `{ok:true}`，18 input tokens／5 output tokens。
- 同模型的 B Google Search provider 測試回傳 429 `RESOURCE_EXHAUSTED`，訊息為 exceeded current quota；需 Kevin 確認 key 所屬專案的方案／搜尋配額。沒有自動改動帳務，也沒有在搜尋失敗後啟動股票研究。
- 最新測試檔：`var/output/live-lite-model-check.json`、`var/output/live-lite-search-check.json`。以下 2.5／3.8 結果保留作歷史診斷。

- `gemini-2.5-flash`：Google 回傳 404，明確表示該模型不再提供給新使用者，建議使用 `gemini-3.8-flash`。
- Kevin 已同意沿用現有 key，研究與搜尋皆改成 `gemini-3.8-flash`。
- B `/health`、`/api/admin/status` 與 `/api/admin/data-status` 可用，live／憑證／市場 DB 均已配置，自動排程關閉。
- 3.8 初次模型檢查回傳 503 `UNAVAILABLE`（high demand）；延後重試約 5 分鐘後回傳 `fetch failed`。尚未送出兩檔股票研究，亦無 live ResearchResult 或新結果保存驗收。
- 使用同一 key 讀取 `models/gemini-3.8-flash` 資訊回傳 HTTP 200，並列出 `generateContent` 能力；證明模型資訊 API 可存取，但不代表內容產生請求成功。現有問題不可直接歸因於 key 填錯。
- 詳細紀錄位於本機 `var/output/live-model-diagnostic.json`、`live-model-access.json`、`live-connection-report.json`，未記錄金鑰。
- B 的每檔 token metrics 使用共享 telemetry 前後差值；併發研究時區間可能重疊。因此即使保存全部 run，也不能直接加總各 run token 作為精確整批成本，需 B 改為按請求／runId 計量或以供應商用量核對。

### 本次已驗證的真實輸入

- runId：`20261014-001`；篩選執行日 2026-10-14，行情日 2026-10-08、營收 2026-08、財報 2026Q2。
- dataVersion：`ds-130b1ff5d3e877e2`。
- sourceSnapshot：`sha256:2f477660d61fc2216303bf6af56d79443fd59c48679b185c78d75705ff1cfbff`。
- universe 2394、baseEligible 1639、ranked 436；輸出 20 Candidate、80 Evidence。
- 前五檔：2059 川湖（notice）、2305 全友（notice）、2408 南亞科、7828 創新服務、3653 健策（notice）。
- 用 B 的真實 Zod schema 與 `screeningOutputToCandidatePackets` 轉換成功；逐項比對市場、risk flags、資料日期／版本、80 個唯一 Evidence ID 及完整 upstream evidence 內容，均保留。
- 前端 AJV 接受該 JSON，瀏覽器顯示 20 檔候選與正確資料期別。後端未啟動時，研究按鈕停用並顯示連線提示。
- 瀏覽器確認 live 模式拒絕內建 fixture，匯入真實 JSON 後可恢復；390／1440 px 沒有水平溢出。API 未啟動造成的 connection refused 屬預期，未當作 live API 通過。
- 快照的 14 個 dataset status 皆為 success，但不代表已更新至 2026-10-14；9 月營收仍未存在於這份快照。
- 詳細輸入檢查：`var/output/real-input-contract-check.json`；資料狀態：`var/output/data-status-release.json`（本機檔案不進 Git）。

前端 14 個單元測試與 TypeScript／production build 通過。B 的 typecheck 通過；選定的 adapter、publication gate、verification pipeline 共 14 個測試中 13 通過、1 失敗：`tests/verification-pipeline.test.ts:171` 預期僅 1 個保留風險，實際為 2 個（新增 grounded upstream notice risk）。此為 B commit `b4b2902` 的既有測試／行為落差，尚未修改，需 Xavier 確認後再凍結 Demo 版本。這不是前端契約轉換失敗。

## 5. 持續追蹤的已知缺口

目前 main 與上述 B commit 內的 Python CLI 都沒有 `inspect` 子命令，但 B 的 `CliScreeningProvider.inspectTicker` 會呼叫 `inspect --stock-id <代號>`。因此「自動取得單股最新資料再重查」尚不能驗收，需取得 Xavier 含 inspect 的分支／commit。手動提供合約正確的新 Candidate 走既有重查 API 是另一條路徑，不代表自動追蹤已打通。

每日排程保持關閉。資料更新應在取得完整快照後，依 `docs/data/operations.md` 手動執行並檢查每個 dataset status；沒有成功更新，不改寫畫面的資料日期。

## 6. 錄影版本與現有結果

前端使用本指南所在的 `feat/frontend-live-demo` commit；用 `git rev-parse HEAD` 記錄完整 SHA。B 固定 `01eef3fa5336eb33ee9e89b087771287b4da7a6e`（基於 `b4b2902`）。兩個分支分別提出 PR，錄影不以 merge 為前提。

錄影前保留本機研究 DB，先啟動 B 與前端，直接開啟上述川湖 run 連結及追蹤清單。結果是已完成的真實研究，不宣稱現場即時產生。行情日期仍標示 2026-10-08；自動每日更新／單股刷新未完成，勿展示成已啟用。Git 不包含 DB、金鑰或 IndexedDB，換電腦不會自動帶入這些結果。
