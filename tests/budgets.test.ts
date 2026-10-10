import { describe, expect, it } from "vitest";
import type { ResearchState } from "../src/domain/research.js";
import { actionWouldExceedBudget } from "../src/harness/budgets.js";

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
    sources: [],
    claims: [],
    evidence: [],
    risks: [],
    conflicts: [],
    budget: {
      stepsUsed: 6,
      maxSteps: 12,
      searchesUsed: 5,
      maxSearches: 5,
      skepticRounds: 1,
      maxSkepticRounds: 1,
      startedAt: "2026-10-07T00:00:00Z",
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

describe("actionWouldExceedBudget", () => {
  it("blocks an additional search at the search limit", () => {
    expect(
      actionWouldExceedBudget(state(), {
        type: "SEARCH_NEWS",
        purpose: "more search",
        query: "query",
      }),
    ).toBe(true);
  });

  it("still allows verification when search budget is exhausted", () => {
    expect(
      actionWouldExceedBudget(state(), {
        type: "VERIFY",
        claimIds: [],
      }),
    ).toBe(false);
  });

  it("blocks a second skeptic round", () => {
    expect(
      actionWouldExceedBudget(state(), {
        type: "RUN_SKEPTIC",
        thesisDraft: "draft",
      }),
    ).toBe(true);
  });
});
