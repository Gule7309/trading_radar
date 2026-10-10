# Integration Guide

## A -> B

B accepts `CandidatePacket` objects from A.

Example:

```json
{
  "candidateId": "a-2330-2026-10-10",
  "ticker": "2330",
  "companyName": "台積電",
  "market": "TWSE",
  "industry": "半導體業",
  "asOf": "2026-10-10",
  "quantScore": 0.91,
  "quantSignals": [
    {
      "metric": "revenue_yoy",
      "value": 0.5332,
      "period": "2026-08",
      "industryPercentile": 95
    }
  ],
  "hardConstraintsPassed": true
}
```

A owns hard constraints. B never auto-relaxes them.

## Start B

```bash
npm install
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

## Single candidate research

```http
POST /api/research/runs
Content-Type: application/json
```

Body = one `CandidatePacket`.

This MVP endpoint is synchronous. C should show a loading/researching state while it runs.

## Batch candidates -> Top 5

```http
POST /api/research/batch
Content-Type: application/json
```

Example:

```json
{
  "candidates": [],
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

For a full A candidate pass, set `researchLimit` up to 30. The smaller default is a hackathon cost/latency tradeoff.

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

Do not render metrics or the internal ranking score as a probability that the stock will rise.

## Source UI

For each claim/risk, C can map `sourceIds` into `sources` and display:

- title
- publisher
- source type
- published date
- data period
- source tier
- URL

Tier-3 search snippets should not appear as verified evidence cards.

## Trace UI

`researchTrace` can power an expandable timeline such as:

```text
1 Official revenue search
2 Web discovery
3 Fetch source
4 Verify claims
5 Skeptic (conditional)
6 Publication gate
```

Do not display hidden chain-of-thought. Only structured action summaries/reason codes are stored.

## Provider migration

The provider boundary is:

```text
LlmProvider -> controller/extractor/verifier/skeptic/thesis
SearchProvider -> discovery
```

Gemini is the current development runtime. Later OpenAI migration should be an adapter/configuration change rather than a rewrite of A/B/C contracts.
