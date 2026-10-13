import { describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import {
  computeEvidenceQuality,
  rankPublishableResearch,
} from "../src/research/ranking.js";

function candidate(id: string, ticker: string, quantScore: number): CandidatePacket {
  return {
    candidateId: id,
    ticker,
    companyName: id,
    market: "TWSE",
    industry: "Test",
    asOf: "2026-10-10",
    quantScore,
    quantSignals: [],
    hardConstraintsPassed: true,
  };
}

function result(
  ticker: string,
  primarySourceRatio: number,
): ResearchResult {
  return {
    runId: ticker,
    ticker,
    companyName: ticker,
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified thesis",
    keyReasons: ["Reason"],
    claims: [],
    risks: [{ title: "Risk", explanation: "Risk", sourceIds: ["s"] }],
    invalidationConditions: ["Condition"],
    sources: [],
    verificationSummary: {
      coreClaimCoverage: 1,
      primarySourceRatio,
      unresolvedConflicts: 0,
      freshness: "CURRENT",
    },
    researchTrace: [],
    stopReason: "PUBLISHED",
    startedAt: "2026-10-10T00:00:00Z",
    completedAt: "2026-10-10T00:00:01Z",
  };
}

describe("research ranking", () => {
  it("computes deterministic evidence quality", () => {
    expect(computeEvidenceQuality(result("1", 1))).toBe(1);
  });

  it("ranks only publishable results and returns Top-K", () => {
    const ranked = rankPublishableResearch(
      [
        { candidate: candidate("a", "1111", 0.9), result: result("1111", 0.5) },
        { candidate: candidate("b", "2222", 0.8), result: result("2222", 1) },
      ],
      1,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });
});
