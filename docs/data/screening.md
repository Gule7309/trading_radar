# Screening、Candidate 與 Evidence

Data Layer 的最後一段：把 SQLite 內的市場資料轉成 Agent 與 Frontend 可直接使用的
**Candidate + Evidence**，並讓每個量化數字都能追溯到官方資料來源。

```text
SQLite ─▶ Screening Run ─▶ screening_results ─▶ Candidate[] ┐
                    └────▶ screening_evidence ─▶ Evidence[]  ├─▶ JSON ─▶ Agent／Frontend
```

Data Layer **不**產生 Investment Thesis，也不做 LLM 推理、新聞摘要、技術指標或新資料來源。

機器可讀契約：[`screening-output.schema.json`](../../packages/taiwan_data/src/taiwan_data/screening/screening-output.schema.json)
（JSON Schema 2020-12，隨 package 發佈）。範例：
[`sample_screening_output.json`](../../packages/taiwan_data/tests/fixtures/sample_screening_output.json)。

## 介面

```powershell
taiwan-data screen --limit 20 --output var/output/candidates.json
taiwan-data screen --as-of 2026-10-10 --profile profile.json --limit 20
```

```python
from taiwan_data.screening import Profile, get_candidates
output = get_candidates(store, Profile(max_debt_ratio=60), as_of_date=None, limit=20)
```

`get_candidates` 會建立（或重用）一次 screening run 並回傳完整輸出文件；JSON 一律 camelCase，
Python 與 DB 一律 snake_case。

### Profile（使用者條件）

| 欄位 | 預設 | 說明 |
|---|---|---|
| `excludedIndustries` | `[]` | 排除的 `stocks.industry_code` |
| `maxDebtRatio` | 無 | 負債比上限（%） |
| `minLiquidity` | **1 億**（`100000000`） | 20 日平均成交金額下限（新台幣元）。可覆寫；`null` 或 `0` 關閉。**只作 hard constraint，不計分** |
| `excludeDisposition` | **`true`** | 排除目前處於處置期間的股票 |
| `weights` | 等權 | `growth`／`profitability`／`safety`，自動正規化 |

### Config（系統參數，不寫死在核心邏輯）

| 欄位 | 預設 |
|---|---|
| `version` | `v1` |
| `revenueCoverageThreshold`／`financialCoverageThreshold` | 0.95 |
| `scanPeriods` | 6（最多往前找幾個月／季） |
| `minIndustrySize` | 5 |
| `turnoverWindowDays` | 20 |
| `noticeLookbackDays` | 30 |
| `evidenceTopK` | 50 |
| `yoyTolerancePp`／`marginTolerancePp`／`debtTolerancePp` | 0.1 |

## 流程（順序是規格的一部分）

```text
1. 決定期間      as_of_date → price_as_of、營收月份（coverage gate）、共同財報季度（coverage gate）
2. base universe  stocks 全部
3. base exclusions（資料品質／適用範圍，與使用者條件無關）
4. 產業 percentile（只在通過 base exclusions 的股票之間計算）
5. 使用者 hard constraints
6. 加權分數 → 排名
7. 前 K 名產生 Evidence
```

**為什麼 percentile 在 hard constraints 之前**：percentile 代表公司在產業／市場中的相對位置，
不應因不同使用者的 `maxDebtRatio`、`minLiquidity` 而改變。

### Base exclusions（依序比對，記錄第一個命中的原因）

| `exclusion_reason` | 條件 |
|---|---|
| `inactive` | `stocks.is_active = 0` |
| `not_general_statement` | 財報 `statement_type` 不是 `general`（銀行、金控、保險、證券、其他）。**此版排名模型不適用，不硬算** |
| `missing_financials` | 沒有任何可用財報 |
| `financials_not_common_quarter` | 有財報但沒有本次共同季度的財報（例如 run 選 2026Q2，該公司只有 2026Q1）。**不與他人混排** |
| `insufficient:<metric>` | 必要資料缺失 |
| `partial:<metric>`／`conflict:<metric>` | 驗證未通過（見下） |

`<metric>` 為 `revenue_yoy`、`operating_margin`、`debt_ratio`、`avg_turnover_20d`。
金融相關股票的資料與查詢能力保留，只是不進此排名。

### 使用者 hard constraints（percentile 之後）

`excluded_industry`、`max_debt_ratio`、`min_liquidity`、`active_disposition`。
被排除者保留 screening result 與原因，不影響其他股票的 percentile。

## 指標定義與驗證

| 指標 | 計算 | 來源欄位 | 交叉驗證 |
|---|---|---|---|
| `revenueYoY` (%) | `本月營收 ÷ 去年同月營收 − 1` | `monthly_revenue` | 與來源值 `yoy_pct` 比對，差 > 0.1pp → `conflict`；來源值為空 → `partial`；缺本期／去年同期或去年同期 ≤ 0 → `insufficient` |
| `operatingMargin` (%) | `operating_income_quarter ÷ revenue_quarter`（**單季值**，非累計） | `quarterly_financials` | 與 `operating_margin_quarter` 比對 |
| `debtRatio` (%) | `total_liabilities ÷ total_assets` | `quarterly_financials` | 與 `debt_ratio` 比對 |
| `avgTurnover20d` (新台幣元) | 近 20 個**市場交易日**的 `AVG(turnover)` | `daily_prices` | 20 個交易日都有資料才是 `verified`；不足 → `partial` |

營收單位為新台幣千元（MOPS 原始單位），Evidence 的 `calculation.inputs` 會標示。

### verificationStatus

| 值 | 意義 | 能否成為正式 Candidate |
|---|---|---|
| `verified` | 重算值與來源值一致、輸入完整 | 是 |
| `partial` | 無法完全驗證（窗口不足、來源值為空） | **否** |
| `conflict` | 重算值與來源值不一致 | **否** |
| `insufficient` | 缺必要輸入 | **否** |

**發布規則**：正式 Candidate 的三個排名指標（及流動性）都必須是 `verified`。因為驗證是 base
exclusion，所以每個有名次的股票必然符合這條規則；`partial`／`conflict`／`insufficient` 的狀態保留在
`screening_results` 的 `*_status` 欄位供稽核，不會出現在 `candidates`，也不產生 Evidence。

## 期間與 Coverage Gate

- `price_as_of` = `as_of_date` 以前最後一個有行情的交易日。
- **營收月份**：只考慮已過法定公告期限的月份（月 M 在次月 10 日起可用，避免前視偏誤）。
  `coverage(M) = M 月有營收的檔數 ÷ M−1 月有營收的檔數`（分母取自資料庫，不依賴外部名單）。
  從最新可用月份往前找第一個 `coverage ≥ 門檻` 的月份；沒有任何一個通過則 run 失敗，不降級。
- **共同財報季度**：同樣的規則，以 `statement_type='general'` 且 `available_date ≤ as_of_date`
  的檔數計算。
- 所有股票只使用同一個營收月份與同一個財報季度，不會出現 A 公司 9 月、B 公司 8 月卻混排。
- `quarterly_financials.available_date` 是**估計的可用日（availability cutoff）**，採保守的月底推算（例如 Q2 為 8/31），
  **不是實際公告日**。Evidence 的 `calculation.inputs.availabilityCutoff` 即此值；UI 請標示為「可用日期估計」，
  不要寫成公告日。此版不重建歷史實際公告日。

## 產業 Percentile 與分數

- 分組只用 `stocks.industry_code`（`stock_industry_map` 有多值，不使用）；缺值視為無產業。
  **已知限制**：此欄位粒度不一致——多數股票是細分產業（例如「半導體業」），但仍有約 185 檔現行股票
  只有上層分類「電子工業」，所以「電子工業」這一組比其他組大。這是資料來源的限制，不在此版修正。
- percentile = `(平均名次 − 1) ÷ (n − 1)`，同值取平均名次，範圍 0～1；n = 1 時為 0.5。
- 產業內（通過 base exclusions）樣本 < `minIndustrySize` 時改用全市場 percentile，
  並在 `percentileScope` 標示 `industry`／`market`。
- Safety 以負債比反向計算（越低 percentile 越高）。因此輸出中 `debtRatio.percentile` 是
  **safety percentile**（越高代表負債比越低），不是負債比本身的名次。
- `quantScore = Σ(w × percentile) ÷ Σ w`（Growth、Profitability、Safety）。
  `avgTurnover20d` **不計分**，只作最低流動性門檻與展示。
- 排序：`quantScore` 遞減，同分以 `stock_id` 遞增，結果可完全重現。缺資料者不排名、不補值。

## 風險旗標

- `disposition`：`as_of_date` 落在處置期間內（`start_date ≤ as_of ≤ end_date`）。
  `excludeDisposition` 預設 `true`，處置中的股票不進正式排名，但仍保留結果與原因。
- `notice`：近 `noticeLookbackDays`（預設 30）日內有注意股公告。**只作旗標，不影響名次。**

## DB schema（schema_version 2 → 3，僅新增資料表）

`screening_runs`（每次 run 一列）、`screening_results`（每次 run 每檔股票一列，含排名外的原因）、
`screening_evidence`（前 K 名的 Evidence）。結果與 Evidence 都**存值而非參照**，之後資料庫更新，
舊 run 仍可原樣讀出。

`screening_runs` 重點欄位：`run_id`（`YYYYMMDD-NNN`）、`as_of_date`、`price_as_of`、
`revenue_as_of`、`revenue_coverage`、`financial_as_of`、`financial_coverage`、`config_version`、
`config_json`、`profile_json`、`input_fingerprint`、`data_version`、`source_snapshot`、`status`。

- `input_fingerprint`：`as_of_date`、解析後的期間、profile、config、`data_version` 的雜湊。
  相同指紋會重用既有 run，不重複寫入。
- `data_version`：由 `dataset_status`（各資料集的 `as_of_value`、`fetched_at`、筆數、狀態）算出的摘要
  （`ds-…`），不需要對整個 SQLite 重新雜湊。`taiwan-data manifest` 也會把同一個值寫入 manifest。
- `source_snapshot`：若 `<db>.manifest.json` 存在，且其 `data_version` 等於目前資料庫的 `data_version`，
  才引用其 SHA-256（`sha256:…`）；否則為 `NULL`（代表未知，避免引用過期的 manifest）。資料集更新後 manifest
  即視為過期，需重新執行 `taiwan-data manifest`。不比對檔案大小，因為 screening 寫入與 WAL checkpoint
  都會改變大小。

## Evidence

Evidence 在 screening 階段由指標推導產生，**不修改**原始資料表。

| 欄位 | 說明 |
|---|---|
| `id` | `ev-001`…，在單一 run 內唯一（小寫；引用時不分大小寫） |
| `stockId`、`metric`、`claim`、`value`、`unit` | 論述與數值（`%` 或 `TWD`） |
| `dataset`、`source`、`sourceUrl`、`referenceUrl` | 來源。`sourceUrl` 只取自 `dataset_status.source` 實際記錄的官方端點，不編造；沒有穩定參考頁時 `referenceUrl` 為 `null` |
| `dataAsOf`、`windowStart`、`windowEnd` | 資料期間 |
| `fetchedAt`、`fetchedAtScope` | 抓取時間。`row` = 該列自己的時間（財報）；`dataset` = 該資料集最近一次更新時間（月營收、行情沒有逐列時間） |
| `calculation` | `formula` 與 `inputs`（原始輸入數字） |
| `verificationStatus` | 見上 |

只為**前 `evidenceTopK` 名**產生 Evidence；`limit` 超過 K 會報錯，而不是默默缺 Evidence。
來源對應：月營收 → MOPS；財報 → MOPS（營業利益率對應損益表端點、負債比對應資產負債表端點）；
成交金額 → TWSE `MI_INDEX`／TPEx `dailyQuotes`（依股票所屬市場）。

## 輸出文件

```json
{
  "schemaVersion": "screening-output-v1",
  "run": { "runId": "20261010-001", "runAt": "2026-10-10T13:25:42+08:00", "asOfDate": "2026-10-10",
           "priceAsOf": "2026-10-08", "revenueAsOf": "2026-08", "revenueCoverage": 1.0005,
           "financialAsOf": "2026Q2", "financialCoverage": 1.0005, "configVersion": "v1",
           "dataVersion": "ds-130b1ff5d3e877e2", "sourceSnapshot": null, "status": "success",
           "profile": {}, "config": {}, "counts": { "universe": 2394, "baseEligible": 1639, "ranked": 1616 } },
  "candidates": [ { "stockId": "2330", "stockName": "台積電", "market": "TWSE",
      "industry": "半導體業", "percentileScope": "industry",
      "metrics": { "revenueYoY": { "value": 53.32, "percentile": 0.91, "evidenceId": "ev-001" },
                   "operatingMargin": { "value": 60.34, "percentile": 0.95, "evidenceId": "ev-002" },
                   "debtRatio": { "value": 30.94, "percentile": 0.74, "evidenceId": "ev-003" },
                   "avgTurnover20d": { "value": 5.9e10, "percentile": null, "evidenceId": "ev-004" } },
      "riskFlags": [], "quantScore": 0.87, "rank": 1 } ],
  "evidence": [ { "id": "ev-001", "verificationStatus": "verified", "…": "…" } ],
  "excluded": { "total": 1966, "byStage": { "base": 755, "constraint": 1211 },
                "byReason": { "inactive": 406, "min_liquidity": 1193, "…": 0 } }
}
```

Agent 引用 `ev-001`，Frontend 以 `evidence[].id` 展開成 Evidence Card。

## 對帳（universe = ranked + excluded）

每檔股票**只記錄第一個命中的排除原因**（先 base、後使用者條件），所以原因互斥、可以完整加總：

```text
counts.universe   = counts.ranked + excluded.total
excluded.total    = excluded.byStage.base + excluded.byStage.constraint = Σ excluded.byReason
counts.baseEligible = counts.universe − excluded.byStage.base
counts.ranked       = counts.baseEligible − excluded.byStage.constraint
```

`baseEligible` 是通過 base exclusions、尚未套用使用者條件的檔數；它與 `ranked` 的差距就是
`byStage.constraint`（`excluded_industry`、`max_debt_ratio`、`min_liquidity`、`active_disposition`）。
簡報若說「2,394 → 1,639」，後面還要接「再套用使用者條件 → 428」。

## 已知限制

- **產業粒度不一致**：見上方「產業 Percentile 與分數」。
- **`fetchedAt` 精細度**：月營收與行情只有資料集層級時間（`fetchedAtScope="dataset"`），不是逐列；財報才是逐列。
- **`delisted_stocks` 含「上櫃轉上市」**：該表記錄櫃買的「終止上櫃」日期，因此約 89 檔現行上市股票也在其中
  （例如統新、藥華藥）。Screening 不使用此表，而是以 `stocks.is_active`、完整 20 日行情與共同季度財報判斷，
  所以不受影響；其他程式若用此表判斷「已下市」需注意。
- **可用日為估計值**：見「期間與 Coverage Gate」。
- **金融業不適用此模型**：銀行、金控、保險、證券、其他共約 40 檔，只保留資料，不排名。
- **營收 YoY 與來源值衝突的股票不進排名**：2026-08 約有 6 檔（來源 `yoy_pct` 與用營收重算差 > 0.1pp，
  多半是營收重編或基期不同），保留在 `screening_results` 供稽核。
