# C Frontend Handoff — Start Here

> **給 C：先看這份。**
>
> B / Agent + Evidence 的 MVP HTTP contract 已可供前端開發。你不需要等 OpenAI，也不需要持有 Gemini/OpenAI API key。

## 0. 目前狀態

### 已可用

- A Data Layer 的 `screening-output-v1` 已有正式 schema + fixture。
- B 可直接 ingest A 的 Candidate + verified Evidence + riskFlags。
- B 有 mock API，前端可完全不靠模型 key 開發。
- B 有 real API（目前 Gemini-backed）。
- Top-K、ResearchResult、Evidence source mapping、research history、thesis history API 都已存在。
- TypeScript contract export：`src/api/contracts.ts`。
- 最新 CI 已通過 Node typecheck/tests/offline eval 與 `taiwan_data` tests。

### 尚未做成「一個按鈕全自動」的地方

目前 **Node B server 不會自己啟動 Python screening**。

完整 real flow 現在是：

```text
A: taiwan-data screen
  ↓ screening-output-v1 JSON
B: POST /api/research/screening-output
  ↓
C: 顯示 Top-K / research result
```

所以 C 不要直接呼叫 Python/Data Layer。正式 demo orchestration 可以由 backend/script 先產生 A JSON，再送 B。

如果產品之後要讓瀏覽器按「重新篩選」就直接觸發 A，那是下一個 backend orchestration feature，不是目前 C 要自己處理的事。

---

# 1. C 現在就可以開始

## 最安全的 branch 做法

**不要把 frontend commit 寫到 `feat/b-agent-mvp`。**

Frontend 自己從 `main` 開 branch：

```bash
git switch main
git pull
git switch -c feat/frontend
```

因為 B PR #1 還是 Draft，建議另外開一份 backend checkout 只負責跑 server：

```bash
git fetch origin
git worktree add ../trading_radar_backend origin/feat/b-agent-mvp
cd ../trading_radar_backend
npm install
```

這個 worktree 可以是 detached HEAD；你只是拿它跑 backend，不要在裡面寫 frontend commit。

---

# 2. 前端開發：先用 mock backend

在 backend worktree：

```bash
npm run api:mock
```

API base：

```text
http://127.0.0.1:8787
```

先確認：

```http
GET /health
```

預期：

```json
{
  "ok": true,
  "service": "trading-radar-b",
  "thesisTracking": true,
  "batchResearch": true
}
```

mock mode 不需要：

- Gemini key
- OpenAI key
- SQLite data snapshot
- Python screening

Mock 研究文字會有 `[MOCK]` 前綴，不要把它當正式研究內容。

---

# 3. Frontend API base 請做成環境變數

不要把 URL 散落在 component 內。

例如 Vite：

```env
VITE_API_BASE=http://127.0.0.1:8787
```

```ts
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";
```

之後 mock / real backend 都使用同一個 base URL，不需要改 UI code。

---

# 4. C 最先接的 endpoint

## Preferred: A screening output -> B Top-K research

```http
POST /api/research/screening-output
Content-Type: application/json
```

Repo 已經有 A 的真實 fixture：

```text
packages/taiwan_data/tests/fixtures/sample_screening_output.json
```

Request：

```json
{
  "screeningOutput": {
    "...": "screening-output-v1"
  },
  "options": {
    "topK": 5,
    "researchLimit": 10,
    "concurrency": 2
  }
}
```

Response shape：

```ts
{
  screeningRunId: string;
  dataVersion: string;
  sourceSnapshot: string | null;
  researched: number;
  rejectedOrSkipped: Array<...>;
  top: Array<{
    rank: number;
    candidateId: string;
    ticker: string;
    score: number;
    quantScore: number;
    evidenceQuality: number;
    result: ResearchResult;
  }>;
}
```

前端主要吃：

```text
top[].result
```

---

# 5. Minimal fetch wrapper

```ts
import { API_BASE } from "./config";

export async function researchScreeningOutput(
  screeningOutput: unknown,
) {
  const response = await fetch(
    `${API_BASE}/api/research/screening-output`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        screeningOutput,
        options: {
          topK: 5,
          researchLimit: 10,
          concurrency: 2,
        },
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body?.message ??
        body?.error ??
        `B API failed: ${response.status}`,
    );
  }

  return body;
}
```

如果 frontend 與 backend 都是 TypeScript，可參考：

```text
src/api/contracts.ts
```

但不要從未 merge 的 backend branch 建立 brittle 的深層 runtime import；前端可以複製/產生自己的 API type layer，等 PR #1 merge 後再統一 import/package strategy。

---

# 6. ResearchResult 怎麼畫

最重要欄位：

```ts
result.status
result.decision
result.thesis
result.keyReasons
result.claims
result.risks
result.invalidationConditions
result.sources
result.verificationSummary
result.researchTrace
result.stopReason
```

## Top-5 Card 建議

顯示：

- ticker
- companyName
- rank
- keyReasons 前 1–2 個
- risks 前 1 個
- evidence freshness

可以顯示 quant/evidence score，但要標示成「研究排序指標」。

**不要寫成：**

```text
上漲機率 91%
AI 信心 93%
```

因為 `quantScore` / `evidenceQuality` / `score` 都不是股價上漲機率。

---

# 7. Claim / Evidence Drawer

每個 claim 有：

```ts
claim.sourceIds
```

去 `result.sources` 找相同 `sourceId`：

```ts
const sourcesForClaim = result.sources.filter((source) =>
  claim.sourceIds.includes(source.sourceId),
);
```

Evidence/source drawer 建議顯示：

- title
- publisher
- sourceType
- sourceTier
- publishedAt
- dataPeriod
- URL

Claim status：

- `SUPPORTED` -> 已驗證支持
- `REFUTED` -> 證據反駁
- `INSUFFICIENT` -> 證據不足
- `CONFLICTING` -> 來源衝突

---

# 8. A quantitative evidence 的 UI 注意事項

A 的詳細 contract 在：

```text
docs/data/candidate-evidence-contract.md
```

重要：

- Revenue YoY / operating margin / debt ratio 的單位是 **%**。
- `344.4` 代表 344.4%，不是 3.444。
- A 的 percentile 原始 contract 是 0–1。
- B adapter 內部 `industryPercentile` 會轉成 0–100。
- `debtRatio.percentile` 是「財務安全度」：越高越安全，不是負債比越高。
- 20d turnover 是 TWD，UI 建議轉成億元。
- 頁面建議顯示資料時點：
  - priceAsOf
  - revenueAsOf
  - financialAsOf

---

# 9. Risk flags 不可以漏掉

A 可能給：

```ts
riskFlags: ["notice"]
riskFlags: ["disposition"]
```

B 的 publication gate 已經規定：

> 有 upstream risk flag 時，必須找到 grounded risk evidence 並明確標成已處理，否則不能 PUBLISHABLE。

C 可以在 UI 顯示：

- 注意股
- 處置股

並在 risk detail 看：

```ts
risk.addressesRiskFlags
```

---

# 10. Rejected 不是 API error

這很重要。

```ts
result.status === "REJECTED"
```

通常代表可信任 Agent 主動拒絕發布，不一定是 backend 壞掉。

例如：

- INSUFFICIENT_EVIDENCE
- UNRESOLVED_CONFLICT
- NO_RISK_IDENTIFIED
- BUDGET_EXHAUSTED

UI 建議：

```text
目前證據不足，暫不形成研究結論
```

而不是：

```text
系統錯誤
```

真正 HTTP/API failure 才進 error page。

---

# 11. Loading / timeout

Real B 是同步 MVP endpoint，不是 streaming API。

一次研究可能：

```text
數十秒 ～ 最長約 3 分鐘
```

因為 backend research budget 有約 180 秒 wall-clock 上限。

Frontend：

- 不要設 10s / 30s 的 request timeout。
- 建議至少 > 190s，或 MVP 階段不要另外加比 backend 更短的 timeout。
- 顯示 `researching` loading state。
- 不要做假的「72% 完成」。
- 目前沒有 SSE / WebSocket progress stream。

必要 UI state：

1. idle
2. researching
3. success
4. rejected / insufficient
5. HTTP/network error

---

# 12. CORS

Backend 預設：

```env
CORS_ORIGIN=http://localhost:5173
```

如果 frontend 不是跑 5173，例如：

```text
http://localhost:3000
```

啟動 backend 前設定：

PowerShell：

```powershell
$env:CORS_ORIGIN="http://localhost:3000"
npm run api:mock
```

或 real：

```powershell
$env:CORS_ORIGIN="http://localhost:3000"
npm run api
```

目前 backend bind：

```text
127.0.0.1
```

所以預設只適合同一台電腦上的 browser/frontend。

如果要從手機或另一台電腦直接打 backend，需要另外做 host/network exposure；不要為了測試把 model key 放進 frontend。

---

# 13. 切到 real backend

UI 基本完成後，再切 real B。

backend worktree 建 `.env`：

```env
GEMINI_API_KEY=...
LLM_PROVIDER=gemini
SEARCH_PROVIDER=gemini-google-search
CORS_ORIGIN=http://localhost:5173
```

啟動：

```bash
npm run api
```

Frontend API base 不變：

```text
http://127.0.0.1:8787
```

因此 C 不需要因為 mock -> Gemini -> 未來 OpenAI 而改 component contract。

**C 不應該持有 Gemini/OpenAI key。**

---

# 14. 其他 backend endpoints

## Single CandidatePacket

```http
POST /api/research/runs
```

## Batch CandidatePacket

```http
POST /api/research/batch
```

新 A integration 優先使用：

```text
/api/research/screening-output
```

避免 Evidence lineage 遺失。

## Research history

```http
GET /api/research/runs/:runId
GET /api/research/tickers/:ticker/runs?limit=20
```

## Saved thesis

```http
POST /api/theses
POST /api/theses/:thesisId/recheck

GET /api/theses/:thesisId
GET /api/theses/:thesisId/versions
GET /api/theses/:thesisId/events
```

Thesis state：

- ACTIVE
- STRENGTHENED
- UNCHANGED
- WEAKENED
- INVALIDATED

---

# 15. C 不需要做的事

不要在 frontend：

- 直接 call Gemini/OpenAI
- 存 model API key
- 重新算 screening metrics
- 自己 verify claim
- 自己決定 source tier
- 自己做 publication gate
- 自己判斷 thesis 是否 invalidated
- parse Gemini grounding metadata
- 顯示 hidden chain-of-thought

這些全部是 B responsibility。

`researchTrace` 是可顯示的 structured operational trace，不是 chain-of-thought。

---

# 16. 錯誤處理

Backend 可能回：

- `400 INVALID_SCREENING_OUTPUT`
- `400 SCREENING_ADAPTER_ERROR`
- `400 INVALID_CANDIDATE_PACKET`
- `404 RUN_NOT_FOUND`
- `404 THESIS_NOT_FOUND`
- `413 REQUEST_BODY_TOO_LARGE`
- `500 INTERNAL_ERROR`

開發階段遇到 400：

1. 不要先在 frontend workaround contract。
2. 先看 response `error / message / issues`。
3. 對照：
   - `docs/INTEGRATION.md`
   - `docs/data/candidate-evidence-contract.md`
4. 如果 contract 真的需要改，A/B/C 一起改 schema，不要 C 自己猜欄位。

---

# 17. 開發順序

## C0 — 先完成

用 `npm run api:mock`：

- Top 5 list
- Research detail
- Claim status
- Evidence/source drawer
- Risk / riskFlag
- Loading
- Rejected
- Error

## C1

- Save thesis
- Thesis version history
- Event timeline
- Research trace accordion

## C2 — Integration checkpoint

切到：

```bash
npm run api
```

用一次真正 A `screening-output-v1` 做 end-to-end。

---

# 18. C 端完成定義

C 可以說「後端已接好」至少要符合：

- [ ] `GET /health` 正常
- [ ] mock `POST /api/research/screening-output` 成功
- [ ] Top-K cards 能 render
- [ ] ResearchResult detail 能 render
- [ ] claim -> sourceIds -> sources 可以點開
- [ ] REJECTED 不被當成 HTTP error
- [ ] notice / disposition 有顯示
- [ ] loading 可撐長 request
- [ ] backend URL 來自 env/config
- [ ] frontend 沒有 model API key
- [ ] mock -> real backend 不需改 response parsing

完成這些後，再做真實 Gemini integration check。

---

# 19. 其他文件

**C 先看本文件。**

需要更細時：

- `docs/INTEGRATION.md` — HTTP / A-B-C contract
- `docs/data/candidate-evidence-contract.md` — A Candidate + Evidence 語意
- `src/api/contracts.ts` — B TypeScript contracts
- `packages/taiwan_data/tests/fixtures/sample_screening_output.json` — 真實 A fixture
- `docs/B_AGENT_MVP.md` — B architecture / publication policy
