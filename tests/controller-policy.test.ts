import { describe, expect, it } from "vitest";
import type { ResearchState } from "../src/domain/research.js";
import { enforceControllerPolicy } from "../src/harness/controller-policy.js";

function state(): ResearchState {
  return {
    runId: "run-1",
    candidate: {
      candidateId: "c1",
      ticker: "2330",
      companyName: "Fixture",
      market: "TWSE",
      industry: "Semiconductors",
      asOf: "2026-10-07",
      quantScore: 0.8,
      quantSignals: [],
      hardConstraintsPassed: true,
    },
    phase: "RESEARCH",
    knownFacts: [],
    openQuestions: [],
    sources: [
      {
        sourceId: "official-1",
        url: "https://openapi.twse.com.tw/example",
        title: "Official",
        publisher: "TWSE",
        sourceType: "TWSE",
        sourceTier: 1,
        retrievedAt: "2026-10-07T00:00:00Z",
        snippet: "Revenue evidence",
        contentHash: "x",
        untrustedContent: true,
      },
    ],
    claims: [],
    evidence: [],
    risks: [],
    conflicts: [],
    budget: {
      stepsUsed: 6,
      maxSteps: 12,
      searchesUsed: 3,
      maxSearches: 5,
      skepticRounds: 0,
      maxSkepticRounds: 1,
      startedAt: "2026-10-07T00:00:00Z",
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

describe("enforceControllerPolicy", () => {
  it("forces verification before skeptic review", () => {
    const decision = enforceControllerPolicy(state(), {
      reasonCode: "MODEL_SKEPTIC",
      summary: "Run skeptic.",
      action: {
        type: "RUN_SKEPTIC",
        thesisDraft: "Draft thesis",
      },
    });

    expect(decision.action.type).toBe("VERIFY");
    expect(decision.reasonCode).toBe("POLICY_FORCE_VERIFY");
  });

  it("forces verification before finalization", () => {
    const decision = enforceControllerPolicy(state(), {
      reasonCode: "MODEL_FINALIZE",
      summary: "Finalize.",
      action: { type: "FINALIZE" },
    });

    expect(decision.action.type).toBe("VERIFY");
  });

  it("forces re-verification after new evidence arrives", () => {
    const current = state();
    current.claims = [
      {
        claimId: "core-1",
        text: "Revenue grew.",
        category: "FINANCIAL",
        importance: "CORE",
        status: "SUPPORTED",
      },
    ];
    current.evidenceDirty = true;

    const decision = enforceControllerPolicy(current, {
      reasonCode: "MODEL_FINALIZE",
      summary: "Finalize.",
      action: { type: "FINALIZE" },
    });

    expect(decision.action.type).toBe("VERIFY");
    expect(decision.reasonCode).toBe("POLICY_FORCE_VERIFY");
  });

  it("skips an unnecessary skeptic after supported primary evidence and grounded risk", () => {
    const current = state();
    current.claims = [
      {
        claimId: "core-1",
        text: "Revenue grew.",
        category: "FINANCIAL",
        importance: "CORE",
        status: "SUPPORTED",
      },
    ];
    current.evidence = [
      {
        evidenceId: "e1",
        claimId: "core-1",
        sourceId: "official-1",
        evidenceText: "Revenue grew.",
        verificationResult: "SUPPORTED",
        verifierReason: "official",
      },
    ];
    current.sources.push({
      sourceId: "risk-source",
      url: "https://example.com/risk",
      title: "Risk",
      publisher: "example.com",
      sourceType: "NEWS",
      sourceTier: 2,
      retrievedAt: "2026-10-07T00:00:00Z",
      snippet: "Margin pressure",
      contentHash: "risk",
      untrustedContent: true,
    });
    current.risks = [
      {
        riskId: "r1",
        title: "Margin pressure",
        explanation: "Margins may be diluted.",
        sourceIds: ["risk-source"],
      },
    ];

    const decision = enforceControllerPolicy(current, {
      reasonCode: "MODEL_SKEPTIC",
      summary: "Run skeptic.",
      action: {
        type: "RUN_SKEPTIC",
        thesisDraft: "Draft thesis",
      },
    });

    expect(decision.action.type).toBe("FINALIZE");
    expect(decision.reasonCode).toBe("POLICY_SKIP_UNNEEDED_SKEPTIC");
  });
});
