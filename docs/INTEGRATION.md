# Integration Guide

## A -> B

B accepts a `CandidatePacket` from the quant/screener layer.

Example:

```json
{
  "candidateId": "a-2330-2026-10-09",
  "ticker": "2330",
  "companyName": "台積電",
  "market": "TWSE",
  "industry": "半導體業",
  "asOf": "2026-10-09",
  "quantScore": 0.91,
  "quantSignals": [
    {
      "metric": "revenue_yoy",
      "value": 53.32,
      "period": "2026-08",
      "industryPercentile": 95
    }
  ],
  "hardConstraintsPassed": true
}
```

Hard constraints must already be satisfied by A. B never auto-relaxes them.

## B -> C

Start the local B service:

```bash
npm run api
```

Default address:

```text
http://127.0.0.1:8787
```

### Health

```http
GET /health
```

### Run research

```http
POST /api/research/runs
Content-Type: application/json
```

Body: `CandidatePacket`.

The MVP endpoint is synchronous: it returns a completed `ResearchResult`.
C should display a loading state while the run is executing.

### Read one stored run

```http
GET /api/research/runs/:runId
```

### Research history by ticker

```http
GET /api/research/tickers/:ticker/runs?limit=20
```

## ResearchResult UI fields

Recommended C mapping:

- `status`: PUBLISHABLE / REJECTED / PARTIAL
- `decision`: KEEP / REJECT
- `thesis`: compiled thesis only when publishable
- `keyReasons`: compact reason cards
- `claims`: claim + verification state + source ids
- `risks`: grounded risk cards
- `invalidationConditions`: thesis monitoring conditions
- `sources`: source drawer / citations
- `verificationSummary`: evidence quality summary
- `researchTrace`: optional expandable agent timeline
- `metrics`: latency / token telemetry for development and evaluation
- `stopReason`: explicit failure / rejection explanation

Do not display `metrics` as a stock confidence score.

## Provider strategy

The runtime is provider-neutral:

```text
LlmProvider -> Controller / Extractor / Verifier / Skeptic / Thesis
SearchProvider -> discovery
```

Current development configuration:

```env
LLM_PROVIDER=gemini
SEARCH_PROVIDER=gemini-google-search
```

A later OpenAI migration should add an OpenAI `LlmProvider` adapter and change
configuration, without modifying the harness, evidence ledger, publication gate,
or A/B/C contracts.
