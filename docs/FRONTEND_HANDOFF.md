# Frontend (C) Handoff

## When C should start

**Start now.**

C does not need to wait for:

- the OpenAI migration;
- a live Gemini E01–E10 report;
- the B draft PR to be merged;
- a Gemini/OpenAI API key.

The B API contract is stable enough for MVP UI work, and a credential-free mock server is available.

Current repository observation (2026-10-10): there is no frontend branch / frontend PR in this repository yet.

## Development modes

### Mode 1 — UI development now (recommended)

Use the B mock server.

```bash
git checkout feat/b-agent-mvp
git pull
npm install
npm run api:mock
```

Default API base:

```text
http://127.0.0.1:8787
```

No Gemini/OpenAI key is needed.

All mock research text is explicitly prefixed with `[MOCK]`.

### Mode 2 — real Gemini-backed B

When C wants to verify real integration:

```bash
npm run api
```

with:

```env
GEMINI_API_KEY=...
LLM_PROVIDER=gemini
SEARCH_PROVIDER=gemini-google-search
```

C should not receive or store model-provider API keys. Keys stay in the B/backend process.

### Mode 3 — later OpenAI-backed B

C should not need code changes.

Only B's provider configuration / adapter changes. The HTTP contract remains the same.

## A -> B -> C path

After PR #5, A produces `screening-output-v1`.

B now accepts it directly:

```http
POST /api/research/screening-output
Content-Type: application/json
```

Request:

```json
{
  "screeningOutput": { "...": "the exact screening-output-v1 document from A" },
  "options": {
    "topK": 5,
    "researchLimit": 10,
    "concurrency": 2
  }
}
```

B performs the A -> B adapter internally:

```text
screening-output-v1
  Candidate + verified quantitative Evidence + riskFlags
        ↓
B CandidatePacket + upstream evidence lineage
        ↓
reuse A's verified quantitative facts
        ↓
dynamic research only where needed
  - material disclosures
  - news/current context
  - risks
  - contradictions
  - forward outlook
        ↓
verification / publication gate / thesis
        ↓
Top-K response for C
```

B intentionally avoids repeating the same monthly-revenue lookup when verified A evidence is already available.

## Response C should use

The screening endpoint returns:

```json
{
  "screeningRunId": "20261010-001",
  "dataVersion": "ds-...",
  "sourceSnapshot": "sha256:...",
  "researched": 10,
  "rejectedOrSkipped": [],
  "top": [
    {
      "rank": 1,
      "candidateId": "...",
      "ticker": "2330",
      "score": 0.91,
      "quantScore": 0.90,
      "evidenceQuality": 0.93,
      "result": {}
    }
  ]
}
```

For the product UI, the most important payload is `top[].result`.

## ResearchResult -> UI mapping

### Candidate card

Use:

- `ticker`
- `companyName`
- `status`
- `decision`
- `keyReasons`
- `risks`
- `risks[].addressesRiskFlags` when A supplied `notice` / `disposition`
- `verificationSummary.freshness`

Do not present `score`, `quantScore`, or `evidenceQuality` as a probability that price will rise.

### Research detail

Use:

- `thesis`
- `claims`
- `risks`
- `invalidationConditions`
- `sources`
- `verificationSummary`

For each claim:

```text
claim.sourceIds
  ↓
find matching ResearchResult.sources[]
  ↓
Evidence / source drawer
```

Recommended source card fields:

- title
- publisher
- sourceType
- publishedAt / dataPeriod
- sourceTier
- URL

### Verification status

Useful labels:

- `SUPPORTED` -> 已驗證支持
- `REFUTED` -> 證據反駁
- `INSUFFICIENT` -> 證據不足
- `CONFLICTING` -> 來源衝突

Do not hide rejected results. A rejection such as `INSUFFICIENT_EVIDENCE` is a valid trustworthy-agent outcome.

If A supplied a `notice` or `disposition` flag, B's publication gate will not publish until a grounded risk explicitly marks that flag as addressed.

### Research timeline

`researchTrace` is safe structured operational trace:

```text
SEARCH_OFFICIAL
SEARCH_NEWS
FETCH_SOURCE
VERIFY
RUN_SKEPTIC
FINALIZE
```

It is not hidden chain-of-thought.

Keep it collapsed by default and expose it as "Research process" / "研究紀錄".

### Development metrics

The following are for developers/evaluation, not normal investors:

- `metrics.llmCalls`
- `metrics.inputTokens`
- `metrics.outputTokens`
- `metrics.llmLatencyMs`
- `metrics.totalLatencyMs`
- `metrics.estimatedCostUsd`

## Saved stock / thesis UI

Create saved thesis:

```http
POST /api/theses
```

Recheck:

```http
POST /api/theses/:thesisId/recheck
```

History:

```http
GET /api/theses/:thesisId
GET /api/theses/:thesisId/versions
GET /api/theses/:thesisId/events
```

Suggested labels:

- `ACTIVE` -> 追蹤中
- `STRENGTHENED` -> 論點增強
- `UNCHANGED` -> 無重大改變
- `WEAKENED` -> 論點轉弱
- `INVALIDATED` -> 核心論點失效

## Minimal frontend fetch example

```ts
const API_BASE = "http://127.0.0.1:8787";

const response = await fetch(`${API_BASE}/api/research/screening-output`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    screeningOutput,
    options: {
      topK: 5,
      researchLimit: 10,
      concurrency: 2,
    },
  }),
});

if (!response.ok) {
  throw new Error(`B API failed: ${response.status}`);
}

const data = await response.json();
```

## UI states C should implement

At minimum:

1. `idle`
2. `researching`
3. `success`
4. `rejected / insufficient evidence`
5. `error`

The live synchronous MVP can take tens of seconds to a few minutes. Do not assume an instant response.

For the hackathon MVP, use a progress/loading state rather than inventing fake intermediate completion percentages.

## What C does NOT need to implement

C should not:

- call Gemini/OpenAI directly;
- parse Google Search grounding metadata;
- re-verify claims;
- decide source tiers;
- compute the publication gate;
- calculate thesis state changes;
- expose provider keys;
- display hidden reasoning.

Those remain B responsibilities.

## Recommended C development order

### C0 — start immediately

Against `npm run api:mock`:

- Top-5 list
- research detail page
- evidence/source drawer
- rejected/insufficient state
- loading/error state

### C1 — after basic UI works

- saved thesis
- version history / event timeline
- research trace accordion

### C2 — real integration checkpoint

Switch the same UI to `npm run api` and run one real screening-output request.

No UI contract migration should be required.

## Current blocker for real end-to-end sign-off

Only runtime validation remains:

- latest live Gemini run after A-evidence ingestion;
- repeated semantic E01–E10 live evaluation;
- one C-side real API consumption check.

C does not need to wait for these to start UI development.
