# Integration Guide

## Product loop

The current MVP contract follows the original competition flow:

```text
User Profile
→ A screening-output-v1
→ B evidence-grounded research
→ Top-K
→ SAVE / SKIP feedback
→ bounded Soft Preference update
→ next ranking
→ SAVE creates Watchlist + Thesis
→ recheck
→ Thesis Changed / Evidence Conflict notification
```

Hard constraints are never changed by behavior feedback.

## Start B

Mock / C development:

```bash
npm install
npm run api:mock
```

Real current model runtime:

```bash
npm run api
```

Default:

```text
http://127.0.0.1:8787
```

Keys remain backend-only.

## User profile

```http
GET /api/users/:userId/profile
PUT /api/users/:userId/profile
POST /api/users/:userId/profile/reset-soft
GET /api/users/:userId/screening-profile
```

Hard constraints:

- excludedIndustries
- maxDebtRatio
- minLiquidity
- excludeDisposition

Soft preferences:

- growth
- profitability
- safety

## A -> B research

Preferred:

```http
POST /api/research/screening-output
```

Request:

```json
{
  "userId": "demo-user",
  "screeningOutput": {
    "schemaVersion": "screening-output-v1",
    "run": {},
    "candidates": [],
    "evidence": [],
    "excluded": {}
  },
  "options": {
    "topK": 5,
    "researchLimit": 10,
    "concurrency": 2
  }
}
```

B preserves A Evidence lineage and, when userId is supplied, applies current soft preferences before B batch research.

A percentile is 0–1; B's CandidatePacket signal percentile is normalized to 0–100.

## Feedback

```http
POST /api/users/:userId/feedback
```

SAVE:

```json
{
  "runId": "research-run-id",
  "action": "SAVE",
  "reasons": ["GROWTH"]
}
```

SKIP:

```json
{
  "runId": "research-run-id",
  "action": "SKIP",
  "reasons": ["HIGH_VOLATILITY"]
}
```

Feedback changes only bounded soft weights.

SAVE automatically creates a watchlist item + Thesis from the already completed publishable ResearchResult; it does not repeat the same research.

History:

```http
GET /api/users/:userId/feedback
GET /api/users/:userId/preference-history
```

## Watchlist / Thesis

```http
GET /api/users/:userId/watchlist
DELETE /api/users/:userId/watchlist/:ticker
POST /api/users/:userId/watchlist/:ticker/recheck
```

Recheck body:

```json
{
  "candidate": {},
  "eventType": "MONTHLY_REVENUE"
}
```

Thesis status:

- ACTIVE
- STRENGTHENED
- UNCHANGED
- WEAKENED
- INVALIDATED

A rejected recheck does not automatically mean unchanged: verified negative evidence against a previous core claim can still weaken or invalidate the saved Thesis.

## Notifications

```http
GET /api/users/:userId/notifications
GET /api/users/:userId/notifications?unread=1
POST /api/users/:userId/notifications/:notificationId/read
```

Types:

- DAILY_RESEARCH_READY
- THESIS_CHANGED
- EVIDENCE_CONFLICT

Backend owns event detection + persistence. C owns Browser Notification presentation.

## Proactive daily research

Manual/demo trigger:

```http
POST /api/users/:userId/daily-research
```

History:

```http
GET /api/users/:userId/delivery-runs
```

Real automatic mode:

```env
TAIWAN_DATA_DB=/path/to/data.sqlite
TAIWAN_DATA_CLI=taiwan-data
ENABLE_DAILY_SCHEDULER=true
DAILY_RESEARCH_AFTER_HOUR=17
DAILY_SCHEDULER_INTERVAL_MS=3600000
```

Install Data CLI first:

```bash
python -m pip install -e "packages/taiwan_data"
```

Scheduler behavior:

- Asia/Taipei
- Mon–Fri
- after configured hour
- startup after missed run catches up
- one successful run per user/local date
- `taiwan-data screen` builds personalized discovery candidates
- `taiwan-data inspect` builds fresh single-stock Evidence for saved watchlist theses
- saved stocks remain monitored even if current discovery hard constraints would exclude them
- if latest priceAsOf is stale, no "today research ready" notification is sent

## Existing research APIs

```http
POST /api/research/runs
POST /api/research/batch
GET /api/research/runs/:runId
GET /api/research/tickers/:ticker/runs?limit=20
```

Existing thesis APIs remain available:

```http
POST /api/theses
POST /api/theses/:thesisId/recheck
GET /api/theses/:thesisId
GET /api/theses/:thesisId/versions
GET /api/theses/:thesisId/events
```

## Admin / runtime health

```http
GET  /api/admin/status
POST /api/admin/model-check
GET  /api/admin/data-status
```

These endpoints expose safe configuration/status only. They never return model credentials or API keys.

## C contract

Shared TypeScript types:

```text
src/api/contracts.ts
```

C should render ResearchResult, not recreate B policy.

Do not present quantScore / evidenceQuality / internal score as price-up probability.

See:

- `docs/C_FRONTEND_HANDOFF.md`
- `docs/data/candidate-evidence-contract.md`
