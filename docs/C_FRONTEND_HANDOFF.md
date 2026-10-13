# C Frontend Handoff — Start Here

> **給 C：先看這份。**
>
> B 的 HTTP contract 已可直接接。現在不需要等 OpenAI，也不需要把 Gemini/OpenAI key 放到前端。
>
> 這一版已包含原始 MVP 的完整互動 loop：
>
> ```text
> 個人化情報
> → 主動送達
> → 收藏／略過與原因回饋
> → Soft Preference 小幅更新
> → 下一次排序改變
> → 收藏股票建立 Investment Thesis
> → 新證據 recheck
> → Thesis Changed / Evidence Conflict notification
> ```

## 0. C 現在可以直接開始嗎？

**可以，現在就開始。**

而且目前新增的個人化 / 回饋 / 通知 API 都是 **additive**，原本已交付給 C 的：

- `POST /api/research/screening-output`
- ResearchResult
- Top-K
- Evidence source mapping
- Thesis history

都沒有被破壞。

### 最安全 branch 做法

Frontend 自己從 `main` 開：

```bash
git switch main
git pull
git switch -c feat/frontend
```

另外開 backend worktree：

```bash
git fetch origin
git worktree add ../trading_radar_backend origin/feat/b-agent-mvp
cd ../trading_radar_backend
npm install
```

Frontend commit 不要寫進 `feat/b-agent-mvp`。

---

# 1. 先跑 mock backend

```bash
npm run api:mock
```

API base：

```text
http://127.0.0.1:8787
```

Mock mode：

- 不需要 Gemini/OpenAI key
- 不需要 Data SQLite snapshot
- 不需要 Python CLI
- 會使用 repo 內真實形狀的 Data PR #5 fixture
- 支援 profile / feedback / watchlist / thesis / notifications / daily delivery API

先打：

```http
GET /health
```

預期 capability 大致會是：

```json
{
  "ok": true,
  "service": "trading-radar-b",
  "thesisTracking": true,
  "batchResearch": true,
  "personalization": true,
  "watchlist": true,
  "notifications": true,
  "proactiveDelivery": true
}
```

---

# 2. API base 用環境變數

例如 Vite：

```env
VITE_API_BASE=http://127.0.0.1:8787
```

```ts
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";
```

不要把 URL 分散寫在 components。

---

# 3. 建議先固定一個 MVP userId

目前 hackathon MVP 沒做登入 / auth。

前端先固定：

```ts
export const DEMO_USER_ID = "demo-user";
```

之後所有 profile / feedback / watchlist / notification endpoint 都使用同一個 userId。

不要把這個當正式 auth 設計。

---

# 4. Onboarding / 前測 / 偏好設定

## 取得或建立 profile

```http
GET /api/users/:userId/profile
```

## 更新 profile

```http
PUT /api/users/:userId/profile
Content-Type: application/json
```

可更新：

```json
{
  "investmentHorizon": "MEDIUM",
  "riskTolerance": "MEDIUM",
  "researchStyle": "BALANCED",
  "hardConstraints": {
    "excludedIndustries": [],
    "maxDebtRatio": null,
    "minLiquidity": 100000000,
    "excludeDisposition": true
  },
  "softPreferences": {
    "growth": 0.3333,
    "profitability": 0.3333,
    "safety": 0.3334
  }
}
```

### Hard Constraints

只能由使用者修改：

- excludedIndustries
- maxDebtRatio
- minLiquidity
- excludeDisposition

**feedback 不會自動放寬 Hard Constraints。**

### Soft Preferences

目前三個可自動微調權重：

- growth
- profitability
- safety

## 重設 Soft Preference

```http
POST /api/users/:userId/profile/reset-soft
```

## 給 A Data Layer 的 screening profile

```http
GET /api/users/:userId/screening-profile
```

這個 endpoint 會輸出 A `taiwan-data screen --profile` 可使用的 profile shape。

---

# 5. 產生 Top-K

## Frontend 開發 / 已有 A output

Preferred endpoint：

```http
POST /api/research/screening-output
Content-Type: application/json
```

Repo 的真實 fixture：

```text
packages/taiwan_data/tests/fixtures/sample_screening_output.json
```

Request 請帶 userId：

```json
{
  "userId": "demo-user",
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

B 會：

1. validate A contract
2. preserve upstream Evidence / riskFlags
3. 套用目前 Soft Preferences
4. Agent research
5. verification / publication gate
6. 回 Top-K

Response：

```ts
{
  screeningRunId: string;
  dataVersion: string;
  sourceSnapshot: string | null;
  personalization?: {
    userId: string;
    softPreferences: {
      growth: number;
      profitability: number;
      safety: number;
    };
  };
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

主要 render：

```text
top[].result
```

---

# 6. Top-5 / ResearchResult UI

Card 建議：

- rank
- ticker / companyName
- keyReasons
- main risk
- freshness
- verification quality

不要把：

- score
- quantScore
- evidenceQuality

寫成「上漲機率」或「AI 信心」。

Research detail：

- thesis
- claims
- risks
- invalidationConditions
- verificationSummary
- sources
- researchTrace

---

# 7. Claim → Evidence

```ts
const sourcesForClaim = result.sources.filter((source) =>
  claim.sourceIds.includes(source.sourceId),
);
```

Evidence drawer 建議顯示：

- title
- publisher
- sourceType
- sourceTier
- publishedAt
- dataPeriod
- URL

Claim labels：

- SUPPORTED → 已驗證支持
- REFUTED → 證據反駁
- INSUFFICIENT → 證據不足
- CONFLICTING → 來源衝突

詳細的 A quantitative evidence 語意看：

```text
docs/data/candidate-evidence-contract.md
```

---

# 8. 收藏 / 略過 + 行為回饋

這是原始競賽 loop 的重要功能。

```http
POST /api/users/:userId/feedback
Content-Type: application/json
```

只需要把使用者剛看的：

```text
top[i].result.runId
```

送回去。

## 收藏範例

```json
{
  "runId": "research-run-id",
  "action": "SAVE",
  "reasons": ["GROWTH", "INDUSTRY_TREND"]
}
```

SAVE 可用原因：

- GROWTH
- FINANCIAL_STABILITY
- INDUSTRY_TREND
- ACCEPTABLE_RISK
- OTHER

## 略過範例

```json
{
  "runId": "research-run-id",
  "action": "SKIP",
  "reasons": ["HIGH_VOLATILITY"]
}
```

SKIP 可用原因：

- HIGH_VOLATILITY
- FINANCIAL_QUALITY
- UNFAMILIAR_INDUSTRY
- INSUFFICIENT_GROWTH
- VALUATION_CONCERN
- OTHER

Response 會包含：

```text
feedback
preferenceChange
profile
watchlistItem?   ← SAVE 時自動建立
```

### 重點

Feedback 只會對 soft weights 做**小幅 deterministic 調整**。

例如：

```text
SAVE because GROWTH
→ growth weight 小幅上升
→ 下一次同一份候選資料排序可能改變
```

Hard Constraints 不會改。

---

# 9. Preference History

```http
GET /api/users/:userId/preference-history
```

UI 建議顯示：

```text
Growth      33% → 36%
Profitability 33% → 32%
Safety      33% → 32%

原因：收藏某股票，理由為成長性
```

Feedback history：

```http
GET /api/users/:userId/feedback
```

這兩個頁面對應原始 MVP 的「個人偏好變更紀錄」。

---

# 10. SAVE 會建立 Watchlist + Thesis

如果 feedback action 是 SAVE，backend 會：

```text
既有 publishable ResearchResult
→ 建立 Investment Thesis v1
→ 加入 user watchlist
```

不會為了收藏再重跑一次同樣研究。

取得 watchlist：

```http
GET /api/users/:userId/watchlist
```

移除：

```http
DELETE /api/users/:userId/watchlist/:ticker
```

每個 watchlist item 會有：

- ticker
- companyName
- thesisId
- sourceResearchRunId
- candidate
- createdAt / updatedAt

---

# 11. Thesis Recheck

```http
POST /api/users/:userId/watchlist/:ticker/recheck
Content-Type: application/json
```

Body：

```json
{
  "candidate": { "...": "fresh CandidatePacket" },
  "eventType": "MONTHLY_REVENUE"
}
```

eventType：

- MONTHLY_REVENUE
- MATERIAL_DISCLOSURE
- NEWS
- MANUAL_RECHECK

Thesis state：

- ACTIVE
- STRENGTHENED
- UNCHANGED
- WEAKENED
- INVALIDATED

重要：如果新 research 因為「明確負面證據」而被 publication gate 拒絕，backend 仍會使用已驗證的負面 evidence 將舊 thesis 標成 WEAKENED / INVALIDATED；不會錯誤地把它當成「沒有變化」。

---

# 12. Notification Center

```http
GET /api/users/:userId/notifications
GET /api/users/:userId/notifications?unread=1
```

目前 notification type：

- DAILY_RESEARCH_READY
- THESIS_CHANGED
- EVIDENCE_CONFLICT

標記已讀：

```http
POST /api/users/:userId/notifications/:notificationId/read
```

---

# 13. Browser Notification 是 C 的責任

Backend 已負責：

```text
event detection
→ notification record
→ unread/read state
→ notification API
```

C 負責真正呼叫 Browser Notification API。

最小版本：

```ts
export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;

  if (Notification.permission === "granted") {
    return true;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function showRadarNotification(item: {
  notificationId: string;
  title: string;
  message: string;
}) {
  if (Notification.permission !== "granted") return;

  new Notification(item.title, {
    body: item.message,
    tag: item.notificationId,
  });
}
```

MVP 可以：

1. page load / interval poll unread notifications
2. 新 notification 顯示 Browser Notification
3. 成功顯示後呼叫 mark-read endpoint

不要把 model key 放進 Service Worker 或 frontend。

---

# 14. 主動送達 / Daily Research

Mock backend 已可 demo：

```http
POST /api/users/:userId/daily-research
```

它會：

```text
User Profile
→ screening
→ Top-K research
→ DAILY_RESEARCH_READY notification
```

同一個 Taipei local date 預設不重複跑成功任務。

Delivery history：

```http
GET /api/users/:userId/delivery-runs
```

---

# 15. Real 自動排程

Real B 可以自行啟動 Data Layer screening。

先安裝：

```bash
python -m pip install -e "packages/taiwan_data"
```

`.env`：

```env
TAIWAN_DATA_DB=/path/to/taiwan-data.sqlite
TAIWAN_DATA_CLI=taiwan-data

ENABLE_DAILY_SCHEDULER=true
DAILY_RESEARCH_AFTER_HOUR=17
DAILY_SCHEDULER_INTERVAL_MS=3600000
```

Real server：

```bash
npm run api
```

Backend 會用兩個 Data CLI path：

```text
taiwan-data screen   → 每日 discovery / Top-K
taiwan-data inspect  → 已收藏單股的 fresh Candidate + Evidence snapshot
```

`inspect` 會忽略 discovery hard constraints，因為已收藏股票即使不再符合新的篩選條件，也仍應被持續監控；它仍要求基礎資料可驗證。

Scheduler：

- timezone = Asia/Taipei
- Mon–Fri
- 17:00 後檢查
- 本機 17:00 關閉、18:00 才開 → 會 catch up missed run
- 已成功執行同日不重複
- 如果最新 `priceAsOf` 不是今天，不會假裝成「今日研究」
- 會保持 WAITING_FOR_FRESH_DATA，下一輪再檢查

這避免舊資料被標成今日結果。

---

# 16. Loading / timeout

Real research 是同步 MVP API。

單次可能：

```text
數十秒 ～ 約 3 分鐘
```

C：

- 不要用 10s / 30s timeout
- 顯示 researching
- 不做假的百分比 progress
- 目前沒有 SSE/WebSocket

必要 state：

1. idle
2. researching
3. success
4. rejected / insufficient
5. network / HTTP error

---

# 17. REJECTED 不是系統錯誤

```ts
result.status === "REJECTED"
```

代表 Agent 主動拒絕發布研究結論。

可能原因：

- INSUFFICIENT_EVIDENCE
- UNRESOLVED_CONFLICT
- NO_RISK_IDENTIFIED
- BUDGET_EXHAUSTED
- SOURCE_FAILURE

UI：

```text
目前證據不足，暫不形成研究結論
```

而不是「系統壞掉」。

---

# 18. Risk Flags

A 可能提供：

```text
notice
disposition
```

必須顯示。

B publication gate 已保證：

> upstream risk flag 沒有被 grounded risk evidence 明確處理時，不可 PUBLISHABLE。

Risk item 可能有：

```ts
risk.addressesRiskFlags
```

---

# 19. CORS

預設：

```env
CORS_ORIGIN=http://localhost:5173
```

如果 frontend 是 3000：

```powershell
$env:CORS_ORIGIN="http://localhost:3000"
npm run api:mock
```

Real 同理。

Backend 預設 bind `127.0.0.1`，所以目前適合同一台電腦 demo。

---

# 20. C 不需要做的事

不要在 frontend：

- call Gemini/OpenAI
- 保存 model key
- 重算 screening metrics
- verify claims
- 決定 source tier
- 做 publication gate
- 判斷 thesis status
- parse Gemini grounding metadata
- 顯示 hidden chain-of-thought

`researchTrace` 是可顯示的 structured operational trace，不是 chain-of-thought。

---

# 21. 錯誤處理

常見：

- 400 INVALID_SCREENING_OUTPUT
- 400 SCREENING_ADAPTER_ERROR
- 400 INVALID_CANDIDATE_PACKET
- 400 INVALID_FEEDBACK
- 400 INVALID_USER_PROFILE
- 404 RESEARCH_RUN_NOT_FOUND
- 404 WATCHLIST_ITEM_NOT_FOUND
- 404 THESIS_NOT_FOUND
- 404 NOTIFICATION_NOT_FOUND
- 413 REQUEST_BODY_TOO_LARGE
- 500 INTERNAL_ERROR

遇到 contract error 不要先在 C workaround；先對照：

- `docs/INTEGRATION.md`
- `docs/data/candidate-evidence-contract.md`
- `src/api/contracts.ts`

---

# 22. 建議 C 開發順序

## C0 — 可以立刻做

用 `npm run api:mock`：

- onboarding/profile
- Top 5
- research detail
- evidence drawer
- risk/riskFlags
- loading/rejected/error

## C1 — 原始競賽 loop

- Save / Skip reasons
- preference delta UI
- watchlist
- thesis history
- notification center
- Browser Notification

## C2 — real integration

- mock → `npm run api`
- 真實 screening-output
- 一次 real Gemini research
- 一次 Thesis Changed notification demo

---

# 23. C 完成定義

- [ ] GET /health
- [ ] GET/PUT user profile
- [ ] POST screening-output with userId
- [ ] Top-K cards render
- [ ] ResearchResult detail render
- [ ] claim → sourceIds → sources render
- [ ] SAVE / SKIP reasons 可送
- [ ] preference change 顯示
- [ ] 同一 fixture 回饋前後 ranking 可觀察差異
- [ ] SAVE 後 watchlist 有項目
- [ ] Thesis history render
- [ ] notification center render
- [ ] Browser Notification 至少 demo 一次
- [ ] REJECTED 不當 HTTP error
- [ ] notice / disposition 顯示
- [ ] loading 可撐長 request
- [ ] backend URL 來自 env
- [ ] frontend 無 model key
- [ ] mock → real 不需改 response parsing

---

# 24. Admin / 執行狀態頁

原始 MVP 的管理員頁面可以直接接：

```http
GET  /api/admin/status
POST /api/admin/model-check
GET  /api/admin/data-status
```

用途：

- 顯示目前 LLM / Search provider 與 model 名稱
- 只顯示「credential 是否已配置」，**絕不回傳 key**
- 手動測試 model API 是否連線
- 顯示 Data Layer table / dataset refresh status
- 顯示 scheduler 是否啟用與最近 delivery run

Mock backend 也有相同 endpoint，方便 C 先完成畫面。

---

# 25. 其他文件

先看本文件。

深入規格：

- `docs/INTEGRATION.md`
- `docs/data/candidate-evidence-contract.md`
- `src/api/contracts.ts`
- `packages/taiwan_data/tests/fixtures/sample_screening_output.json`
- `docs/B_AGENT_MVP.md`
