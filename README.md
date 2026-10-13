# trading_radar

股研雷達（Trading Radar）— Agentic AI 台股研究助理。

本分支包含台股資料層與前端研究工作台。B 模組（Agent / Evidence）維護於 `feat/b-agent-mvp`，以獨立 worktree 提供 mock／真實研究 API，包含 evidence verification 與 publication gate。

## 前端研究工作台

`apps/web` 提供研究、來源查證、回饋、研究偏好、論點追蹤、通知與系統狀態頁面。
使用獨立 backend worktree 執行 mock API，前端在 `http://localhost:5173`。
啟動與測試見 [前端說明](docs/FRONTEND_SETUP.md)，實作依據見 [UI／UX 方案](docs/FRONTEND_UI_UX_PLAN.md)，已驗證範圍見 [驗收紀錄](docs/FRONTEND_VALIDATION.md)。

## 資料層

`packages/taiwan_data` 提供台股研究資料（行情、法人、月營收、季財報、融資融券、除權息、
處置／注意股、下市與產業對照）的 SQLite 資料庫與官方來源每日更新 CLI。
建置、資料集說明、本機排程與已知限制見 [docs/data/README.md](docs/data/README.md)。
