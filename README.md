# trading_radar

股研雷達（Trading Radar）— Agentic AI 台股研究助理。

目前 repository 正在初始化。B 模組（Agent / Evidence）將先以 typed research harness、evidence verification 與 publication gate 建立 MVP，再逐步接上官方資料來源與新聞工具。

## 資料層

`packages/taiwan_data` 提供台股研究資料（行情、法人、月營收、季財報、融資融券、除權息、
處置／注意股、下市與產業對照）的 SQLite 資料庫與官方來源每日更新 CLI。
建置、資料集說明、本機排程與已知限制見 [docs/data/README.md](docs/data/README.md)。
