# Candidate + Evidence 契約（給 Agent 與 Frontend）

Data Layer 交付給其他模組的唯一介面是一份 JSON 文件：**候選股票（Candidate）＋ 每個數字的出處（Evidence）**。
這份文件說明怎麼讀、怎麼引用、哪些事不能做。計算方式見 [screening.md](screening.md)。

- 機器可讀 schema：[`screening-output.schema.json`](../../packages/taiwan_data/src/taiwan_data/screening/screening-output.schema.json)（JSON Schema 2020-12）
- 範例（真實資料 8 檔）：[`sample_screening_output.json`](../../packages/taiwan_data/tests/fixtures/sample_screening_output.json)
- 目前版本：`schemaVersion = "screening-output-v1"`

## 分工邊界

| Data Layer 負責 | Data Layer **不**負責 |
|---|---|
| 從官方資料算出指標、排名、風險旗標 | 投資論述（Investment Thesis）、買賣建議 |
| 每個數字附上來源、期間、公式與驗證狀態 | LLM 推理、新聞摘要 |
| 保證輸出可重現、可追溯 | 前端呈現方式 |

## 文件結構

```text
{
  schemaVersion   "screening-output-v1"
  run             這次 screening 的條件與資料期間
  candidates[]    依 rank 排序的候選股票
  evidence[]      candidates 引用到的所有 Evidence
  excluded        沒進排名的股票數，依原因分類（可完整對帳）
}
```

### `run`

| 欄位 | 範例 | 說明 |
|---|---|---|
| `runId` | `20261010-001` | 這次執行的 ID；同一份輸入會得到同一個 ID |
| `runAt` | `2026-10-10T13:25:42+08:00` | 執行時間 |
| `asOfDate` | `2026-10-10` | 評估基準日 |
| `priceAsOf` | `2026-10-08` | 實際使用的最後交易日 |
| `revenueAsOf` | `2026-08` | **所有股票共用**的營收月份 |
| `revenueCoverage` | `1.0005` | 該月有營收的檔數 ÷ 前一月檔數 |
| `financialAsOf` | `2026Q2` | **所有股票共用**的財報季度 |
| `financialCoverage` | `1.0005` | 同上，以季度計 |
| `configVersion`、`config` | `v1` | 系統參數（門檻、窗口長度等） |
| `profile` | — | 使用者條件（見下） |
| `dataVersion` | `ds-130b1ff5d3e877e2` | 資料版本摘要 |
| `sourceSnapshot` | `sha256:287b…` 或 `null` | 對應的資料庫快照雜湊；`null` 代表未知 |
| `status` | `success` | 失敗的 run 不會產生文件 |
| `counts` | `{universe, baseEligible, ranked}` | 對帳用 |

**UI 建議**：在結果頁顯示「行情至 {priceAsOf}、營收 {revenueAsOf}、財報 {financialAsOf}」，讓使用者知道資料時點。

### `candidates[]`

```json
{
  "stockId": "2059",
  "stockName": "川湖",
  "market": "TWSE",
  "industry": "電子工業",
  "percentileScope": "industry",
  "metrics": {
    "revenueYoY":      { "value": 344.4151,   "percentile": 0.994186, "evidenceId": "ev-001" },
    "operatingMargin": { "value": 82.0846,    "percentile": 1.0,      "evidenceId": "ev-002" },
    "debtRatio":       { "value": 28.352,     "percentile": 0.889535, "evidenceId": "ev-003" },
    "avgTurnover20d":  { "value": 6122820101.75, "percentile": null,  "evidenceId": "ev-004" }
  },
  "riskFlags": ["notice"],
  "quantScore": 0.96124,
  "rank": 1
}
```

| 欄位 | 說明 |
|---|---|
| `metrics.revenueYoY.value` | 營收年增率，**%**（`344.4` = 344.4%） |
| `metrics.operatingMargin.value` | **單季**營業利益率，% |
| `metrics.debtRatio.value` | 負債比，% |
| `metrics.avgTurnover20d.value` | 近 20 個交易日平均成交金額，**新台幣元** |
| `percentile` | 0–1，在同產業（或全市場）中的相對位置，**越高越好** |
| `debtRatio.percentile` | ⚠️ 是 **safety percentile**：越高代表負債比**越低**，不是負債比本身的名次 |
| `avgTurnover20d.percentile` | 永遠是 `null`（流動性不計分，只當門檻） |
| `percentileScope` | `industry`（同產業 ≥ 5 檔）或 `market`（產業太小，改用全市場） |
| `riskFlags` | `disposition`（處置中）、`notice`（近 30 日有注意股公告）；只是提示，**不影響名次** |
| `quantScore` | 0–1，三個 percentile 的加權平均 |
| `rank` | 1 起算，依 `quantScore` 遞減，同分以 `stockId` 遞增 |

### `evidence[]`

```json
{
  "id": "ev-002",
  "stockId": "2059",
  "metric": "operatingMargin",
  "claim": "2026Q2 單季營業利益率 82.1%",
  "value": 82.0846,
  "unit": "%",
  "dataset": "quarterly_financials",
  "source": "MOPS",
  "sourceUrl": "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04",
  "referenceUrl": null,
  "dataAsOf": "2026Q2",
  "windowStart": "2026Q2",
  "windowEnd": "2026Q2",
  "fetchedAt": "2026-10-10T08:53:01+08:00",
  "fetchedAtScope": "row",
  "calculation": {
    "formula": "operating_income_quarter / revenue_quarter",
    "inputs": { "operatingIncomeQuarter": 0, "revenueQuarter": 0, "availabilityCutoff": "2026-08-31", "...": "..." }
  },
  "verificationStatus": "verified"
}
```

| 欄位 | 說明 |
|---|---|
| `id` | `ev-001`…，**只在同一個 run 內唯一**；跨 run 引用時要連同 `runId` |
| `claim` | 可直接顯示給使用者的一句話（繁體中文） |
| `value`、`unit` | 與 Candidate 中的數值完全相同；`unit` 為 `%` 或 `TWD` |
| `source` | `MOPS`、`TWSE`、`TPEx` |
| `sourceUrl` | 官方資料端點（取自實際抓取紀錄，不編造）。部分是 API 端點，瀏覽器直接開可能不是好讀的頁面 |
| `referenceUrl` | 給人看的參考頁；目前沒有穩定網址時為 `null` |
| `dataAsOf`、`windowStart`、`windowEnd` | 資料期間：營收為月份（去年同月 → 本月），財報為季度，成交金額為日期區間 |
| `fetchedAt`、`fetchedAtScope` | `row`＝這筆資料自己的抓取時間（財報）；`dataset`＝該資料集最近一次更新時間（月營收、行情） |
| `calculation` | `formula` 與原始輸入數字；金額輸入的單位寫在 `inputs` 內（例如 `revenueUnit: "TWD thousand"`） |
| `verificationStatus` | 正式輸出中**一定是 `verified`** |

四種 Evidence：

| metric | claim 範例 | 計算 | 驗證方式 |
|---|---|---|---|
| `revenueYoY` | 2026-08 月營收年增 344.4% | 本月營收 ÷ 去年同月營收 − 1 | 與 MOPS 提供的年增率比對（容差 0.1 個百分點） |
| `operatingMargin` | 2026Q2 單季營業利益率 82.1% | 單季營業利益 ÷ 單季營收 | 與資料表內單季比率比對 |
| `debtRatio` | 2026Q2 負債比 28.4% | 總負債 ÷ 總資產 | 與資料表內比率比對 |
| `avgTurnover20d` | 近 20 個交易日（2026-09-09 至 2026-10-08）日均成交金額 61.2 億元 | 20 個交易日成交金額平均 | 20 天都必須有資料 |

### `excluded`

```json
{ "total": 1966, "byStage": { "base": 755, "constraint": 1211 },
  "byReason": { "inactive": 406, "min_liquidity": 1193, "...": 0 } }
```

恆等式：`counts.universe = counts.ranked + excluded.total`，`excluded.total = byStage.base + byStage.constraint`。
每檔只記第一個命中的原因，所以可以完整加總。

| 原因 | 階段 | 意義 |
|---|---|---|
| `inactive` | base | 已下市／終止上櫃 |
| `not_general_statement` | base | 金融等非一般業，此模型不適用 |
| `missing_financials` | base | 沒有可用財報 |
| `financials_not_common_quarter` | base | 沒有本次共同季度的財報 |
| `insufficient:<metric>` | base | 缺必要資料 |
| `partial:<metric>`／`conflict:<metric>` | base | 驗證未通過 |
| `excluded_industry`、`max_debt_ratio`、`min_liquidity`、`active_disposition` | constraint | 使用者條件 |

## Profile（使用者條件）

```json
{
  "excludedIndustries": [],
  "maxDebtRatio": null,
  "minLiquidity": 100000000,
  "excludeDisposition": true,
  "weights": { "growth": 1, "profitability": 1, "safety": 1 }
}
```

| 欄位 | 預設 | 說明 |
|---|---|---|
| `excludedIndustries` | `[]` | 依 `industry` 名稱排除 |
| `maxDebtRatio` | 無上限 | 負債比上限（%） |
| `minLiquidity` | **1 億元** | 20 日平均成交金額下限；`null` 或 `0` 關閉。UI 可提供 0.5 億／1 億／3 億等選項 |
| `excludeDisposition` | `true` | 排除處置中股票 |
| `weights` | 等權 | `growth`（營收 YoY）、`profitability`（營業利益率）、`safety`（負債比）；自動正規化 |

改變 profile **不會**改變任何股票的 percentile，只會改變誰被排除與最後的分數／名次。

## 給 Agent 的規則

1. **只能引用 Evidence 裡的數字**。不要自行計算、四捨五入成不同數值，或推測沒有 Evidence 的數字。
2. 引用時附上 Evidence ID，例如：「營收年增 344.4%〔ev-001〕」。ID 比對**不分大小寫**（`EV-001` 等同 `ev-001`）。
3. 一個 Evidence ID 只代表一個 run 內的一個數字；保存對話或報告時要連同 `runId`。
4. `riskFlags` 必須在論述中揭露，不可忽略。
5. 財報的可用日是**估計值**（`availabilityCutoff`），不要描述成「公司於某日公告」。
6. `fetchedAtScope = "dataset"` 時，`fetchedAt` 是資料集最近更新時間，不要寫成「這筆資料於某時抓取」。
7. 新聞、重大訊息等外部資料由 Agent 層自行建立 Evidence；不要混用 Data Layer 的 `ev-` 編號。

## 給 Frontend 的建議

- **Evidence Card**：標題用 `claim`；展開顯示 `source`、`dataAsOf`、`windowStart`–`windowEnd`、`calculation.formula`、
  `calculation.inputs`、`fetchedAt`（`dataset` 時標示「資料集更新時間」）、`sourceUrl`。
- **數字格式**：`unit = "%"` 顯示到小數 1 位；`unit = "TWD"` 建議以「億元」顯示（÷ 1e8）。
- **percentile**：可畫成 0–100 的進度條；`debtRatio` 那條請標示「財務安全度」而不是「負債比名次」。
- **可用日**：顯示為「可用日期（估計）」。
- **資料時點**：頁首顯示 `run.priceAsOf`、`run.revenueAsOf`、`run.financialAsOf`。
- **沒有結果時**：顯示 `excluded.byReason`，說明股票為什麼沒進排名。

## 驗證輸出（建議在 CI 或讀取時做）

Python：

```python
import json, jsonschema
from importlib.resources import files
schema = json.loads(files("taiwan_data.screening").joinpath("screening-output.schema.json").read_text("utf-8"))
jsonschema.validate(json.load(open("var/output/candidates.json", encoding="utf-8")), schema)
```

Node（`npm i ajv ajv-formats`）：

```js
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

const schema = JSON.parse(readFileSync("packages/taiwan_data/src/taiwan_data/screening/screening-output.schema.json", "utf8"));
const doc = JSON.parse(readFileSync("var/output/candidates.json", "utf8"));
const ajv = addFormats(new Ajv2020({ allErrors: true }));
if (!ajv.validate(schema, doc)) throw new Error(ajv.errorsText());

const evidence = new Map(doc.evidence.map((e) => [e.id.toLowerCase(), e]));
const cite = (id) => evidence.get(id.toLowerCase());   // Agent 引用 "EV-001" 也找得到
```

## 版本與變更規則

- 新增**選填**欄位：維持 `screening-output-v1`，並在本文件與 schema 補上。
- 改名、刪除、改變單位或語意：升為 `screening-output-v2`，並在 PR 中說明遷移方式。
- 需要調整欄位時，請開 Issue 或在 PR 留言描述需求（例如「Evidence Card 想多顯示某欄」），由 Data Layer 修改並更新 fixture。
