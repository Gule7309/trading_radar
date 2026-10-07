import { describe, expect, it } from "vitest";
import type { ResearchResult } from "../src/domain/research.js";
import {
  createInitialThesis,
  recheckThesis,
} from "../src/thesis/tracker.js";

function result(
  claimStatus: ResearchResult["claims"][number]["status"],
  completedAt: string,
): ResearchResult {
  return {
    runId: "run",
    ticker: "2330",
    companyName: "Fixture",
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified growth thesis.",
    keyReasons: ["Growth"],
    claims: [
      {
        claimId: "core-1",
        text: "Revenue growth remains positive.",
        status: claimStatus,
        sourceIds: ["s1"],
      },
    ],
    risks: [
      {
        title: "Margin pressure",
        explanation: "Margins could decline.",
        sourceIds: ["s2"],
      },
    ],
    invalidationConditions: ["Revenue growth turns negative."],
    sources: [],
    verificationSummary: {
      coreClaimCoverage: claimStatus === "SUPPORTED" ? 1 : 0,
      primarySourceRatio: 1,
      unresolvedConflicts: claimStatus === "CONFLICTING" ? 1 : 0,
    },
    researchTrace: [],
    stopReason: "PUBLISHED",
    startedAt: completedAt,
    completedAt,
  };
}

describe("thesis tracker", () => {
  it("creates an initial thesis", () => {
    const initial = createInitialThesis(
      result("SUPPORTED", "2026-10-07T00:00:00Z"),
      "thesis-1",
    );

    expect(initial.version).toBe(1);
    expect(initial.status).toBe("ACTIVE");
    expect(initial.coreClaims).toHaveLength(1);
  });

  it("invalidates when a previous core claim is refuted", () => {
    const initial = createInitialThesis(
      result("SUPPORTED", "2026-10-07T00:00:00Z"),
      "thesis-1",
    );

    const next = recheckThesis(
      initial,
      result("REFUTED", "2026-11-07T00:00:00Z"),
    );

    expect(next.version).toBe(2);
    expect(next.status).toBe("INVALIDATED");
  });

  it("weakens when support becomes conflicting", () => {
    const initial = createInitialThesis(
      result("SUPPORTED", "2026-10-07T00:00:00Z"),
      "thesis-1",
    );

    const next = recheckThesis(
      initial,
      result("CONFLICTING", "2026-11-07T00:00:00Z"),
    );

    expect(next.status).toBe("WEAKENED");
  });
});
