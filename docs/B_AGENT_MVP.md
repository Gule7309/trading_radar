# B Module — Agent / Evidence MVP

## Goal

Turn an upstream `CandidatePacket` into a grounded `ResearchResult` with:

- adaptive research actions,
- explicit research state,
- claim/evidence linkage,
- deterministic publication gates,
- risk disclosure,
- execution trace,
- clear reject/stop reasons.

## MVP architecture

```text
CandidatePacket
    ↓
Research Controller
    ↓
typed ResearchAction
    ↓
Tool Router
    ↓
Observation / SourceDocument
    ↓
ResearchState
    ↓
Claim / Evidence verification
    ↓
Publication Gate
    ↓
ResearchResult
```

The first implementation intentionally uses a **single controller** instead of a full multi-agent system. This keeps the harness debuggable and lets us measure whether extra coordination actually improves results before adding it.

## Current P0 status

Implemented in the first skeleton:

- `CandidatePacket`
- `ResearchState`
- `ResearchResult`
- `ResearchAction`
- finite-loop research harness
- step/search/skeptic budgets
- mock tool router
- execution trace
- deterministic publication gate
- mock end-to-end demo
- publication gate and harness tests

Implemented since the initial scaffold:

- keyless TWSE / TPEx monthly revenue adapters
- material disclosure normalization and adapters
- provider-neutral dynamic news search contract
- provider-neutral structured LLM contract
- atomic claim extraction service
- deterministic numeric verifier
- isolated textual verifier
- conflict detector
- source-grounded risk extractor
- conditional skeptic service
- verified-evidence thesis compiler
- injectable verification pipeline
- HTTP timeout / retry policy
- CI typecheck + tests

Current live stack:

- Gemini structured-output adapter for the hackathon development phase
- Gemini Google Search grounding as discovery-only web search
- TWSE / TPEx official adapters
- guarded direct-page fetch before web evidence can support publication
- SQLite thesis persistence / recheck
- E01–E10 eval scenario catalog and repeat-run harness

Still pending:

- run the full E01–E10 live evaluation suite and record reliability / latency / cost
- tune research budgets and controller policy from live eval results
- add the production OpenAI adapter when the team is ready to switch providers

## Design sources

The architecture is inspired by:

- **ReAct**: interleave reasoning/action/observation.
- **Self-RAG / FLARE**: retrieve when evidence is needed rather than following a fixed retrieval script.
- **FActScore**: decompose long-form findings into atomic factual claims.
- **FEVER**: map claims to supporting/refuting/insufficient evidence.
- **RARR / Chain-of-Verification**: independently verify and revise unsupported claims.
- **CRITIC**: use external tools for critique/correction.
- **TradingAgents**: borrow adversarial financial review, but only as a conditional skeptic in later phases.
- **FinMem**: maintain temporal financial memory; later implemented as versioned thesis state.
- **ALCE / SAFE / tau-bench**: evaluate citation quality, factual support, and repeat-run reliability.

## Key engineering rule

**LLMs interpret text; code enforces policy.**

Use LLM calls for:

- query formation,
- claim extraction,
- textual evidence judgment,
- risk synthesis,
- thesis synthesis.

Use deterministic code for:

- budgets,
- dates,
- numeric recalculation,
- required fields,
- state transitions,
- publication rules,
- reject conditions.

## Next implementation slice

1. Replace mock official source with a TWSE adapter.
2. Add a provider-neutral news search interface.
3. Add claim extraction.
4. Add deterministic numeric verification.
5. Add textual verifier.
6. Add retry/fallback and conflict handling.


## Provider strategy

The core architecture is intentionally provider-neutral.

`LlmProvider` isolates controller, claim extraction, verification, skeptic, and thesis compilation from any specific model vendor. `SearchProvider` similarly isolates dynamic discovery. The current hackathon development runtime uses Gemini because credentials are available now; the intended later migration to OpenAI should be implemented as another adapter rather than by changing the harness, domain models, evidence ledger, or publication policy.

## Gemini implementation

The current development runtime uses the Google Gen AI SDK through that provider-neutral adapter.

Default model:

- `gemini-3.8-flash` for structured controller / extraction / verification / skeptic / thesis tasks.
- `gemini-3.8-flash` with Google Search grounding for dynamic web research.

The model names remain environment-configurable through `GEMINI_MODEL` and
`GEMINI_SEARCH_MODEL`.

Structured model calls use JSON Schema converted from the existing Zod schemas.
Dynamic search keeps grounded citation URLs and cited text as normalized
`SearchResult` objects. The rest of the harness remains independent of Gemini,
so another provider can be substituted later without changing the domain layer.

Local live run:

```bash
export GEMINI_API_KEY="..."
npm install
npm run demo:gemini -- 2330 台積電 TWSE 半導體業
```

Do not commit API keys or paste them into research artifacts.
