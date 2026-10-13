# 前端啟動與整合

實作位於 `apps/web`，使用 React、TypeScript、Vite、React Router、TanStack Query、Base UI、Sonner 與 CSS Modules。視覺與產品範圍依 [UI／UX 方案](FRONTEND_UI_UX_PLAN.md)。

## 本機啟動

本次實測 Node.js 22.21.1、npm 11.11.1。請使用 lockfile 安裝前端依賴。

後端在另一個終端執行：

```powershell
cd C:\Code\trading_radar_backend
npm install
npm run api:mock
```

前端：

```powershell
cd C:\Code\trading_radar\apps\web
npm ci
npm run dev
```

開啟 **http://localhost:5173**。後端為 **http://127.0.0.1:8787**。請保留前端的 `localhost`，因為後端預設 CORS 僅允許此 origin。固定使用 `demo-user`，不需要模型金鑰。

本機已建立 `C:\Code\trading_radar_backend`，固定在 `f4755065f4eb1c66cadcb154eefdf5800ffac67b` 的 detached worktree。前端位於從 main 建立的 `feat/frontend`；未將 UI 寫入後端分支。其他電腦可先在 repo 執行：

```powershell
git fetch origin
git worktree add --detach ..\trading_radar_backend origin/feat/b-agent-mvp
```

後端根目錄的 npm 腳本不在前端分支；不要在 `trading_radar` 根目錄執行 `npm run api:mock`。前端的套件設定獨立於後端，便於後續合併。

## 環境設定

可複製 `apps/web/.env.example` 成 `.env.local`，修改後重啟 Vite：

| 變數 | 預設 | 用途 |
| --- | --- | --- |
| `VITE_API_BASE` | `http://127.0.0.1:8787` | 後端根位址，不含 `/api`。 |
| `VITE_DATA_MODE` | `mock` | `mock` 或 `live`；須與後端管理 API 的實際模式一致。 |

寫入前重新讀取後端模式，避免同一位址重啟成另一環境後誤送操作。前端不存放模型憑證。未開啟管理 API 的後端無法核對環境，因此寫入會停止並提供系統狀態入口。

切換真實環境需由 B 配好 Data SQLite、CLI、模型、搜尋及排程，再啟動真實 API；前端只更改上述位址與模式。正式部署需讓後端 CORS 允許部署 origin，並將未知的前端路由 rewrite 到 `index.html`。

## 可操作流程

1. 「研究偏好」讀取後端預設，三步設定習慣、硬性限制與研究權重。
2. 「選股研究」使用 A 的 8 筆 fixture，或匯入符合 repo JSON Schema 的完整 screening output。開始研究呼叫 `/api/research/screening-output`，送 `topK=5`、`researchLimit=10`、`concurrency=2`。
3. 先搜尋或依產業篩選候選，以四項財務數據排序、勾選 2–3 檔並排比較，再進入個股總覽、證據查核、風險與失效、研究紀錄。首次使用即可看候選數據；已發布研究與篩選候選分開。比較與排序只影響閱讀，不會變更後端排名或偏好。
4. 收藏／略過需 1–4 個原因，可填 500 字備註。成功後顯示後端實際權重差異，閱讀中的列表不改序；再研究後可比較前次順位。
5. 收藏直接建立追蹤與論點。追蹤頁可搜尋與篩選「需重新評估」，優先看論點削弱或失效的股票；進入詳情可比較版本、查事件與來源及移除追蹤。
6. 通知中心可標記已讀、導向相關紀錄。桌面通知需主動開啟，頁面開啟時每 30 秒同步，按通知 ID 去重。
7. 執行紀錄包含每日任務、這個瀏覽器保存的完整研究、歷史回饋；系統頁提供能力、模型測試、資料及排程狀態。

修改硬性限制後，舊 input 會被阻止送出；請使用「取得最新每日研究」或重新匯入 A output。每日流程可能等待新資料，回傳的舊日期仍保留，不改寫成今天。

## Mock 展示

Mock 的研究文字與來源保留 `[MOCK]`；來源使用 `example.invalid`，不是可核查的真實報導。真實形狀的 A fixture 行情日為 **2026-10-08**、營收 **2026-08**、財報 **2026Q2**。

開發模式且偵測為 mock 時，追蹤詳情底部可模擬「削弱、失效、衝突」。這些按鈕呼叫既有重查 API，由後端判斷狀態與建立通知；不在前端直接改論點。

系統頁另有明確標示的「以舊範例強制展示每日研究」，會略過 mock 的資料日期檢查並可能重複既有任務，只供測試。正常「每日研究」不會強制略過資料日期。

`/design-qa` 為開發專用畫面測試，可切換 Demo data / Worst case / Empty / One。它使用 UI 測試替身，不寫入後端，收藏與回饋停用；不包含在 production build。

Mock 後端是記憶體儲存。重啟會清空研究、偏好、追蹤及通知；前端 IndexedDB 最多保留 30 輪完整研究，按 API 位址、模式、使用者隔離。舊快取可讀不代表後端仍能接收它的回饋，送出前會確認研究存在。

## 驗證與建置

```powershell
cd C:\Code\trading_radar\apps\web
npm test
npm run test:integration
npm run build
```

- `npm test`：資料契約、百分比／億元、限制比對、來源連結、未知狀態、錯誤與 300 秒逾時。時間測試使用虛擬計時，不需真的等待五分鐘。
- `npm run test:integration`：需啟動 mock，建立獨立測試使用者，不修改 `demo-user`。會測研究、真實排序變化、追蹤版本、通知、每日等待／強制／重用及移除追蹤。偵測到真實模型環境會直接停止。
- `npm run build`：先 typecheck 再產出 `apps/web/dist`；路由與依賴分包。
- `npm run preview`：在 5173 檢視 production build；執行前先停止占用 5173 的開發服務。

瀏覽器檢查使用 Playwright CLI；本機截圖、暫存腳本在 `output/playwright`，已排除 Git。驗收範圍與未測事項見 [驗收紀錄](FRONTEND_VALIDATION.md)，契約差異與後端需求見 [後端交接](FRONTEND_BACKEND_GAPS.md)。
