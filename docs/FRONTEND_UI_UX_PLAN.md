# 股研雷達｜前端 UI／UX 整合方案

> 更新日期：2026-10-13（Asia/Taipei）
>
> 狀態：使用者已授權開始實作；前端 MVP 與 mock 主要流程已落地。正式模型、真實排程與使用者實測另行驗收。
>
> 本文件保留先前對話的設計依據；實作與測試證據見 [驗收紀錄](FRONTEND_VALIDATION.md)，啟動方式見 [前端說明](FRONTEND_SETUP.md)。未勾選的原始驗收項目須對照驗收紀錄確認部分完成與未測範圍。

> 2026-10-13 操作重整：使用者認為舊版不易使用，已依 `frontend-design` 改為「候選比較 → 個股查證 → 論點追蹤」。畫面規格以下方更新為準，設計取捨見 [重整說明](FRONTEND_RESHAPE.md)。

> 同日投資人完整流程複查：搜尋無結果時提供保留搜尋的範圍／產業恢復入口；比較表直接閱讀研究；來源在同一 Dialog 內切換並可返回；示範來源不冒充正式文件；收藏確認跨分頁可見，直接進入追蹤理由與筆記。單版追蹤不顯示版本比較，排程未啟用時明確告知。此更新為後續實作依據，細節及已測範圍見 [投資人流程檢查](INVESTOR_FLOW_REVIEW.md)。

## 一、目標、現況與工作邊界

產品定位依循 NAPAI v2.0：協助自主投資散戶找到值得研究的股票、查證依據，並持續追蹤當初關注它的理由是否改變。

主要使用者是有自行選股習慣、會閱讀台股基本面與市場資訊，但研究時間有限的自主投資散戶；產品不以完全新手、高頻交易者或專業法人為主要對象。對外價值是節省研究時間、讓來源可追溯與主動揭露風險，不宣稱提高報酬。

完整流程：

**設定偏好 → 搜尋與比較候選 → 閱讀研究 → 查證證據與風險 → 收藏／略過 → 調整研究偏好 → 追蹤論點 → 接收重要通知。**

### 已完成的環境準備

- Repo 下載至 `C:\Code\trading_radar`。
- 從 `main` 建立 `feat/frontend` 分支；前端實作位於 `apps/web`。
- 安裝 `apple-design`、`animate`、`pick-ui-library`、`ask-sonner`、`review-animations`、`animation-performance`、`break-ui`。
- 保留既有 `emil-design-eng`、`frontend-design`。
- 既有 `improve-animations` 亦保留；它供日後已有動效程式碼時進行唯讀稽核，目前不執行動效稽核。
- Skills 安裝於本機 Codex skills 目錄，並非專案依賴；其他開發環境需另行安裝。

### 範圍與分工

本方案涵蓋完整 MVP 前端，先接現有 API；需要後端補充的能力另列交接規格。後端實作仍由 B 負責，前端不重算篩選指標、不判斷證據真偽或論點狀態。

| 角色 | 任務與邊界 |
| --- | --- |
| A：Data / Quant | 將台股市場縮成候選股，交付可重算的指標、資料期間與量化證據。 |
| B：Agent / Evidence | 動態研究、來源與證據驗證、風險檢查、發布判定、論點追蹤及後端事件。 |
| C：Product / Integration（使用者） | 串起完整流程，負責前端、使用者體驗與瀏覽器通知，讓評審看得懂、操作得了。 |

前端工作留在從 `main` 建立的分支，不將 UI 程式碼寫進 `feat/b-agent-mvp`。已另外建立 backend worktree 並啟動 `npm run api:mock`，前端與後端原始碼維持分離。

Backend worktree 位於 `C:\Code\trading_radar_backend`，來源是 `origin/feat/b-agent-mvp`。已安裝依賴、啟動 mock 並核對 `/health` 與公開 DTO。Mock 不需要 Gemini／OpenAI API key、Data SQLite snapshot 或 Python CLI；前端開發不必等模型接入完成。

第一版不新增登入、交易、股價預測、行情走勢圖、原生手機 App 或前端模型呼叫；採淺色、桌面優先的響應式網頁。

亦不增加券商串接、投資組合最佳化、複雜資產配置、大量技術指標與回測，或為了展示而新增 Multi-Agent。這些是原計畫明確排除的範圍。資料庫設計、官方資料擷取與模型／訂閱授權屬 A／B 的工作，不轉成前端待辦。

市場目標包含上市與上櫃一般業；金融等不可直接比較的產業不混排，缺必要資料者不靠模型猜補。原計畫的全市場個股查詢能力仍屬產品目標，但目前交接 API 未提供完整個股查詢入口，本版不虛構查詢功能，列入 A／B 的後續整合需求。

### 依據與版本

- 產品需求：使用者提供的《NAPAI 分工》、《NAPAI v2.0 計劃書》，並以 v1.0 作為補充背景。
- 本機原始文件位於 `C:\Users\apple\Documents\Obsidian\Kevin\3 - Main Notes`：`NAPAI 分工.md`（內含 `NAPAI 分工.png`）、`NAPAI v2.0 計劃書.md`、`NAPAI v1.0 計劃書.md`；未將個人筆記複製進公開 repo。
- 設計 skills：[emilkowalski/skills](https://github.com/emilkowalski/skills)。
- [前端交接文件](https://github.com/Gule7309/trading_radar/blob/feat/b-agent-mvp/docs/C_FRONTEND_HANDOFF.md)。
- [後端公開型別入口](https://github.com/Gule7309/trading_radar/blob/feat/b-agent-mvp/src/api/contracts.ts)。
- 深入整合以後端分支的 `docs/INTEGRATION.md`、`docs/B_AGENT_MVP.md` 與實際 API 程式為準。
- [資料證據契約](data/candidate-evidence-contract.md)。
- [Screening output sample](../packages/taiwan_data/tests/fixtures/sample_screening_output.json)。

本次檢視的 `main` 為 `ab959cc18bc86c0534aeb5ffd528070d40917360`，後端分支為 `f4755065f4eb1c66cadcb154eefdf5800ffac67b`。後端交接文件尚不在目前前端分支內，因此以上提供遠端連結。開始實作前應重新確認最新契約；若有差異，同步修訂本文件，不在前端猜補業務邏輯。

## 二、依 Skills 修訂的設計方向

### 1. 以閱讀、查證與追蹤建立辨識度

採用已選定的「淺色研究工作台」。畫面特色來自清楚的**論點—證據—風險—失效條件**關係，以及論點版本的前後變化。

首頁直接進入研究工作，不增加宣傳首頁、大型裝飾圖或沒有資料支持的行情圖表。

| Skill 原則 | 融入本方案的決策 |
| --- | --- |
| Apple：目的與簡潔 | 主要導覽收斂成「選股研究、追蹤清單」；通知、偏好與系統工具放在次要位置。 |
| Apple：空間一致性 | 查證時保留原論述與選取位置，證據面板從固定方向開啟、原路關閉。 |
| Apple：使用者掌控 | 明確顯示修改會影響什麼；不強制開啟通知，不提供後端無法實現的撤銷。 |
| Emil：高頻操作應快速 | 切換股票、列表導航、鍵盤操作立即回應；閱讀中的數字與排序不因裝飾動畫移動。 |
| Apple：材質表達層級 | 閱讀面板使用實色；浮動工具列與檢視面板才使用適量半透明材質。 |
| Animate／Performance：最小必要動效 | 普通狀態切換使用 CSS；只有真正需要手勢與動量時才引入 spring。 |
| Sonner：回饋要一致 | 短暫提示只確認操作；重要風險、偏好變化與錯誤仍留在相關畫面。 |
| Break UI：以真實極端資料驗證 | 設計必須容納長中文、缺日期、零結果、多來源與完整拒絕理由。 |

### 2. 視覺規格

- **背景：**冷灰 `#F5F7FA`；研究正文為白色。
- **文字：**主要文字 `#182230`、次要文字 `#526173`。
- **操作色：**深藍 `#2457C5`，搭配淡藍選取背景；雷達標誌保留深綠 `#136B60`。證據支持／成功使用 `#176B52`，注意事項使用琥珀 `#8A5700`，失效／錯誤使用紅色 `#B42318`。已收藏／追蹤中使用中性色與書籤圖示，可發布研究使用藍色，避免暗示收藏等同驗證通過。
- **狀態：**顏色搭配文字與圖示，不依靠紅綠辨識，也不把「已驗證」暗示成投資安全。
- **字體：**優先使用平台系統字體（Apple system／Segoe UI），中文 fallback 為 PingFang TC／Microsoft JhengHei；正文 1rem、一般輔助資訊 0.8125–0.875rem、桌面主標題 1.875rem。字級隨使用者設定縮放，保留等寬數字與 optical sizing。
- **排版：**正文左對齊，行長約 35–45 個中文字；數字採等寬數字排列。
- **元件：**輸入／按鈕 0.625rem、主要內容面 1rem、浮動面板 1.25rem 圓角；候選範圍以分段選擇器表達。側欄使用中性底，選取項目使用白色表面。手機導覽與比較列提供可降級為實色的霧面材質，正文保持實色白底，詳見 [視覺調整紀錄](FRONTEND_VISUAL_REFRESH.md)。

### 3. 動效與可及性

- 按下時立即給視覺回饋，實際提交仍在正常點擊完成時觸發。
- 按鈕按下回饋約 80ms、放開約 120ms、置中面板約 180ms、證據面板約 220ms。
- 只動畫化必要的透明度與位移；不動畫化正文重排、分數跳動或玻璃模糊半徑。
- 動畫期間保持可操作，不等待開場動畫結束才接受輸入。
- 鍵盤操作不附加移動動畫；支援減少動態效果、降低透明度與提高對比。
- 具備可見焦點、面板關閉後焦點返回，以及小螢幕至少 44px 的主要操作區域。
- 進出轉場採 skill 的 `cubic-bezier(0.23, 1, 0.32, 1)`；按鈕按下使用 `scale(0.98)`，置中面板從 `scale(0.985)` 輕微展開。減少動態時取消縮放與位移，不使用 `transition: all`。
- Popover 的原點跟隨觸發位置；置中的 modal 保持置中。Hover 效果只在支援 hover 的精確指標裝置啟用。
- 不預設安排拖曳或彈跳；未來確有手勢需求時使用可延續速度的 spring，保持可中斷。Skill 的玻璃材質建議與效能要求有取捨時，以正文可讀性及穩定效能為優先。

## 三、資訊架構與畫面設計

### 整體結構

桌面採用「導覽＋全寬股票比較表」。個股研究獨立閱讀；證據按需開啟面板。

```text
導覽             選股研究
選股研究         資料日期、開始／重新研究
追蹤清單         已發布研究 / 篩選候選
通知             搜尋、產業、數值排序
                 股票、營收年增、營益率、負債比、日均成交額、特殊旗標
研究偏好         勾選 2–3 檔 → 並排比較 → 查看各數值來源
執行紀錄
系統狀態         個股：重點總覽 / 證據查核 / 風險與失效 / 研究紀錄
```

桌面導覽約 192px，取消 320px 的固定候選欄。小於 768px 的股票比較改為直向數值列表；並排比較表只在面板內橫向捲動。返回列表保留搜尋、篩選、排序、勾選、捲動與鍵盤焦點。所有尺寸的個股研究都採獨立工作區。

### 前測與偏好設定

三步完成：

1. **研究習慣：**投資期間、波動接受度、成長／均衡／穩健風格。
2. **篩選限制：**排除產業、負債比上限、最低流動性、是否排除處置股。
3. **確認設定：**分別顯示硬性限制及可學習的軟性偏好。

軟性偏好為成長、獲利、財務安全三項；流動性是篩選門檻。風格選擇與進階權重分層呈現，不要求首次使用者理解所有計分細節。

偏好頁整合變更歷史與重設入口；變更後顯示實際生效範圍。

初始設定讀取後端 profile，不在不同頁面各自建立預設。已檢視契約的預設為投資期間 `MEDIUM`、風險接受度 `MEDIUM`、研究風格 `BALANCED`、不排除產業、負債比不限、20 日平均成交金額至少 1 億元、排除處置股、三項軟性權重等權。硬性限制只允許使用者主動修改；回饋不能放寬。重設操作明確標為「重設研究權重」，不暗示會重設硬性限制。

### 選股研究與個股詳情

- 頁首先顯示行情日期、營收月份、財報季度與研究完成時間。
- 股票表對照名稱、代碼、市場、產業、四項量化指標與特殊旗標。搜尋僅限目前候選，產業篩選與數值排序不改動後端偏好、硬篩選或研究排名。
- 首次開啟即可讀取 A 的候選數據；已發布研究和篩選候選分開。比較最多三檔同一份資料，並可直接查每個數值來源。
- 顯示實際入選數量；不足五檔時保留不足原因，不補滿虛構結果。
- 詳情分為「重點總覽、證據查核、風險與失效、研究紀錄」。總覽依序呈現原研究論點、量化數據、風險摘要與直接入口、研究理由。2026-10-13 經使用者同意，以論點優先的閱讀順序取代先前量化數據優先版本。
- 分數與方法收在研究紀錄；風險完整內容與失效條件在專屬分頁，總覽保留風險摘要，不能只顯示正面論點。
- 未入選項目與理由另設可展開區，區分證據不足、衝突、限制不符及研究額度限制。
- 執行過程使用可展開的結構化紀錄，不呈現隱藏推理內容。

### 證據檢視

點擊論述旁的證據入口，保留該論述的選取狀態。

- 寬螢幕使用右側檢視面板；空間不足時轉成完整證據頁。
- 顯示來源名稱、發布者、來源類型（sourceType）、來源層級（sourceTier）、資料期間、日期、查證狀態及原始連結；層級使用後端值，不由前端重新評定。
- 量化證據可展開公式、原始輸入、驗證方法與更新時間。
- 清楚區分「獨立交叉比對」與「輸入完整、推導一致」。
- 找不到來源或缺少原文摘錄時據實標示，不補造內容。
- 多來源衝突並列呈現，不由前端挑選較有利的來源。
- 官方 API 連結標示為資料端點，避免使用者預期會打開可閱讀的文章。A 有提供 `referenceUrl` 時另列可閱讀的參考頁；null 時不編造替代連結。

### 收藏、略過與偏好回饋

- 原因選擇使用一個短對話框，依收藏／略過顯示不同選項。
- 選擇 1–4 個原因，可填最多 500 字備註。
- 送出後等待後端確認，再顯示收藏或略過成功。
- 成功回饋包含實際權重變化，並提供查看偏好紀錄的入口。
- 收藏原因對應 `GROWTH`（成長性）、`FINANCIAL_STABILITY`（財務穩健）、`INDUSTRY_TREND`（產業趨勢）、`ACCEPTABLE_RISK`（風險可接受）、`OTHER`（其他）。
- 略過原因對應 `HIGH_VOLATILITY`（波動太高）、`FINANCIAL_QUALITY`（財務體質）、`UNFAMILIAR_INDUSTRY`（產業不熟）、`INSUFFICIENT_GROWTH`（成長性不足）、`VALUATION_CONCERN`（估值疑慮）、`OTHER`（其他）；不跨 action 混用。
- 不立即移動使用者正在閱讀的列表；下一次研究完成後才呈現新排序。
- 不承諾每次回饋一定改變名次；若未變動，據實顯示。
- 提供「依新偏好重新研究」入口，保留前後執行與權重供比較。偏好紀錄以後端 `before`、`after`、`delta`、`reason` 為準；前端不重算排名或自行調整權重。

### 追蹤清單與論點歷史

此頁的核心是回答：**「我當初為什麼關注它，現在有什麼不同？」**

- 清單呈現公司、目前論點狀態、最近檢查時間，並提供搜尋及「需重新評估」篩選；論點削弱與失效優先顯示。
- 詳情呈現收藏時論點、最新論點、變化理由及失效條件。
- 版本時間軸可選擇版本查看；桌面並列比較，窄螢幕上下排列。
- 狀態翻譯為「追蹤中、論點強化、未有顯著變化、論點削弱、論點失效」。
- 狀態只使用後端結果，前端不自行推論。
- 狀態依序對應 `ACTIVE`、`STRENGTHENED`、`UNCHANGED`、`WEAKENED`、`INVALIDATED`。重新研究若因已驗證負面證據而拒絕發布，舊論點仍可能被削弱或失效，不能把 `REJECTED` 一律當成未改變。
- 移除追蹤明示只停止追蹤，不撤銷歷史回饋與權重變化。

### 通知、執行紀錄與管理

- 通知中心區分研究完成、論點改變、證據衝突，提供相關研究／論點入口。
- 使用者主動開啟桌面通知時才要求權限；拒絕授權仍能使用站內通知。
- 執行紀錄呈現實際工具步驟、時間、結果與停止原因。
- 後端有回傳時，呈現 Retry、Fallback、verification result、diagnostics、研究總耗時、模型呼叫次數與估計成本；缺欄位標示未提供，不顯示推算的成功率或零成本。
- 管理頁顯示模型、憑證是否配置、連線測試、資料更新與排程狀態。
- 現有 API 沒有模型設定寫入能力，因此本版不提供無法生效的模型切換與金鑰輸入表單。

## 四、資料契約與狀態規格

### 串接原則

- 以 `docs/C_FRONTEND_HANDOFF.md`、實際 DTO 與資料證據契約為準。
- 固定 `demo-user`，API base 集中設定為 `http://127.0.0.1:8787`。
- 前端開發位址使用 `http://localhost:5173`，配合後端預設 CORS；透過 `VITE_API_BASE` 設定後端位址。
- 首先接通 `POST /api/research/screening-output`，帶 userId、完整 screening output，以及 `topK=5`、`researchLimit=10`、`concurrency=2`。
- A 的證據 ID 以 screening run 為範圍；B 的來源依各研究結果的 sourceIds 對應，不能混用。
- 保存輸入的資料期間與候選資料，供結果頁呈現量化指標及 riskFlags。
- 不把 score、quantScore、evidenceQuality 翻譯成上漲機率或 AI 信心。
- 收藏／略過送回使用者所看結果的 `result.runId`；SAVE 使用後端建立的 watchlist 與 thesis，不為收藏重跑研究。
- 建立集中式 API client、前端 DTO 與顯示轉換層，不從另一個 worktree 直接匯入原始碼。切換 mock／real 應沿用相同契約解析。
- 啟動先檢查 `/health` 的 capability；功能未啟用或收到 501 時顯示可理解的停用狀態，不把不存在的功能包成可點擊的假操作。

### 畫面與 API 對照

下表使用 `{userId}`、`{ticker}`、`{runId}`、`{thesisId}`、`{notificationId}` 表示實際資源識別碼，並非固定字串。

| 用途 | 既有 API |
| --- | --- |
| 健康與能力檢查 | `GET /health` |
| 讀取／更新前測與偏好 | `GET /api/users/{userId}/profile`、`PUT /api/users/{userId}/profile` |
| 重設軟性權重／取得 A 所需 profile | `POST /api/users/{userId}/profile/reset-soft`、`GET /api/users/{userId}/screening-profile` |
| 既有 A output 產生研究 | `POST /api/research/screening-output` |
| 收藏／略過與回饋歷史 | `POST /api/users/{userId}/feedback`、`GET /api/users/{userId}/feedback` |
| 偏好變更歷史 | `GET /api/users/{userId}/preference-history` |
| 追蹤清單／移除追蹤 | `GET /api/users/{userId}/watchlist`、`DELETE /api/users/{userId}/watchlist/{ticker}` |
| 以新 CandidatePacket 重查單股 | `POST /api/users/{userId}/watchlist/{ticker}/recheck` |
| 論點最新版本、版本歷史與事件 | `GET /api/theses/{thesisId}`、`GET /api/theses/{thesisId}/versions`、`GET /api/theses/{thesisId}/events` |
| 已有研究的詳情／個股研究歷史 | `GET /api/research/runs/{runId}`、`GET /api/research/tickers/{ticker}/runs` |
| 全部／未讀通知 | `GET /api/users/{userId}/notifications`，未讀使用 `?unread=1` |
| 標記通知已讀 | `POST /api/users/{userId}/notifications/{notificationId}/read` |
| 每日研究／送達紀錄 | `POST /api/users/{userId}/daily-research`、`GET /api/users/{userId}/delivery-runs` |
| 系統狀態、模型測試與資料狀態 | `GET /api/admin/status`、`POST /api/admin/model-check`、`GET /api/admin/data-status` |

### 回傳資料如何呈現

- 批次結果主要 render `top[].result`，同時保留 `rank`、`candidateId`、`ticker`、`score`、`quantScore`、`evidenceQuality`；以 ticker 對應輸入 A output 的 `stockId`，不能依回傳陣列位置對應。
- `screeningRunId`、`dataVersion`、`sourceSnapshot` 供結果追溯；`researched` 與 `rejectedOrSkipped` 說明實際研究數量及未發布原因。`sourceSnapshot=null` 表示未知，不當成資料失效。
- `ResearchResult` 的論點、理由、claims、risks、失效條件、verificationSummary、sources、researchTrace 各有對應區域；原始 enum 保留於資料層，顯示層統一翻譯。
- 查證摘要中的核心論述覆蓋率、主要來源比例、未解決衝突數與資料新鮮度，各自標示實際意義，不合併成投資信心。
- `claims[].sourceIds` 只在同一結果的 `sources` 內解析。Risks 的 sourceIds 亦同；`addressesRiskFlags` 用於說明風險如何對應上游注意／處置旗標，不代表風險已消失。
- A 的 Evidence ID 在同一 run 內比對不分大小寫；B 的 sourceId 按契約原值解析，不套用 A 的編號規則。
- 單次研究 GET 回傳 `StoredResearchRun`，內含 `candidate` 與 `result`，並非裸 `ResearchResult`。列表端點也有各自包裝，例如 `items`、`notifications`、`versions`、`events`、`runs`；以 DTO 解析，不共用錯誤的裸陣列假設。
- 回饋結果包含 `feedback`、`preferenceChange`、`profile`，SAVE 另有 `watchlistItem`；成功後同步這些相關畫面，不再另建一次 thesis。
- 原始 `ResearchResult.sources` 並未提供完整摘錄與擷取時間，不能因 B 內部 `SourceDocument` 有該欄位就假設公開 API 也會提供。

### 數值、證據與日期語意

- `revenueYoY`、`operatingMargin`、`debtRatio` 的值已是百分比：例如 `344.4` 就是 344.4%，不能再乘 100。列表顯示小數一位，展開可保留原始精度。
- `operatingMargin` 標示「單季營業利益率」。`avgTurnover20d` 為近 20 個交易日平均成交金額，原始單位是新台幣元，可格式化為億元；格式化不是重新計算指標。
- A 的 percentile 為 0–1，需要時轉為 0–100 的顯示尺度；B 的 CandidatePacket 可能已使用不同尺度，必須按各 DTO 處理。
- `debtRatio.percentile` 標示為「財務安全度」，越高代表負債比越低；流動性的 percentile 為 null，不繪製虛構的流動性排名。
- `percentileScope` 顯示「同產業比較」或「全市場比較」，不把產業樣本不足時的全市場替代結果冒充同產業比較。
- `notice` 是近 30 日有注意股公告，`disposition` 是處置中；兩者都揭露，不自行替後端加減分。
- `availabilityCutoff` 只能標示「可用日期（估計）」，不能寫成公司實際公告日。
- `fetchedAtScope=dataset` 時顯示「資料集更新時間」；`row` 才表示該筆資料的擷取時間。營收月份、財報季度不轉成憑空推定的公告日期。
- 沒有量化候選時使用 A 的 `excluded.byReason` 說明篩選原因；研究後未發布則使用 B 的 `rejectedOrSkipped`，兩者不混算。
- Fixture 只有 8 筆候選樣本，其 run 的 universe=2394、ranked=428 是原始篩選統計，不能聲稱這次前端已研究全市場或已取得 428 筆明細。

### 狀態與錯誤對照

| 欄位／狀態 | 使用者可見意義 |
| --- | --- |
| `PUBLISHABLE`／`PARTIAL`／`REJECTED` | 可發布研究／部分研究結果／暫不形成研究結論；非可發布結果不可當成已發布候選。 |
| Claim `PENDING`／`SUPPORTED` | 待驗證／已驗證支持。 |
| Claim `REFUTED`／`INSUFFICIENT`／`CONFLICTING` | 證據反駁／證據不足／來源衝突。 |
| Freshness `CURRENT`／`STALE`／`UNKNOWN` 或缺值 | 後端判定的新鮮度；始終另列實際資料期間，未知不當成最新。 |
| `INSUFFICIENT_EVIDENCE`／`UNRESOLVED_CONFLICT` | 證據不足／尚有未解決的來源衝突。 |
| `SOURCE_FAILURE`／`MODEL_FAILURE`／`BUDGET_EXHAUSTED` | 來源取得失敗／模型執行失敗／研究資源額度已用盡。 |
| `NO_CORE_CLAIM`／`NO_RISK_IDENTIFIED` | 尚未建立核心論述／尚未完成必要風險辨識；不寫成沒有風險。 |
| `HARD_CONSTRAINT_FAILED`／`RESEARCH_LIMIT` | 未符合硬性限制／本輪未納入研究額度。 |

400 的 `INVALID_SCREENING_OUTPUT`、`SCREENING_ADAPTER_ERROR`、`INVALID_CANDIDATE_PACKET`、`INVALID_FEEDBACK`、`INVALID_USER_PROFILE` 顯示可修正的資料／欄位問題；413 提示請求資料過大；500 顯示系統錯誤與重試入口。404 區分研究、收藏、論點或通知不存在；研究可能回傳 `RUN_NOT_FOUND` 或 `RESEARCH_RUN_NOT_FOUND`，不得只支援其中一個。未知狀態保留診斷資訊並顯示未識別狀態，不猜成成功。契約問題先查交接文件與型別，不以靜默刪欄位或改造資料繞過。

### 每日研究、主動送達與補跑

- 排程與資料擷取由後端負責，時間以 Asia/Taipei 呈現。依交接文件，預設以週一至週五盤後 17:00 為執行目標，啟動後補跑最新應執行任務，同日成功任務預設不重複。
- 清楚區分 `localDate`（任務目標日）、`priceAsOf`（行情日）、`startedAt`／`completedAt`（實際執行時間）；不把補跑日冒充資料日。
- 後端未啟用、程式關閉或任務尚未執行時，不顯示為已完成研究；最近送達紀錄與排程啟用狀態分開呈現。
- `RUNNING` 顯示執行中，`WAITING_FOR_FRESH_DATA` 顯示等待新資料，`SUCCESS` 顯示完成，`FAILED` 顯示失敗。資料未更新時不自行把舊資料包成今日研究，UI 也不自行推定交易所假日。
- Daily response 有不同分支：成功的新執行可含 `screeningOutput`、`result`、`watchlistRechecks`、`notification`；`reused=true` 可能只有既有 `deliveryRun`；等待新資料也不保證有研究 result。各分支分別處理。
- 已成功任務的重用不等於能取回完整歷史 Top-K；快取不存在時仍只顯示摘要，不以重新 POST 偷偷替代讀取。
- 通知類型對應 `DAILY_RESEARCH_READY`、`THESIS_CHANGED`、`EVIDENCE_CONFLICT`。通知連結缺少本機摘要時，導向可取得的執行／論點紀錄並說明限制。
- Recheck 事件包含 `MONTHLY_REVENUE`、`MATERIAL_DISCLOSURE`、`NEWS`、`MANUAL_RECHECK`；只有明確取得新 CandidatePacket 才送出。已收藏股票即使不符合新的 discovery 限制，仍需由後端檢查，不能被前端當成不合格而停止追蹤。
- 真實 scheduler 需 B 的資料庫、Data CLI 與模型環境配置。切換至 `npm run api` 前先確認可用性；mock 沒有真實排程，也不能因 `/health` 支援 delivery 就顯示「自動排程已啟用」。

### 長任務與異常

- 研究等待上限預設 300 秒，呈現經過時間；不顯示假百分比或猜測的即時研究階段。
- 逾時提示「尚未收到結果，後端可能仍在執行」，不宣稱已取消工作。
- 分開處理拒絕發布、部分結果、零候選、等待新資料、網路錯誤與 HTTP 錯誤。
- 重新研究時保留上次成功結果及其日期，避免空白畫面。
- 有副作用的請求不自動重送；失敗或連線中斷後先同步可取得的狀態，避免重複回饋。

### 已知限制與本版處理

| 現有能力邊界 | 前端方案 |
| --- | --- |
| 上傳既有 output 只重新套用軟性權重 | 修改硬性限制後標示需重新篩選，阻止將不符合新 profile 的舊輸入當成新結果送出；改走 daily-research 或匯入重新產生的 output，不由前端私自重篩。 |
| 每日歷史只有執行摘要，缺完整結果取回 | 本機快取曾收到的完整結果；缺快取時只呈現可取得摘要，不默默重跑。 |
| 單股 recheck 需要 fresh CandidatePacket | 真實模式使用後端每日流程的重查結果；未取得新資料時不提供假更新。 |
| 論點版本缺完整來源文件 | 能解析對應研究時提供來源；無法解析則標示缺少對應文件。 |
| 尚無 SSE／WebSocket | 等待期間只呈現確定的請求狀態，完成後顯示研究紀錄。 |
| 瀏覽器通知依賴頁面執行 | 每 30 秒查詢並以通知 ID 去重；頁面關閉時不承諾推播。 |

通知「已顯示」與「已閱讀」分開處理；只有點擊或主動標記時才更新已讀。

Mock 與真實模式清楚標示，快取隔離。本機完整結果使用 IndexedDB，依 API 環境、使用者與執行 ID 區分；快取不作為後端持久化的替代品。

Mock backend 的研究、偏好、追蹤及通知使用記憶體儲存，重啟後可能消失。若本機快取仍在而後端回傳找不到研究，應標示舊紀錄並重新同步，不宣稱收藏或回饋成功。Mock 中的 `[MOCK]` 研究文字與模擬來源不可改包成真實研究；開發情境控制只出現在開發展示區，不混入一般使用流程。

Sample 的行情為 2026/10/8、營收為 2026/08、財報為 2026Q2，不因開啟日期改成今日資料。

後續給 B 的交接需求包括完整每日結果取回、伺服器端單股最新資料重查，以及歷史論點來源解析。本方案不直接修改後端。

模型接入沿用計畫書的備援精神：前端不等待特定供應商或訂閱登入，不呼叫 Gemini／OpenAI、不存放 model key、不解析 grounding metadata、不自行決定 source tier 或 publication gate。外部來源文字屬不可信資料，僅作內容顯示，不當成指令。對外截圖、錄影及文件不得露出憑證或個人識別資訊。

## 五、實作安排與驗收

依使用者後續明確指示，已開始並完成前端主要流程。以下保留工作順序，實際驗收範圍以驗收紀錄為準：

1. **設計落地：**建立視覺 tokens、主要頁面與狀態規格，再製作可操作原型。
2. **核心串接：**前測、研究列表、詳情、證據、風險及異常狀態。
3. **完整流程：**回饋、偏好差異、追蹤、論點歷史、通知與管理。
4. **整合驗收：**契約測試、瀏覽器操作、視覺檢查與真實後端驗證。

前端置於 `apps/web`，採 React、TypeScript、Vite、React Router、TanStack Query、CSS Modules；Base UI 處理可及性元件，Sonner 處理操作提示。普通轉場使用 CSS，不預先引入大型動效或圖表套件。前端套件設定獨立，降低之後合併後端分支的衝突。

已交付前端、[啟動與環境說明](FRONTEND_SETUP.md)、[API 對照與後端缺口](FRONTEND_BACKEND_GAPS.md)、[驗收紀錄](FRONTEND_VALIDATION.md)。整合確認 daily-research 的 result 不含 screening-output 路由包裝欄位，解析差異已明列於後端交接文件。

### 驗收情境

- [ ] 正常研究、少於五檔、零結果、拒絕發布、來源衝突與資料過期。
- [ ] 三分鐘等待、逾時、重新整理、後端重啟及功能未啟用。
- [ ] 收藏建立追蹤與論點；略過改變軟性偏好，硬性限制保持不變。
- [ ] 以可重現情境檢查回饋前後排序；名次沒有變動時據實呈現。
- [ ] 跨 run 證據不混用，注意股／處置股旗標不遺漏。
- [ ] 論點削弱、失效與衝突通知可用明確標示的 mock 情境驗證。
- [ ] 長中文、長連結、多來源、缺日期、缺論點、未知狀態與極端數值不破版。
- [ ] 鍵盤導航、焦點返回、200% 縮放、窄螢幕、減少動態效果與通知拒絕授權皆可使用。
- [ ] 通知輪詢與重新整理不造成重複提示，已讀狀態正確同步。
- [ ] Typecheck、build、契約／整合測試及主要瀏覽器操作檢查通過。
- [ ] 前端不包含模型憑證，不自行重算或猜補業務資料。
- [ ] 同時涵蓋 TWSE／TPEx sample，正確顯示市場；不把八筆 sample 當成全市場研究成果。
- [ ] 資料百分比、億元格式、財務安全百分位、估計可用日及資料集更新時間沒有誤標。
- [ ] 排程等待新資料、重啟補跑、同日成功重用，以及部分收藏重查失敗均可清楚呈現。
- [ ] 來源失效時呈現實際 Retry／Fallback／Stop 紀錄，不模擬成功，不把研究拒絕當成一般 HTTP 失敗。
- [ ] Mock／real 使用相同 response parsing；快取與模擬情境不互相污染。

### 原計畫要求的五個 Demo

| 情境 | 必須呈現的真實行為 |
| --- | --- |
| 正常研究 | Quant 篩選 → 動態研究 → 證據查核 → 風險 → 實際可發布的 Top-K。 |
| 來源缺失 | 來源失敗 → 後端備援／重試 → 仍無法核實則停止或拒絕，保留實際紀錄。 |
| 回饋改變排序 | 記錄同一候選資料在回饋前後的權重與順位；硬性限制不變，未改變順位時也據實呈現。 |
| 論點追蹤 | 收藏建立論點 → 新事件／新資料 → 後端判定論點削弱或失效 → 通知；至少一次瀏覽器通知展示。 |
| 證據衝突 | 揭露來源不一致、驗證狀態及停止／暫停結論的結果，不編造裁決。 |

Demo 的 mock 測試與正式真實整合需分開記錄。現有 mock 無法覆蓋的來源 Retry／Fallback 等情境，以測試替身檢查 UI，正式展示則使用後端實際紀錄；不能把 UI 測試替身當成 Agent 已執行的證據。

### 使用者驗證與競賽交件背景

- 原計畫要求 3–5 位目標散戶的訪談與限時任務，比較原本研究方式與股研雷達。保留原始紀錄，不把小樣本外推成普遍成效。
- 觀察 Research Time、Source Traceability、Risk Identification、Citation Correctness、Task Success Rate、Latency、Cost 與 Failure Types。UI 可顯示 API 實際提供的耗時／成本；其他成效由實測整理，不在前端生成假數字。
- 設計需支援四分鐘展示的敘事：痛點 → 前測 → 篩選與研究 → 證據與風險 → 回饋變化 → 論點追蹤與通知。截圖、錄影、檔名及展示內容需匿名化並移除憑證。
- 使用者提供的原計畫將 2026/10/15 設為可提交版本目標、2026/10/16 23:59（台灣時間）設為交件期限，交件包含 12 頁內 PDF、4 分鐘內影片與驗證資料。這些是原始計畫背景，並非本次重新核驗官方期限；簡報、影片、招募與送件不因此成為本回合執行工作。
- 原先各日期的工作安排不代表已完成；環境準備以本文件「已完成」清單為限，其他工作均依實際證據記錄。

### 完成定義

前端 MVP 完成標準是現有 API 支援的流程均可操作，缺口有清楚狀態與後端交接規格。

真實研究與真實論點變更通知另行驗收，不以模擬結果宣稱完成。驗收紀錄需區分已測通項目、mock 展示、尚待後端支援與未測項目。

### 對話決策核對與已取代項目

本文件保存對話中仍有效的需求、決策及限制，不逐字複製對話，也不把被後續決策取代的草案重新列成實作要求。

| 對話內容 | 最終採用與文件位置 |
| --- | --- |
| 閱讀分工、v2.0 與 v1.0 | 第一節保留來源、目標使用者、A／B／C 分工與產品邊界；v2.0 主導，v1.0 補充。 |
| 將 repo 放到 Code | 第一節記錄 clone 路徑、分支與已完成狀態。原位置沒有 repo，因此執行的是 clone，而非對不存在的 checkout 執行 pull。 |
| 前端從 main 開，不寫在 B 分支 | 第一節與第五節保留分支、backend worktree 及 apps/web 規劃。 |
| 完整 MVP，而非只做研究頁或純視覺原型 | 第三至第五節涵蓋完整流程、串接與驗收。 |
| 選擇淺色研究工作台 | 第二節保留顏色、字體、層級與動效；第一版不另做深色主題。 |
| 先安裝並讀 skill，再決定設計；至少 apple-design | 第一節記錄已安裝清單，第二節說明實際影響；不要求安裝整套 Swift／Expo 等無關 skills。 |
| 以 skills 修訂既有方案 | 依使用者本次回饋更新為 192px 導覽、全寬比較表與獨立個股工作區；取代舊版 208px／320px 配置。 |
| 導覽收斂、按需查證 | 第三節以研究與追蹤為主要導覽；取代初稿將所有工具同等放在主導覽的安排，也不預設四欄同時顯示。 |
| 前端先接現有 API，不擴大修改後端 | 第一、四節記錄完整 API、明確缺口與替代呈現；後端補強列交接需求。 |
| 前測、數據、來源、風險、回饋及論點契約 | 第三、四節含欄位、格式、狀態、來源映射與邊界。 |
| 通知、長請求、錯誤、CORS、補跑與 mock／real | 第四節完整保留；通知顯示後不立即當成已讀，這是對交接文件最小範例的 UX 修訂。 |
| 完整方案先存 Markdown，不寫程式 | 此要求屬先前規劃階段；使用者後續已明確要求依本文件實作，現在已建立前端、backend worktree 與測試，未擴大到修改後端業務邏輯。 |
| 五個 Demo、3–5 位實測與匿名展示 | 第五節保留為驗收／交件背景，不宣稱已完成。 |

本次全文核對補齊的重點為：角色與範圍、API 清單與 response mapping、資料格式與狀態對照、profile 預設與合法回饋原因、排程／補跑與 mock 持久化限制、Retry／Fallback、實測與 Demo 要求，以及草案被取代的決策。仍未由後端提供的能力維持明確缺口，不為了讓方案看似完整而假設已具備。
