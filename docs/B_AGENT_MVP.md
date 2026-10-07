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

Not yet implemented:

- real TWSE / TPEx / MOPS adapters
- real news search
- claim extraction model call
- numeric verifier
- textual verifier
- conflict detector
- retry/fallback policy
- conditional skeptic
- thesis persistence / recheck
- eval suite

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
