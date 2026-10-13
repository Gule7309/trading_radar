import { describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import { BatchResearchService } from "../src/research/batch-service.js";

function candidate(
  ticker: string,
  quantScore: number,
  hardConstraintsPassed = true,
): CandidatePacket {
  return {
    candidateId: ticker,
    ticker,
    companyName: ticker,
    market: "TWSE",
    industry: "Test",
    asOf: "2026-10-10",
    quantScore,
    quantSignals: [],
    hardConstraintsPassed,
  };
}

function publishable(ticker: string): ResearchResult {
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
      primarySourceRatio: 1,
      unresolvedConflicts: 0,
      freshness: "CURRENT",
    },
    researchTrace: [],
    stopReason: "PUBLISHED",
    startedAt: "2026-10-10T00:00:00Z",
    completedAt: "2026-10-10T00:00:01Z",
  };
}

describe("BatchResearchService", () => {
  it("never researches candidates that failed hard constraints", async () => {
    const seen: string[] = [];
    const research = {
      async run(item: CandidatePacket) {
        seen.push(item.ticker);
        return publishable(item.ticker);
      },
    } as any;

    const service = new BatchResearchService(research);
    const output = await service.run(
      [
        candidate("1111", 0.9),
        candidate("2222", 0.95, false),
      ],
      { topK: 1, researchLimit: 1 },
    );

    expect(seen).toEqual(["1111"]);
    expect(
      output.rejectedOrSkipped.some(
        (item) => item.stopReason === "HARD_CONSTRAINT_FAILED",
      ),
    ).toBe(true);
  });

  it("limits expensive research and returns Top-K", async () => {
    const research = {
      async run(item: CandidatePacket) {
        return publishable(item.ticker);
      },
    } as any;

    const service = new BatchResearchService(research);
    const output = await service.run(
      [
        candidate("1111", 0.9),
        candidate("2222", 0.8),
        candidate("3333", 0.7),
      ],
      { topK: 1, researchLimit: 2, concurrency: 2 },
    );

    expect(output.researched).toBe(2);
    expect(output.top).toHaveLength(1);
    expect(
      output.rejectedOrSkipped.some(
        (item) => item.stopReason === "RESEARCH_LIMIT",
      ),
    ).toBe(true);
  });
});
