# B MVP Handoff

## Ready now

The B module is statically implemented and integrated with the repository data layer branch history.

Run the local checks:

```bash
npm install
npm run typecheck
npm test
npm run eval:offline
```

Start the local integration API:

```bash
npm run api
```

Current development provider:

```env
LLM_PROVIDER=gemini
SEARCH_PROVIDER=gemini-google-search
GEMINI_API_KEY=...
```

## Product paths

### Single candidate

```text
CandidatePacket
→ ResearchService
→ Research Harness
→ Evidence verification
→ Publication Gate
→ ResearchResult
```

### Candidate list

```text
20–30 CandidatePackets
→ hard-constraint filter
→ bounded research subset (default researchLimit=10; configurable to 30)
→ publishable results
→ deterministic evidence-aware ranking
→ Top 5
```

### Saved stock

```text
ResearchResult
→ Thesis v1
→ new event / manual recheck
→ new ResearchResult
→ versioned thesis state
→ Strengthened / Unchanged / Weakened / Invalidated
```

## API handoff to C

- `POST /api/research/runs`
- `POST /api/research/batch`
- `GET /api/research/runs/:runId`
- `GET /api/research/tickers/:ticker/runs`
- `POST /api/theses`
- `POST /api/theses/:thesisId/recheck`
- `GET /api/theses/:thesisId`
- `GET /api/theses/:thesisId/versions`
- `GET /api/theses/:thesisId/events`

See `docs/INTEGRATION.md` for payload details.

## Evidence policy

- Tier 1 official evidence is required for financial core claims.
- Search snippets are discovery-only.
- Web evidence must be fetched before publication.
- stale or wrong-entity sources are excluded from verification.
- unsupported / conflicting core claims cannot publish.
- every publishable result requires a grounded risk.
- external source text is untrusted and cannot change tool or policy authority.

## MVP evaluation

Offline E01–E10 invariants:

```bash
npm run eval:offline
```

Live semantic evaluation remains a runtime task because it consumes provider calls.

## Explicitly deferred

Not required for the current MVP:

- OpenAI production adapter (provider boundary is ready; model/credential choice is still needed).
- distributed queue / cloud worker execution.
- full multi-agent debate.
- preference-learning model / contextual bandit.
- Agent Skills / MCP packaging.
- full live E01–E10 repeated evaluation report.

## Before merge

1. GitHub CI must pass both Node and `taiwan_data` jobs.
2. Run one current live Gemini candidate after the latest policy changes.
3. Confirm C can consume `ResearchResult` / batch endpoints.
4. Keep the PR draft until the team is ready to integrate.
