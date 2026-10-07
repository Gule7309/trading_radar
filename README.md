# trading_radar

股研雷達（Trading Radar）— Agentic AI 台股研究助理。

目前主要開發 B 模組（Agent / Evidence）：把 A 模組提供的候選股轉成可追溯、可驗證、帶風險與失效條件的研究結果，再交給 C 模組呈現。

## B MVP

```text
CandidatePacket
  -> Research Controller
  -> Official data / grounded web search
  -> ResearchState
  -> Atomic claims
  -> Evidence verification
  -> Risk extraction
  -> Publication gate
  -> ResearchResult
  -> Versioned thesis tracking
```

目前已包含：

- TWSE / TPEx 月營收與重大訊息 adapter
- Gemini structured-output controller / extractor / verifier / skeptic / thesis compiler
- Gemini Google Search grounding adapter
- guarded full-page source fetch
- deterministic publication gate
- retry / fallback-aware harness
- claim/evidence/conflict/risk pipeline
- SQLite thesis history
- E01–E10 reliability scenario catalog

## Local setup

Requires Node.js 22+.

```bash
npm install
cp .env.example .env
```

Set `GEMINI_API_KEY` locally. Never commit the real key.

Mock demo:

```bash
npm run demo
```

Official-data smoke test:

```bash
npm run demo:official -- 2330 TWSE
```

Live Gemini research path:

```bash
set GEMINI_API_KEY=YOUR_KEY
npm run demo:gemini -- 2330 台積電 TWSE 半導體業
```

On macOS/Linux, use `export GEMINI_API_KEY=...` instead.

See `docs/B_AGENT_MVP.md` for architecture and design rationale.
