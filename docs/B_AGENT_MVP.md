# B Module — Agent / Evidence MVP

## 1. Goal

B turns Data Layer `screening-output-v1` (or an internal `CandidatePacket`) into evidence-grounded stock research that C can render and monitor.

The MVP is not a price predictor and does not auto-trade. It is an evidence-seeking research system with explicit stop conditions, verification, risks, and thesis invalidation rules.

Core product rule:

> LLMs interpret text; deterministic code enforces policy.

## 2. Current architecture

```text
A screening-output-v1
  Candidate + verified quantitative Evidence + riskFlags
      ↓
ScreeningOutput adapter
      ↓
CandidatePacket + upstream evidence lineage
      ↓
BatchResearchService (optional 20–30 candidate entry)
      ↓
ResearchService
      ↓
Research Harness / Controller
      ↓
typed ResearchAction
      ├── SEARCH_OFFICIAL
      ├── SEARCH_NEWS
      ├── FETCH_SOURCE
      ├── VERIFY
      ├── RUN_SKEPTIC
      ├── FINALIZE
      └── REJECT
      ↓
Tool Router + bounded retry
      ├── TWSE / TPEx monthly revenue
      ├── material disclosures
      ├── Google Search grounding (discovery-only)
      └── guarded direct-page fetch
      ↓
Source eligibility
      ├── entity match
      ├── freshness
      └── source tier
      ↓
Verification Pipeline
      ├── deterministic quant-signal verifier
      ├── atomic claim extractor
      ├── isolated textual verifier
      ├── conflict detector
      └── risk extractor
      ↓
Publication Gate
      ↓
ResearchResult
      ↓
Top-K evidence-aware ranking
      ↓
C UI / Thesis tracker
```

Saved stock flow:

```text
ResearchResult
  ↓
Thesis v1
  ↓
new monthly revenue / disclosure / manual recheck
  ↓
new ResearchResult
  ↓
ACTIVE / STRENGTHENED / UNCHANGED / WEAKENED / INVALIDATED
  ↓
Thesis v2 + event history
```

## 3. Provider strategy

The core system is provider-neutral.

```text
LlmProvider
  → Controller
  → Claim Extraction
  → Verifier
  → Risk Extraction
  → Skeptic
  → Thesis Compiler

SearchProvider
  → dynamic web discovery
```

Current development runtime:

```env
LLM_PROVIDER=gemini
SEARCH_PROVIDER=gemini-google-search
GEMINI_MODEL=gemini-3.8-flash
GEMINI_SEARCH_MODEL=gemini-3.8-flash
```

Gemini is temporary for current development because credentials are available. A later OpenAI migration should add an OpenAI `LlmProvider` adapter and change configuration; the harness, evidence ledger, publication gate, storage, and A/B/C contracts should not change.

## 4. Source model

### Tier 1 — primary / official

- TWSE
- TPEx
- MOPS-compatible disclosure feeds
- company IR when added

Financial core claims require Tier-1 support.

### Tier 2 — directly fetched secondary source

A web article becomes Tier 2 only after the underlying page is fetched and inspected.

### Tier 3 — discovery-only

Google Search grounding snippets are Tier 3. They may guide the next search/fetch action but cannot directly support a published core claim or published risk.

Low-signal social sources such as Facebook / YouTube / Instagram / TikTok / X are deprioritized during discovery.

## 5. Evidence eligibility

Before a source can be used by the verification pipeline:

- Tier 3 is excluded.
- Wrong-entity evidence is excluded.
- stale non-official sources are excluded.
- unknown-freshness non-official sources are excluded.
- official sources are accepted only for the candidate ticker.

Fetched source content is always treated as untrusted data. Instruction-like text is flagged in metadata and never receives authority over agent policy or tools.

## 6. Research harness

Default budget:

```text
maxSteps = 12
maxSearches = 5
maxSkepticRounds = 1
maxDurationMs = 180000
tool retries = 2 attempts at the runtime router
```

These are operational defaults, not theoretical optima.

Important deterministic guards:

- the LLM cannot declare `BUDGET_EXHAUSTED`; only the harness can.
- if Tier-1 + fetched Tier-2 evidence exist and claims are not verified, the harness forces `VERIFY`.
- new evidence marks `evidenceDirty`; verify again before skeptic/finalization.
- skeptic cannot run before verified claims exist.
- unnecessary skeptic calls are skipped.
- a search/fetch is blocked before it would exceed its budget.
- tool failures can fall back to another research path instead of fabricating data.

## 7. Verification

### Atomic textual claims

Long-form source material is converted into atomic claims, then each claim is separately checked against the cited source excerpt.

Statuses:

- `SUPPORTED`
- `REFUTED`
- `INSUFFICIENT`
- `CONFLICTING`

### Deterministic numeric claims

Known quant metrics from A are checked against normalized official source metadata without relying on an LLM.

Currently mapped:

- `revenue_yoy`
- `revenue_mom`
- `monthly_revenue`
- `cumulative_revenue_yoy`
- `operating_margin`
- `debt_ratio`
- `avg_turnover_20d`

When PR #5 screening evidence is present, B reuses that verified quantitative evidence and does not repeat the same monthly-revenue lookup.

Percentage signals support both ratio form (`0.35`) and percent form (`35`).

### Conflicts

If the same claim has both supporting and refuting evidence, a core claim becomes a HIGH conflict and cannot be published until resolved.

## 8. Publication gate

A result cannot become `PUBLISHABLE` unless:

1. at least one core claim exists;
2. every core claim is supported;
3. financial core claims have Tier-1 evidence;
4. core claims are not supported only by discovery snippets;
5. at least one grounded risk exists;
6. risks are not supported only by discovery snippets;
7. no unresolved HIGH conflict remains;
8. every upstream `notice` / `disposition` risk flag is explicitly addressed by a grounded risk item.

`don't know` / reject is a valid product result.

## 9. Research quality

Do not use an arbitrary model confidence probability.

The result exposes:

- `coreClaimCoverage`
- `primarySourceRatio`
- `unresolvedConflicts`
- `freshness = CURRENT | STALE | UNKNOWN`

Batch ranking derives a deterministic Evidence Quality score:

```text
0.50 core-claim coverage
+ 0.30 primary-source ratio
+ 0.15 freshness
+ 0.05 no-conflict factor
```

The current Top-K ranking default is:

```text
0.60 upstream quantScore
+ 0.40 evidence quality
```

These are configurable MVP heuristics and must not be presented as probability of price appreciation.

## 10. Batch / Top 5

`BatchResearchService` supports the product path from A's candidate list to Top-K research results.

Defaults:

- `topK = 5`
- `researchLimit = 10`
- `concurrency = 2`

Hard-constraint failures are never researched. The default research limit controls hackathon API cost; callers can increase it up to 30 to research the full A candidate set.

## 11. Thesis tracking

A publishable result can create Thesis v1.

Recheck behavior:

- refuted previous core claim → `INVALIDATED`
- conflicting / insufficient previous core claim → `WEAKENED`
- new supported core claim → `STRENGTHENED`
- no material verified change → `UNCHANGED`
- non-publishable recheck → preserve prior thesis and record `UNCHANGED` with an explicit reason

Thesis versions and events are persisted in SQLite.

## 12. Storage

SQLite currently stores:

- research runs
- full `ResearchResult`
- thesis versions
- thesis events

Local file default:

```text
trading-radar.sqlite
```

It is ignored by git.

## 13. API

Run:

```bash
npm run api
```

Default:

```text
http://127.0.0.1:8787
```

Research:

- `POST /api/research/screening-output` (preferred A -> B path)
- `POST /api/research/runs`
- `POST /api/research/batch`
- `GET /api/research/runs/:runId`
- `GET /api/research/tickers/:ticker/runs`

Thesis:

- `POST /api/theses`
- `POST /api/theses/:thesisId/recheck`
- `GET /api/theses/:thesisId`
- `GET /api/theses/:thesisId/versions`
- `GET /api/theses/:thesisId/events`

See `docs/INTEGRATION.md`.

## 14. Metrics

Each persisted run may expose:

- LLM call count
- input tokens
- output tokens
- LLM latency
- total run latency
- estimated provider cost when the adapter supplies it

These metrics are development/evaluation telemetry, never investment confidence.

## 15. Security

Implemented MVP controls:

- external content marked untrusted;
- localhost / private IP / non-http fetch targets blocked;
- redirects revalidated;
- body size / fetch size bounded;
- script/style/noscript content removed before model use;
- instruction-like source text flagged;
- external pages cannot specify tools;
- tool calls remain typed/schema-controlled;
- secrets stay in environment variables;
- API key patterns are redacted from Gemini request errors.

## 16. Evaluation

Offline deterministic invariant suite:

```bash
npm run eval:offline
```

It maps E01–E10 to executable safeguards:

- E01 normal growth
- E02 one-off revenue
- E03 margin deterioration
- E04 source conflict
- E05 official-source failure / retry
- E06 stale-news trap
- E07 wrong entity
- E08 unsupported causal story
- E09 prompt injection
- E10 thesis invalidation

General tests:

```bash
npm run typecheck
npm test
```

Repeat-run eval harness supports 3-run reliability summaries.

Live semantic E01–E10 evaluation is intentionally separate from deterministic tests because it needs a live model/search provider and incurs latency/cost.

## 17. Development status

### P0 — implemented

- Data PR #5 `screening-output-v1` -> B adapter
- upstream quantitative Evidence / riskFlag preservation
- duplicate monthly-revenue lookup prevention
- A/B and B/C contracts
- typed research harness
- explicit state
- TWSE / TPEx official tools
- dynamic search abstraction
- direct-page fetch
- evidence ledger
- numeric verifier
- textual verifier
- entity/freshness source eligibility
- publication gate
- retries / fallback behavior
- execution trace
- research persistence
- offline E01–E06 safeguards

### P1 — implemented for MVP

- conflict handling
- conditional skeptic
- thesis compiler
- thesis versioning
- thesis invalidation / recheck
- SQLite thesis persistence
- batch Top-K research
- API integration surface
- offline E01–E10 safeguards
- latency/token telemetry

### P2 — intentionally deferred

- parallel research workers / full multi-agent orchestration
- Agent Skills packaging
- MCP tool server packaging
- learned preference model / contextual bandit
- full bull/bear debate
- OpenAI production adapter
- distributed job queue / cloud persistence

These are not required for the current hackathon MVP.

## 18. Definition of Done

Static MVP DoD is satisfied when:

- CandidatePacket enters the system.
- controller chooses typed next actions from evidence gaps.
- at least two dynamic source classes exist.
- official numeric evidence can be verified deterministically.
- unsupported core claims cannot publish.
- every publishable result has a grounded risk.
- source conflicts block publication.
- tool failure is bounded and auditable.
- trace is returned to C.
- ResearchResult contract is stable.
- research runs persist.
- thesis can be saved and versioned.
- thesis can be rechecked from new evidence.
- E01–E10 offline invariants execute.
- prompt-injection fixture exists.
- latency/token telemetry is recorded.
- A candidate list can produce a deterministic Top-K output.
- the exact Data Layer `screening-output-v1` contract can enter B without losing Evidence lineage.
- C can develop against a credential-free mock server using the same HTTP contract.

## 19. Remaining live-only validation

The code can continue without user interaction up to this point. Remaining validation requires external credentials/runtime execution:

1. rerun the current live Gemini path using a real `screening-output-v1` document after upstream-evidence ingestion;
2. run repeated live semantic E01–E10 cases and record pass rate/latency/tokens;
3. perform one C-side real API consumption check after mock UI development;
4. when switching providers, choose the production OpenAI model/credential setup and add the OpenAI adapter.

These are runtime/provider validation tasks, not missing core MVP architecture.

## 20. Design references

Architecture/design inspirations used in this MVP:

- Anthropic, *Building Effective Agents* — keep the MVP composable and avoid premature multi-agent complexity.
- ReAct — action/observation closed loop.
- Self-RAG / FLARE — retrieve according to evidence gaps rather than a fixed search script.
- FEVER — supported/refuted/not-enough-evidence claim framing.
- FActScore — atomic factual claims.
- RARR / Chain-of-Verification — independently verify and revise unsupported claims.
- CRITIC — external-tool critique.
- ALCE / SAFE — citation/factuality evaluation ideas.
- TradingAgents — financial adversarial review inspiration only; adapted as a conditional skeptic.
- FinMem — temporal memory inspiration; adapted as versioned thesis state.
- AgentDojo — prompt-injection threat model.
- tau-bench — repeat-run reliability evaluation.

The project deliberately adapts these design ideas rather than reproducing their training methods or full architectures.
