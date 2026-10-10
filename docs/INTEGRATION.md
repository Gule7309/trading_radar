# Integration Guide

## Current boundary

The repository now has a concrete A -> B contract from Data PR #5:

```text
screening-output-v1
  candidates[]
  evidence[]
  riskFlags
  dataVersion / sourceSnapshot
        ↓
B screening adapter
        ↓
CandidatePacket + upstreamEvidence
        ↓
dynamic research / verification / thesis
        ↓
ResearchResult / Top-K
        ↓
C frontend
```

B preserves A's quantitative evidence lineage instead of throwing it away and re-fetching the same facts.

## Start B

### Frontend / contract development without model credentials

```bash
npm install
npm run api:mock
```

No Gemini/OpenAI key is required.

### Real current runtime

```bash
npm run api
```

Default:

```text
http://127.0.0.1:8787
```

Environment:

```env
GEMINI_API_KEY=...
LLM_PROVIDER=gemini
SEARCH_PROVIDER=gemini-google-search
PORT=8787
CORS_ORIGIN=http://localhost:5173
SQLITE_PATH=trading-radar.sqlite
```

Provider credentials stay on the backend. C should never call Gemini/OpenAI directly.

## A screening output -> B research (preferred integration)

```http
POST /api/research/screening-output
Content-Type: application/json
```

Request:

```json
{
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
    "concurrency": 2,
    "rankingWeights": {
      "quant": 0.6,
      "evidence": 0.4
    }
  }
}
```

B validates the Data Layer v1 contract, adapts the candidates internally, and returns:

```json
{
  "screeningRunId": "20261010-001",
  "dataVersion": "ds-...",
  "sourceSnapshot": "sha256:...",
  "researched": 10,
  "rejectedOrSkipped": [],
  "top": []
}
```

Important adapter behavior:

- A percentile is 0–1; B's existing signal field is normalized to 0–100.
- A `riskFlags` are preserved.
- verified A Evidence is preserved as `upstreamEvidence`.
- A's official evidence becomes Tier-1 B source material.
- B does not repeat the same monthly-revenue lookup when A already supplied verified monthly-revenue evidence.
- non-verified A evidence is rejected by the adapter rather than silently trusted.

## Internal CandidatePacket

Direct single-candidate / custom integrations may still use `CandidatePacket`:

```json
{
  "candidateId": "20261010-001:2330",
  "ticker": "2330",
  "companyName": "台積電",
  "market": "TWSE",
  "industry": "半導體業",
  "asOf": "2026-10-10",
  "quantScore": 0.91,
  "quantSignals": [
    {
      "metric": "revenue_yoy",
      "value": 53.32,
      "period": "2026-08",
      "industryPercentile": 95
    }
  ],
  "hardConstraintsPassed": true,
  "riskFlags": ["notice"],
  "upstreamEvidence": []
}
```

A owns screening hard constraints. B never auto-relaxes them.

## Single candidate research

```http
POST /api/research/runs
Content-Type: application/json
```

Body = one `CandidatePacket`.

## Batch CandidatePacket research

```http
POST /api/research/batch
Content-Type: application/json
```

For new A integrations, prefer `/api/research/screening-output` so Evidence lineage is not lost.

## Research history

```http
GET /api/research/runs/:runId
GET /api/research/tickers/:ticker/runs?limit=20
```

## Thesis creation

```http
POST /api/theses
Content-Type: application/json
```

```json
{
  "candidate": {},
  "thesisId": "optional-client-id"
}
```

A thesis is created only from a publishable research result.

## Thesis recheck

```http
POST /api/theses/:thesisId/recheck
Content-Type: application/json
```

```json
{
  "candidate": {},
  "eventType": "MONTHLY_REVENUE"
}
```

Supported event types:

- `MONTHLY_REVENUE`
- `MATERIAL_DISCLOSURE`
- `NEWS`
- `MANUAL_RECHECK`

## Thesis history

```http
GET /api/theses/:thesisId
GET /api/theses/:thesisId/versions
GET /api/theses/:thesisId/events
```

## B -> C ResearchResult mapping

Recommended C fields:

- `status`: PUBLISHABLE / REJECTED / PARTIAL
- `decision`: KEEP / REJECT
- `thesis`
- `keyReasons`
- `claims[].status`
- `claims[].category`
- `claims[].importance`
- `claims[].sourceIds`
- `risks`
- `invalidationConditions`
- `sources`
- `verificationSummary.coreClaimCoverage`
- `verificationSummary.primarySourceRatio`
- `verificationSummary.unresolvedConflicts`
- `verificationSummary.freshness`
- `researchTrace`
- `stopReason`

Development-only:

- `metrics.llmCalls`
- `metrics.inputTokens`
- `metrics.outputTokens`
- `metrics.llmLatencyMs`
- `metrics.totalLatencyMs`
- `metrics.estimatedCostUsd`

Do not render metrics or internal ranking scores as a probability that the stock will rise.

## Source UI

For each claim/risk, C maps `sourceIds` into `sources` and may display:

- title
- publisher
- source type
- published date
- data period
- source tier
- URL

Tier-3 search snippets should not appear as verified evidence cards.

## Trace UI

`researchTrace` can power an expandable operational timeline.

Do not display hidden chain-of-thought. Only structured action summaries/reason codes are stored.

## Frontend timing

C can start immediately using `npm run api:mock`.

See `docs/FRONTEND_HANDOFF.md`.

## Provider migration

The provider boundary is:

```text
LlmProvider -> controller/extractor/verifier/skeptic/thesis
SearchProvider -> discovery
```

Gemini is the current development runtime. Later OpenAI migration is an adapter/configuration change, not an A/B/C contract rewrite.
