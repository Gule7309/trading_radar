# 前端整合與後端待補項目

核對版本：2026-10-13，B commit `f4755065f4eb1c66cadcb154eefdf5800ffac67b`。本回合未修改後端業務程式。

## 已接畫面與資料

| 畫面 | API / response | 前端處理 |
| --- | --- | --- |
| 啟動與系統 | `/health`、`/api/admin/status` | capability 停用狀態；確認 mock/live；寫入前重新核對模式。 |
| 研究偏好 | profile GET/PUT、reset-soft、screening-profile | 後端預設、三步設定、硬／軟分開、實際權重、下載 A 設定。 |
| 研究摘要 | POST screening-output | 完整 input + userId + options；解析包裝層及 `top[].result`，以 ticker 對應量化候選。 |
| 證據 | A `evidence`、B `sources` | A 在同一 run 忽略 ID 大小寫；B 在同一 result 精確匹配 sourceId。HTTP(S) 以外網址不開啟。 |
| 回饋 | feedback POST/GET、preference-history | action 對應原因、後端確認、before/after/delta、失敗同步。 |
| 追蹤 | watchlist GET/DELETE、recheck、thesis/versions/events | 原始版本與新版本比較、反駁／衝突、事件、移除不撤回回饋。 |
| 歷史研究 | runs/{id}、tickers/{ticker}/runs | 解析 StoredResearchRun 包裝；404 舊紀錄說明；歷史來源只在時間戳可唯一對應研究時解析。 |
| 通知 | notifications GET、read POST | 30 秒查詢、ID 去重、閱讀與顯示分開、明確權限入口。 |
| 每日任務 | daily-research、delivery-runs | success / reused / waiting 三分支；部分追蹤重查失敗保留明確提示。 |
| 系統診斷 | model-check、data-status | 實際模型／資料狀態；無金鑰輸入或假模型切換。 |

## 整合時確認的契約差異

1. `/api/research/screening-output` 回傳含 `screeningRunId`、`dataVersion`、`sourceSnapshot`、`personalization` 的包裝；`daily-research.result` 只是 core `BatchResearchResult`，**沒有上述包裝欄位**。前端分開驗證，以 daily 同次 `screeningOutput.run` 和其 `profile.weights` 保存追溯資料，不從另一輪補值。
2. 管理狀態的 `registeredUsers` 是數字；`latestDeliveryRuns` 是精簡摘要，不是完整 `DailyDeliveryRun[]`。
3. API 錯誤通常為 `{ error: "CODE", ... }`，不是巢狀 `{ error: { code } }`。前端保留原始 code，包含兩種研究 404。
4. Profile 的 `maxDebtRatio` 要求正數或 null；不把 0 當成合法上限。日期、enum、偏好資料仍以各公開 DTO 處理。
5. `top` 不含所有已研究成功項目；第 6 名之後的可發布結果也不一定出現在 `rejectedOrSkipped`，所以「未回傳拒絕項目」不能翻譯成「其餘全部拒絕」。

## 待 B／A 補強

| 缺口 | 目前處理 | 建議後端交付 |
| --- | --- | --- |
| 完整每日歷史結果 GET | IndexedDB 保留曾收到的完整結果；沒快取只顯示送達摘要，不偷偷 POST 重跑。 | 以 deliveryRunId 取回該輪 input、result、weights、watchlistRechecks。 |
| 伺服器端取得單股最新 CandidatePacket | 正式模式用每日重查或匯入日期較新的資料包，不默默重用舊 packet。 | ticker + event 的最新資料解析與重查 API；資料版本比單一 asOf 更能辨認同日新事件。 |
| 歷史論點與研究來源的明確關聯 | 只有版本 createdAt 與唯一同股票 run.completedAt 對應時提供來源；其餘說明缺文件。 | ThesisVersion 加 researchRunId；來源文件帶不可變版本 ID，避免同 ID 跨版本混用。 |
| 前端中斷後查詢長任務結果 | 300 秒逾時後說明後端可能仍執行；不自動重送。 | operationId、status/result GET，必要時提供 SSE。 |
| 回饋冪等與原子性 | 同 run/action 成功後停用，網路／500 結果不明時鎖住重送並引導查紀錄。 | Idempotency-Key、相同請求回傳既有結果；feedback、profile、watchlist 使用原子交易。現有 SAVE 若後段失敗，前段偏好可能已寫入。 |
| 未啟用 admin 的環境辨識 | 無法確認模式時保守停止寫入。 | `/health` 加明確 environment 與 instanceId，供快取隔離、重啟辨識。 |
| 全市場個股查詢 | 未虛構不存在的輸入搜尋。 | 搜尋／個股資料與對應 research endpoint。 |
| 最新資料與交易日判定 | 始終列 localDate、priceAsOf、實際執行時間；不由前端猜休市日。 | 正式環境交易日來源、排程與資料可用時間規則。 |
| 排程重啟補跑驗證 | Mock 排程為關閉，不宣稱已驗證真實 scheduler。 | 啟用真實環境並提供補跑／節假日／失敗案例。 |
| 來源擷取與引用精度 | 公開 result 無 snippet/retrievedAt，據實顯示未提供。 | 如需內文查證，擴充安全可公開的摘錄、擷取時間及版本。 |

前端負責展示和操作，不實作排名、publication gate、證據裁決、論點狀態判定或交易功能。

## 2026-10-14 Live 接線補充（含歷史診斷）

- B `b4b2902` 的 batch service 以 `max(topK, researchLimit)` 決定研究數；前端已將 Top-K 限制在設定的研究上限內，避免 5/4/4 意外跑 5 檔。
- main 與 B 該 commit 的 Python CLI 沒有 `inspect`；B 卻呼叫 `inspect --stock-id`，單股自動刷新仍缺 A 的對應實作／分支。
- B `verification-pipeline.test.ts:171` 風險保留測試預期 1 個、實際 2 個；需確認新增 notice risk 與既有測試的預期。adapter 的 5 個測試及 publication gate 的 7 個測試通過。
- 已用 Release 的真實資料縮減快照產生 20 檔／80 證據並完成 A→B adapter 與前端匯入檢查。Key 已配置，2.5 對新使用者回傳 404，經 Kevin 同意改為 3.8；模型資訊 GET 成功，但內容產生先回傳 503，延後重試約 5 分鐘後連線失敗。尚無 live ResearchResult，也未送出股票研究。完整細節見 [Live 接線指南](LIVE_DEMO_SETUP.md)。
- 後續依 Kevin 的成本要求改為 3.1 Flash-Lite：結構化輸出實測成功（1695 ms）；Google Search 實測回傳 429 額度不足。目前瓶頸為搜尋服務配額，尚未執行股票研究。

### 16:42 更新：真實研究已通過

額度恢復且 B 補上 controller 的 80／280 字輸出提示後，兩檔約 36.6 秒完成：2059 可發布、2305 證據不足拒絕、18 檔略過。前述 402／429 已不是本次最新執行的阻塞。前端成功顯示研究與原文連結。B 修正在 `fix/live-controller-output-limits`，commit `01eef3f`；未調整查證或發布門檻。

本次另發現 A 附的 MOPS 營收來源是 `/nas/t21/` 目錄，開啟回傳 404；需要可定位股票與期別的實際來源 URL。批次拒絕結果仍缺 runId；前端只能提供同 candidateId、快照完成前的最近失敗作為相關診斷，不能保證就是該批 run。完整驗收見 [Live 指南](LIVE_DEMO_SETUP.md)。
