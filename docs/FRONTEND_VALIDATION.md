# 前端 MVP 驗收紀錄

日期：2026-10-13（Asia/Taipei）。前端在 `feat/frontend`，後端 mock 為 `f4755065f4eb1c66cadcb154eefdf5800ffac67b`。實作已覆蓋現有 API 支援的研究、偏好、回饋、追蹤、通知及系統頁。

**本紀錄區分真實 API 整合、mock 研究與 UI 測試替身；未宣稱完成真實模型或真人實測。**

## PR 提交前複驗（2026-10-14）

- `npm test`：2 個測試檔、11 個測試通過。
- `npm run test:integration`：1 條完整 mock API 流程通過，使用獨立測試使用者。
- `npm run build`：TypeScript 與 production build 通過。

本次複驗未重跑下列瀏覽器檢查；其畫面、鍵盤與可及性結果保留原檢查日期與範圍。

## Apple design 精修（本日最新）

依使用者指定 skill 調整系統字體、rem 字級、分段選擇器、圓角層級、浮動材質與按壓回饋。320–1440 px 響應式、200% 文字放大、減少透明度／動態／高對比、鍵盤面板開關均檢查；11 個狀態 axe 掃描為 0 violations，最終 build 通過。細節見 [視覺調整紀錄](FRONTEND_VISUAL_REFRESH.md#apple-design-視覺精修同日後續)。

## 色彩與閱讀層級調整（本日最新）

依使用者核可的競品參考方向，操作改深藍、收藏改中性色、證據支持維持綠色，追蹤削弱／失效依狀態採琥珀／紅色。核心論點前移，選股頁上方間距縮短。最終 build 通過，14 個畫面狀態的 axe 掃描回報 0 violations，320–1440 px 候選／研究頁及手機追蹤沒有水平溢出。追蹤狀態使用不寫入後端的瀏覽器測試替身；具體設計、來源與驗證範圍見 [色彩重整紀錄](FRONTEND_VISUAL_REFRESH.md)。

## 投資人流程複查（本日最新）

已再次走完「找股票 → 比較 → 查證 → 收藏追蹤」，修正搜尋範圍死路、比較到研究的銜接、來源面板關閉順序、示範來源誤導、收藏確認與追蹤筆記。完整流程 16 個斷言通過，收藏單次 POST、重新載入後筆記仍可讀取；單元測試現為 11 個，API 整合測試 1 條與最終 build 通過。具體情境、實際資料寫入及驗證限制見 [投資人流程檢查](INVESTOR_FLOW_REVIEW.md)。

## 使用者回饋後的操作重整驗收

2026-10-13（Asia/Taipei）。以下為重整後重新執行的檢查；後面的原 MVP 紀錄保留作歷史證據，不代表每個舊測試腳本可直接沿用新畫面。

| 檢查 | 實際結果 |
| --- | --- |
| 搜尋／產業／排序 | 搜尋 2059 僅剩 1 檔；半導體產業 2 檔；負債比低到高先顯示創新服務 10.5%；查無結果可清除條件。 |
| 同輪比較 | 可選三檔，第四檔停用；並排數據可開啟量化原始來源。原巢狀面板在後續複查發現 Escape 關閉順序問題，現已改為單一 Dialog 切換來源與比較，詳見本日最新紀錄。 |
| 尚無發布研究 | 可切到 8 筆篩選候選；藥華藥顯示數據詳情與來源，未偽造研究結論或收藏入口。 |
| 個股閱讀 | 總覽的四項量化數據、證據來源面板、風險與失效條件可操作；返回保留搜尋與焦點。 |
| 收藏／追蹤 | 全友 + 財務穩健實際送出成功，追蹤清單顯示該股；搜尋後進入版本詳情，再返回仍保留搜尋值。 |
| 完成研究 | 再次研究成功後停在全批比較表，不自動跳進第一檔。 |
| 響應式 | 320、390、768、1024、1440 px 均檢查；最終頁面 scrollWidth = clientWidth，沒有頁面水平溢出。比較面板內允許橫向捲動。 |
| 鍵盤 | 以研究列進入／返回，焦點恢復至原股票按鈕；證據面板可 Escape 關閉。 |
| 可及性 | axe-core 的桌面列表、手機列表、手機比較、手機詳情、桌面總覽／證據／風險與追蹤清單共 8 個狀態，WCAG 2 A/AA + 2.1 A/AA 回報 0 violations。 |
| 建置與 API | `npm run build`、既有 10 個單元測試與獨立使用者的完整 API 整合測試通過。 |

設計自我檢查後修正：平板下隱藏表頭的絕對定位造成 5px 頁面溢出；返回時等待 React 導覽完成再恢復焦點；手機詳情避開固定導覽，縮短分頁文字讓四個入口同時可見。CSS Modules 改用穩定的檔案識別名稱，並實際觸發 HMR 驗證導覽仍為 sticky、主版面仍為 grid、class 名稱不變且無溢出。Mock 研究文字保留原始內容，未測真實模型或完整市場搜尋。

本機證據位於 `output/playwright/reshape-*.png`（Git 忽略），包含桌面、320–1440 尺寸、比較、個股與追蹤；操作腳本 `reshape-flow.js`、`reshape-responsive.js`、`reshape-watch*.js`。開發時改動 hook 結構曾造成 HMR 的 hook 次序錯誤，重新載入後測試通過；不是以錯誤邊界畫面作驗收。

## 原 MVP 自動測試


| 檢查 | 結果與範圍 |
| --- | --- |
| TypeScript / production build | 通過。路由按需載入，React 與驗證套件分包；無大型單一 chunk 警告。 |
| `npm test` | 10 個測試：A 官方 schema、8 筆 fixture 與市場、硬性限制、百分比／億元、空百分位、安全來源網址、未知狀態、跨時區新資料判定、錯誤與 300 秒逾時。 |
| `npm run test:integration` | 1 條完整 API 流程通過，使用獨立隨機測試使用者。包含多個端點與下列 Demo 斷言。 |
| 前端 production dependencies audit | `npm audit --omit=dev` 回報 0 vulnerabilities（本次檢查時間）。 |
| Production 頁面 | 5174 preview 的 build assets 與路由載入，無 JavaScript runtime error；`/design-qa` 不存在。5174 非後端 CORS 允許來源，因此此項只驗證 build，不冒充部署整合。完整 API 操作在允許的 5173 實測。 |
| 可及性 | Playwright 載入 axe-core 4.13.0；研究結果、證據 Dialog、偏好、追蹤、通知、系統六個狀態掃描 WCAG 2 A/AA + 2.1 A/AA，0 violations。不等於完整人工可及性認證。 |

獨立 axe CLI 遇到本機 ChromeDriver 版本不符，改由已可用的 Playwright 瀏覽器注入同一 axe-core 引擎完成檢查；沒有為此更換使用者的 Chrome。

## Mock API 實際回應

| 情境 | 驗證結果 |
| --- | --- |
| 正常研究 | A fixture 8 筆實際候選送入 API，`researched=8`，實際 Top-K 5 檔。保留上游 2394／428 統計的意義，不當成本次已研究數量。 |
| 不足五檔／零結果 | 以同契約的 2 筆與 0 筆候選驗證，回傳 2 與 0，不補假資料。 |
| 收藏與權重 | SAVE + FINANCIAL_STABILITY 產生 feedback、preferenceChange、profile 與 watchlist；收藏使用原研究 runId，未重跑研究。硬性限制保持相同。 |
| 回饋後改變順位 | 同候選輸入：前次 `2059,2305,2408,7828,3653`；一次財務穩健收藏回饋後，實際回傳 `2059,2305,7828,2408,6426`。不是前端重算，並保留 before/after 權重。 |
| 論點追蹤 | 同一收藏透過既有 mock recheck marker 產生 WEAKENED、INVALIDATED、CONFLICTING claim；版本數增至 4，REJECTED 研究仍反映論點變化。 |
| 通知 | 收到 THESIS_CHANGED 與 EVIDENCE_CONFLICT；read API 更新 readAt。 |
| 每日研究 | 固定舊行情在正常執行回傳 WAITING_FOR_FRESH_DATA；開發強制執行成功，接著正常執行 reused=true，無完整 result。三種 response 分支均通過。 |
| 重設／移除 | reset-soft 保留硬性限制；移除 watchlist 後仍保留 feedback。 |
| CORS | 實測 `http://localhost:5173` 允許來源。 |

Mock 的論述與來源都是模擬內容。來源查核品質、收益、真實模型推理與備援不是這些測試能證明的項目。

## 瀏覽器操作與畫面

使用 Playwright CLI 實際操作 Chromium：

- 研究完成、選取個股、A 量化證據與公式、B 來源、收藏原因、後端成功確認及實際權重差異。
- 三步偏好表單 PUT；設定負債比上限後擋住舊 input；每日重新篩選回傳後恢復研究入口；再還原設定。
- 追蹤列表、收藏時與新版本對照，逐次執行削弱／失效／衝突，確認後端回傳版本與通知。
- 通知顯示不改 readAt；按通知 ID 保存去重，重新整理及同步不重複呼叫 native Notification constructor；手動已讀由 4 則變 3 則。
- 在測試瀏覽器授予權限後成功建立原生 Notification；另由瀏覽器權限控制設定 denied，確認畫面說明與停用入口，站內通知仍可用。沒有驗證 Windows 專注模式或通知中心的實際外觀。
- 320px、390px、1440px 寬度，長中文、缺論點、缺日期、缺來源、多論述、未知狀態、負值與大型金額無頁面水平溢位。
- 小螢幕保留個股選取；證據面板 Escape 後焦點返回；Tab 留在 Dialog；鍵盤開啟無移動動畫；reduced-motion 轉場縮短。
- 720 CSS px 視窗驗證 1440px 在 200% 縮放時的等效重排。未將自動化快捷鍵當作已確認所有瀏覽器原生縮放；實體裝置／瀏覽器選單的 200% 縮放仍應人工複查。
- 等待 180 秒／300 秒使用瀏覽器虛擬時鐘，顯示經過時間、保留舊結果、逾時說明與單次 POST 均通過，沒有真的等待五分鐘或模擬成功進度。
- 以網路替身驗證 offline、停用 capability、舊研究 404；此項驗證 UI 行為，並非真的重啟正式後端。
- 最後研究頁 console 檢查：0 errors、0 warnings（排除測試期間刻意產生的 HTTP 失敗）。

截圖與暫存驗證腳本存於 `output/playwright/`，已排除 Git。主要圖檔：`desktop-final.png`、`mobile-research.png`、`mobile-evidence.png`、`thesis-versions.png`、`notifications.png`、`worst-320.png`、`worst-390.png`、`worst-1440.png`、`reflow-720.png`、`long-wait.png`、`offline.png`。

## 設計檢查與修正

| Before | After | Why |
| --- | --- | --- |
| 本機快取反序列化後，物件 identity 不同而被當成新輸入。 | 依完整資料內容比較，不再顯示錯誤的新輸入提示。 | 重新整理不應暗示資料已改變。 |
| 320px 的開發測試切換列因 fixed 定位自動縮窄，文字逐字換行。 | 內容寬度、無換行與明確最大寬度。 | 保留極端資料切換控制的可讀性，不影響產品頁。 |
| 窄螢幕返回列表移除 ticker，選取回到第一檔。 | 分開保存 ticker 與列表／詳情狀態，恢復列表捲動位置。 | 閱讀上下文不因返回而丟失。 |
| 模態面板退出尚未完成時立刻截圖／檢查焦點。 | 截圖停在轉場完成狀態，焦點檢查等面板關閉。 | 避免將動畫中間影格誤判為透明度或焦點缺陷。 |
| 同一包解析器假設每日研究含完整 screening envelope。 | 分開 core batch 和 screening response，從同次 output 補上追溯 metadata。 | 符合實際 DTO，而不是靜默丟棄欄位。 |
| 重新研究完成會將其他頁面強制切回首頁。 | 使用者留在其他頁面時顯示可開啟結果的提示。 | 避免打斷正在編輯的偏好。 |

動效使用 CSS transform／opacity、220ms 證據面板、短按壓回饋；列表／排名切換不做裝飾動畫。保留減少動態、降低透明度、高對比及 hover 能力判定。

壓力資料的公開 DTO 字串、claims／sources 集合未宣告長度上限；已用合理長公司名、12 項論述、缺文件、缺日期、單字名稱與零結果驗證。Top-K 後端上限 20。未宣稱驗證無限集合或千筆通知的效能；若正式流量需要，應補分頁／虛擬化契約。

## 尚待外部條件或人工驗收

1. Gemini／OpenAI 真實研究與來源 Retry／Fallback／Stop；UI 壓力頁的紀錄只是假資料，不是 Agent 實際證據。
2. 真實 A 資料庫與排程啟動、重啟補跑、交易日和部分追蹤重查失敗的正式案例。現有 UI 已呈現相關狀態與失敗數，尚未完成真實排程驗收。
3. 3–5 位目標散戶訪談、限時任務、研究時間／引用正確性／風險辨識的人工評估；未招募或填入假指標。
4. 實體行動裝置、Safari／Firefox、螢幕閱讀器、瀏覽器原生 200% 縮放，以及作業系統通知中心外觀。
5. 後端完整歷史結果取回、版本來源的明確關聯、最新單股資料與長任務／回饋冪等能力，詳見 [後端交接](FRONTEND_BACKEND_GAPS.md)。

此次完成的是依既有 API 可執行的前端 MVP；正式研究與競賽全案簽核需完成以上真實整合與人工驗證。
