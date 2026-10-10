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
    sources: [
      {
        sourceId: "official-1",
        url: "https://openapi.twse.com.tw/example",
        title: "Official financial source",
        publisher: "TWSE",
        sourceType: "TWSE",
        sourceTier: 1,
        publishedAt: "2026-10-06",
        retrievedAt: "2026-10-07T00:00:00Z",
        ticker: "TEST",
        snippet: "Revenue growth was positive.",
        contentHash: "official",
        untrustedContent: true,
      },
      {
        sourceId: "risk-1-source",
        url: "https://example.com/risk",
        title: "Fetched risk source",
        publisher: "example.com",
        sourceType: "NEWS",
        sourceTier: 2,
        publishedAt: "2026-10-06",
        retrievedAt: "2026-10-07T00:00:00Z",
        ticker: "TEST",
        snippet: "Margin pressure increased.",
        contentHash: "risk",
        untrustedContent: true,
      },
    ],
    claims: [
      {
        claimId: "claim-1",
        text: "Core claim",
        category: "FINANCIAL",
        importance: "CORE",
        status: "SUPPORTED",
      },
    ],
    evidence: [
      {
        evidenceId: "e1",
        claimId: "claim-1",
        sourceId: "official-1",
        evidenceText: "Revenue growth was positive.",
        verificationResult: "SUPPORTED",
        verifierReason: "Official evidence supports the claim.",
      },
    ],
    risks: [
      {
        riskId: "risk-1",
        title: "Risk",
        explanation: "Material risk",
        sourceIds: ["risk-1-source"],
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

  it("rejects discovery-only core claim evidence", () => {
    const state = baseState();
    state.sources[0]!.sourceTier = 3;

    expect(evaluatePublicationGate(state)).toEqual({
      ok: false,
      reason: "CORE_CLAIM_DISCOVERY_ONLY",
    });
  });

  it("requires primary evidence for financial core claims", () => {
    const state = baseState();
    state.sources[0]!.sourceTier = 2;

    expect(evaluatePublicationGate(state)).toEqual({
      ok: false,
      reason: "FINANCIAL_CORE_WITHOUT_PRIMARY",
    });
  });

  it("rejects discovery-only risk evidence", () => {
    const state = baseState();
    state.sources[1]!.sourceTier = 3;

    expect(evaluatePublicationGate(state)).toEqual({
      ok: false,
      reason: "RISK_DISCOVERY_ONLY",
    });
  });

  it("requires every upstream risk flag to be explicitly addressed by grounded risk evidence", () => {
    const state = baseState();
    state.candidate.riskFlags = ["notice"];

    expect(evaluatePublicationGate(state)).toEqual({
      ok: false,
      reason: "UPSTREAM_RISK_FLAG_UNADDRESSED",
    });

    state.risks[0]!.addressesRiskFlags = ["notice"];

    expect(evaluatePublicationGate(state)).toEqual({ ok: true });
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
