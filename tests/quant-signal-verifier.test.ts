import { describe, expect, it } from "vitest";
import type { ResearchState } from "../src/domain/research.js";
import { verifyQuantSignalsAgainstOfficialSources } from "../src/evidence/quant-signal-verifier.js";

function state(value: number): ResearchState {
  return {
    runId: "run",
    candidate: {
      candidateId: "c1",
      ticker: "2330",
      companyName: "台積電",
      market: "TWSE",
      industry: "半導體業",
      asOf: "2026-10-10",
      quantScore: 0.9,
      quantSignals: [
        {
          metric: "revenue_yoy",
          value,
          period: "2026-08",
        },
      ],
      hardConstraintsPassed: true,
    },
    phase: "VERIFY",
    knownFacts: [],
    openQuestions: [],
    sources: [
      {
        sourceId: "official",
        url: "https://openapi.twse.com.tw/example",
        title: "官方月營收",
        publisher: "TWSE",
        sourceType: "TWSE",
        sourceTier: 1,
        dataPeriod: "2026-08",
        retrievedAt: "2026-10-10T00:00:00Z",
        ticker: "2330",
        snippet: "YoY 53.32%",
        contentHash: "x",
        metadata: { yearOverYearPercent: 53.32 },
        untrustedContent: true,
      },
    ],
    claims: [],
    evidence: [],
    risks: [],
    conflicts: [],
    budget: {
      stepsUsed: 1,
      maxSteps: 12,
      searchesUsed: 1,
      maxSearches: 5,
      skepticRounds: 0,
      maxSkepticRounds: 1,
      startedAt: "2026-10-10T00:00:00Z",
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

describe("official quant signal verification", () => {
  it("supports a matching signal", () => {
    const result = verifyQuantSignalsAgainstOfficialSources(state(53.32));
    expect(result.claims[0]?.status).toBe("SUPPORTED");
    expect(result.evidence[0]?.verificationResult).toBe("SUPPORTED");
  });

  it("refutes a materially different signal", () => {
    const result = verifyQuantSignalsAgainstOfficialSources(state(40));
    expect(result.claims[0]?.status).toBe("REFUTED");
  });
});
