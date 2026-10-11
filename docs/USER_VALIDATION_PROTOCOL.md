# User Validation Protocol

This protocol implements the original MVP requirement for **3–5 target users** and a before/after research comparison.

> Do not invent results. Fill the result tables only after real sessions.

## Target participants

Recruit 3–5 people who:

- independently research Taiwan stocks;
- have used TWSE / TPEx / MOPS, financial sites, or market news;
- are not complete investing beginners;
- are not required to be professional investors.

Do not collect brokerage credentials, portfolio balances, account identifiers, or other unnecessary sensitive information.

## Phase 1 — interview

Ask the same core questions:

1. How do you currently discover stocks worth researching?
2. Which sites/sources do you normally use?
3. How long does one research session usually take?
4. Which information is easiest to miss?
5. How do you decide whether to save/watch a stock?
6. What events make you re-evaluate a stock?
7. How do you track why you originally liked a stock?
8. Would you accept an AI saying “insufficient evidence” instead of giving an answer?
9. Which alerts would be useful vs annoying?
10. After seeing Trading Radar, which feature is most useful and why?

Record only anonymized participant IDs: P1…P5.

## Phase 2 — timed task

Use one comparable research task per participant.

### Condition A — current workflow

Participant uses their normal tools.

Task example:

> “Research this Taiwan-listed company and decide whether it is worth adding to a watchlist. State the main reason, one important downside risk, and show the original evidence.”

### Condition B — Trading Radar

Participant completes the same type of task using the prototype.

Counterbalance the stock/order when possible so the second condition does not simply repeat the first answer.

## Measurements

### Research Time

Seconds from task start until participant states a final watch / skip decision.

### Source Traceability

Can the participant reach the original source supporting the main claim?

Score:

- 1 = yes
- 0 = no

### Risk Identification

Before the session, prepare one or more material risk facts from the evaluation fixture/source set.

Score:

- 1 = participant/system surfaces at least one predefined material risk
- 0 = misses all predefined material risks

### Citation Correctness

For each important displayed claim:

```text
correct citations / evaluated citations
```

A citation is correct only if the cited source actually supports the claim, entity, and relevant period.

### Task Success

A task succeeds when:

- a final decision state is reached;
- at least one reason is provided;
- at least one downside risk is provided;
- the supporting source can be inspected;
- unsupported core claims are not presented as verified.

### Latency

Use backend `metrics.totalLatencyMs` for Agent execution.

### Cost

Use provider token usage / configured price calculation when available. If exact provider cost is unavailable, report token counts and explain how the estimate was calculated. Do not fabricate cost.

### Failure Types

Categorize:

- SOURCE_FAILURE
- INSUFFICIENT_EVIDENCE
- UNRESOLVED_CONFLICT
- WRONG_ENTITY
- STALE_EVIDENCE
- BUDGET_EXHAUSTED
- MODEL/SCHEMA_FAILURE
- UI/NETWORK_FAILURE
- other

## Session result template

| Participant | Condition | Research time (s) | Traceability | Risk found | Citation correct / checked | Task success | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| P1 | Current workflow |  |  |  |  |  |  |
| P1 | Trading Radar |  |  |  |  |  |  |
| P2 | Current workflow |  |  |  |  |  |  |
| P2 | Trading Radar |  |  |  |  |  |  |

## Product feedback after the task

Ask:

- Which screen/feature saved the most time?
- Did Evidence make the recommendation more trustworthy?
- Was “REJECTED / insufficient evidence” understandable?
- Was the main risk visible enough?
- Was the SAVE / SKIP reason interaction natural?
- Was the preference change understandable?
- Would Thesis Changed notifications be useful?
- What would make you stop using the product?

## Reporting rules

With 3–5 users:

- report raw counts and per-user results;
- median may be reported, but keep the raw sample visible;
- do not claim population-level statistical significance;
- do not say the product improves returns;
- separate user-perceived usefulness from factual/citation metrics.

## Evidence to keep for prelim submission

Keep anonymized:

- interview notes;
- screenshots of prototype tasks;
- timing sheet;
- citation-check sheet;
- failure log;
- participant quotes with permission.

The proposal should map:

```text
Observed pain point
→ interview evidence
→ product requirement
→ implemented feature
→ measured prototype result
```
