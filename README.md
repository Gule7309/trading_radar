# trading_radar

股研雷達（Trading Radar）— evidence-centered Agentic AI 台股研究助理。

This branch implements the **B module: Agent / Evidence**.

## What the MVP does

```text
A candidate stocks
→ bounded evidence-seeking research
→ official + dynamic sources
→ atomic claims
→ verification / conflicts / risks
→ deterministic publication gate
→ Top-K results
→ versioned investment thesis tracking
```

It does **not** predict guaranteed returns or auto-trade.

## Quick start

Node.js 22+.

```bash
npm install
cp .env.example .env
```

Set your local Gemini key in `.env`:

```env
GEMINI_API_KEY=...
```

Never commit the real key.

### Static checks

```bash
npm run typecheck
npm test
npm run eval:offline
```

### Official-data smoke test

```bash
npm run demo:official -- 2330 TWSE
```

### Gemini smoke test

```bash
npm run demo:gemini:smoke
```

### Live single-stock research

```bash
npm run demo:gemini -- 2330 台積電 TWSE 半導體業
```

### Local integration API

```bash
npm run api
```

Default: `http://127.0.0.1:8787`.

## Main endpoints

- `POST /api/research/runs`
- `POST /api/research/batch`
- `GET /api/research/runs/:runId`
- `POST /api/theses`
- `POST /api/theses/:thesisId/recheck`
- `GET /api/theses/:thesisId/versions`
- `GET /api/theses/:thesisId/events`

## Provider strategy

The research runtime is provider-neutral. Gemini is used for current development; a later OpenAI adapter can replace it without changing the research harness or product contracts.

## Docs

- `docs/B_AGENT_MVP.md` — architecture, policies, status, DoD
- `docs/INTEGRATION.md` — A/B/C contracts and API usage
