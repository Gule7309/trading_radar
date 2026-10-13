# Original MVP Checklist

This checklist restores the original competition plan as the master scope.

Status legend:

- ✅ implemented in code / deterministic test coverage
- 🟡 backend contract exists, but C/live/demo validation is still required
- 🔴 external validation/submission work still required

## Core competition loop

```text
個人化情報
→ 主動送達
→ 行為回饋
→ 持續優化
```

Current implementation:

```text
User Profile
  ↓
Hard Constraints + Soft Preferences
  ↓
Taiwan Data screening
  ↓
Agent research + Evidence verification + Risk
  ↓
Top-K
  ↓
DAILY_RESEARCH_READY
  ↓
SAVE / SKIP + reason
  ↓
bounded Soft Preference update
  ↓
next screening/ranking changes
  ↓
SAVE → Watchlist + Thesis
  ↓
fresh saved-stock snapshot
  ↓
Thesis recheck
  ↓
STRENGTHENED / UNCHANGED / WEAKENED / INVALIDATED
  ↓
THESIS_CHANGED / EVIDENCE_CONFLICT
```

## Original Definition of Done

| # | Original MVP requirement | Status | Evidence / remaining work |
|---|---|---|---|
| 1 | Listed + OTC general-industry stocks use the same flow | ✅ | Taiwan Data screening handles TWSE + TPEx in one universe. |
| 2 | Quant Screener is reproducible | ✅ | deterministic screening, saved run metadata, fixture/schema/tests. |
| 3 | Agent chooses next research step from intermediate state | ✅ | typed ResearchState/ResearchAction + controller + deterministic policy guard. |
| 4 | Integrate TWSE, TPEx, MOPS | ✅ | Data Layer + B official adapters / source metadata. |
| 5 | Every important Claim has Evidence + date | ✅ | Evidence ledger, source dates/data periods, atomic verification. |
| 6 | Unverifiable conclusions do not publish | ✅ | publication gate / reject path. |
| 7 | Every publishable candidate has Risk | ✅ | publication gate requires grounded risk; riskFlags must be explicitly addressed. |
| 8 | Daily flow can produce Top 5 | 🟡 | scheduler + daily delivery + Top-K implemented; real data/model scheduled run still needs live validation. |
| 9 | Save / Skip with reasons | ✅ | feedback API + validated SAVE/SKIP reason sets + persistence. |
| 10 | Feedback changes next ranking observably | ✅ | bounded soft-weight updates + feedback-aware screening/ranking tests. C demo still needed. |
| 11 | Hard Constraints never auto-relax from feedback | ✅ | feedback only changes soft weights; nested hard constraints persist independently. |
| 12 | Saving a stock creates Investment Thesis | ✅ | SAVE of publishable research creates Watchlist + Thesis v1 without duplicate research. |
| 13 | New data can trigger Thesis re-evaluation | ✅ | Data Layer single-stock `inspect` + daily watchlist recheck + manual recheck API. Real scheduled run still needs live validation. |
| 14 | At least one Thesis Changed notification demo | 🟡 | backend notification generation + persistence implemented; C must show Notification Center / Browser Notification in demo. |
| 15 | Source failure + fallback demo | 🟡 | retry/fallback/reject logic + deterministic tests implemented; one visible demo case still needed. |
| 16 | Agent Execution Log | ✅ | structured `researchTrace`, reason codes, tools, outcomes, stop reason. |
| 17 | 3–5 real target users | 🔴 | requires actual recruitment/interviews/tests. |
| 18 | Before/after research-flow comparison | 🔴 | requires user study measurements. |
| 19 | Citation Correctness | 🟡 | verifier/eval infrastructure implemented; final measured live/user-test result still required. |
| 20 | Latency / Success Rate / Cost / Failure Types | 🟡 | telemetry + eval harness implemented; real repeated live measurements still required. |
| 21 | API credentials absent from frontend/public submission | 🟡 | backend-only env design is implemented; C/submission must be checked before delivery. |
| 22 | PDF/video/filename/screens anonymous | 🔴 | submission preparation task. |

## Backend / Data static implementation status

### Personalization

✅ User profile  
✅ hard constraints  
✅ soft preferences  
✅ profile persistence  
✅ feedback reasons  
✅ bounded preference updates  
✅ preference history  
✅ reset soft preferences  
✅ hard constraints remain user-controlled  

### Discovery and research

✅ TWSE / TPEx / MOPS data  
✅ screening-output-v1  
✅ Candidate + quantitative Evidence  
✅ Top-K  
✅ dynamic research Agent  
✅ evidence verifier  
✅ source freshness/entity controls  
✅ risk requirement  
✅ conflict blocking  
✅ fallback / reject  
✅ execution trace  

### Saved-stock monitoring

✅ Watchlist  
✅ Thesis v1  
✅ thesis versions  
✅ fresh single-stock Data snapshot  
✅ scheduled recheck path  
✅ negative evidence can WEAKEN / INVALIDATE a thesis even when the new research result is not publishable  
✅ Thesis Changed notification record  
✅ Evidence Conflict notification record  

### Proactive delivery

✅ weekday Asia/Taipei scheduler  
✅ after-hours run  
✅ missed-run catch-up after app restart  
✅ one successful daily run per user/date  
✅ stale market data is not labeled as today's research  
✅ Daily Research Ready notification record  
✅ scheduled watchlist recheck  
🟡 actual Browser/Desktop Notification presentation is a C responsibility  

## What is intentionally outside current backend static scope

These are not reasons to block C development:

- actual browser notification UI
- frontend pages and interaction design
- real-user interviews / task study
- submission PDF/video
- real provider repeated benchmark
- future OpenAI production adapter
- production authentication
- cloud queue / distributed worker deployment

## Stop condition for backend static MVP

Backend/Data static MVP can be considered complete only after:

1. full CI is green after personalization/delivery/watchlist changes;
2. Data `inspect` contract is schema-valid;
3. mock API supports the full profile → Top-K → feedback → next ranking → watchlist → thesis → notification loop;
4. C handoff docs reflect the final endpoints;
5. PR remains Draft until team integration confirmation.

After that, remaining work genuinely requires C, provider credentials, user participants, or submission production.
