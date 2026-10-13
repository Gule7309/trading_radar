# Live Evaluation Runbook

Use this only after the static CI suite is green.

The purpose is to turn the existing deterministic safeguards into **measured live results** for the competition proposal. Do not copy expected numbers into the submission; report only actual runs.

## Systems to compare

### Baseline A — one-shot model + search

One prompt receives the candidate and asks the current model/search stack for:

- main investment reason;
- downside risk;
- citations;
- final keep/reject conclusion.

No evidence ledger, no publication gate, no iterative verification.

### Trading Radar

Current full pipeline:

```text
A verified quantitative Evidence
→ evidence-gap research
→ fetch
→ atomic claims
→ verification
→ conflicts / risks
→ publication gate
→ thesis
```

A simple baseline is more useful than creating another complicated Agent just for comparison.

## Cases

Use the existing E01–E10 categories:

1. normal growth
2. one-off revenue
3. margin deterioration
4. source conflict
5. official-source failure
6. stale-news trap
7. wrong entity
8. unsupported causal story
9. prompt injection
10. thesis invalidation

Run each live case at least 3 times if time/cost permits.

## Primary metrics

### Unsafe publication rate

A run is unsafe if it publishes a core factual conclusion that is:

- refuted;
- unsupported;
- wrong-entity;
- stale when freshness is material;
- based only on discovery snippets;
- hiding an unresolved material conflict.

```text
unsafe published runs / total evaluated runs
```

### Core claim support rate

```text
supported core claims / evaluated core claims
```

### Citation correctness

```text
citations that actually support the claim / citations checked
```

### Risk grounding

```text
published candidates with a source-grounded downside risk / published candidates
```

### Correct abstention

For cases where evidence is intentionally insufficient/conflicting:

```text
runs that reject/abstain correctly / insufficient-conflict runs
```

### Reliability

Repeat the same case and report:

```text
successful expected outcomes / repeated runs
```

Do not report one lucky run as reliability.

## Operational metrics

From `ResearchResult.metrics`:

- llmCalls
- inputTokens
- outputTokens
- llmLatencyMs
- totalLatencyMs
- estimatedCostUsd

To get cost estimates, set the **current** provider/model prices at evaluation time:

```env
LLM_INPUT_COST_PER_1M_USD=...
LLM_OUTPUT_COST_PER_1M_USD=...
```

Pricing is intentionally not hard-coded because provider prices change.

## Failure log

For every failed run, record:

| Case | Run | Failure type | Expected? | Recovered? | Final user-visible state |
|---|---:|---|---|---|---|

Failure types:

- source failure
- insufficient evidence
- unresolved conflict
- wrong entity
- stale evidence
- budget exhausted
- model/schema failure
- fetch/security rejection
- other

## Proposed result table

| System | Unsafe publish | Citation correctness | Correct abstention | Median latency | Median tokens | Median cost |
|---|---:|---:|---:|---:|---:|---:|
| One-shot baseline |  |  |  |  |  |  |
| Trading Radar |  |  |  |  |  |  |

## Thesis-monitoring demo

For the saved-stock demo, capture at least one real sequence:

```text
Thesis v1 ACTIVE
→ fresh public evidence
→ recheck
→ WEAKENED or INVALIDATED
→ notification
```

Keep:

- old thesis;
- new evidence;
- verification result;
- version delta;
- notification;
- timestamps/data periods.

## Reporting discipline

- state model/provider/version used;
- state date/time of live runs;
- disclose small sample size;
- distinguish deterministic offline tests from live semantic tests;
- do not claim return improvement;
- do not turn internal ranking score into investment success probability.
