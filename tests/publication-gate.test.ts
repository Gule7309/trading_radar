import { describe, expect, it } from "vitest";
import type { ResearchState } from "../src/domain/research.js";
import { evaluatePublicationGate } from "../src/harness/publication-gate.js";

function baseState(): ResearchState {
  return {
    runId: "run-1",
    candidate: {
      candidateId: "c1",
      ticker: "TEST",
      companyName: "Test Co",
      market: "TWSE",
      industry: "Test",
      asOf: "2026-10-07",
      quantScore: 0.8,
      quantSignals: [],
      hardConstraintsPassed: true,
    },
    phase: "VERIFY",
    knownFacts: [],
    openQuestions: [],
    sources: [],
    claims: [
      {
        claimId: "claim-1",
        text: "Core claim",
        category: "FINANCIAL",
        importance: "CORE",
        status: "SUPPORTED",
      },
    ],
    evidence: [],
    risks: [
      {
        riskId: "risk-1",
        title: "Risk",
        explanation: "Material risk",
        sourceIds: [],
      },
    ],
    conflicts: [],
    budget: {
      stepsUsed: 1,
      maxSteps: 8,
      searchesUsed: 1,
      maxSearches: 4,
      skepticRounds: 0,
      maxSkepticRounds: 1,
      startedAt: "2026-10-07T00:00:00Z",
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

describe("evaluatePublicationGate", () => {
  it("passes when all core publication requirements are satisfied", () => {
    expect(evaluatePublicationGate(baseState())).toEqual({ ok: true });
  });

  it("rejects unsupported core claims", () => {
    const state = baseState();
    state.claims[0]!.status = "INSUFFICIENT";

    expect(evaluatePublicationGate(state)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_CORE_CLAIM",
    });
  });

  it("rejects unresolved high-severity conflicts", () => {
    const state = baseState();
    state.conflicts.push({
      conflictId: "conflict-1",
      claimId: "claim-1",
      severity: "HIGH",
      sourceIds: ["a", "b"],
      resolved: false,
      note: "Two sources disagree.",
    });

    expect(evaluatePublicationGate(state)).toEqual({
      ok: false,
      reason: "HIGH_CONFLICT",
    });
  });
});
