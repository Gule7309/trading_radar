import { describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import { InMemoryThesisStore } from "../src/thesis/store.js";
import { ThesisService } from "../src/thesis/service.js";
import { ThesisResearchService } from "../src/thesis/research-service.js";

const candidate: CandidatePacket = {
  candidateId: "c1",
  ticker: "2330",
  companyName: "Fixture",
  market: "TWSE",
  industry: "Semiconductors",
  asOf: "2026-10-09",
  quantScore: 0.8,
  quantSignals: [],
  hardConstraintsPassed: true,
};

function publishable(runId: string): ResearchResult {
  return {
    runId,
    ticker: "2330",
    companyName: "Fixture",
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified thesis.",
    keyReasons: ["Official growth evidence"],
    claims: [
      {
        claimId: "core-1",
        text: "Revenue growth is positive.",
        status: "SUPPORTED",
        sourceIds: ["s1"],
      },
    ],
    risks: [
      {
        title: "Margin pressure",
        explanation: "Margins may decline.",
        sourceIds: ["s2"],
      },
    ],
    invalidationConditions: ["Revenue growth turns negative."],
    sources: [],
    verificationSummary: {
      coreClaimCoverage: 1,
      primarySourceRatio: 1,
      unresolvedConflicts: 0,
    },
    researchTrace: [],
    stopReason: "PUBLISHED",
    startedAt: "2026-10-09T00:00:00Z",
    completedAt: "2026-10-09T00:00:01Z",
  };
}

describe("ThesisResearchService", () => {
  it("creates a thesis from a publishable research run", async () => {
    const store = new InMemoryThesisStore();
    const theses = new ThesisService(store);
    const research = {
      async run() {
        return publishable("run-1");
      },
    } as any;

    const service = new ThesisResearchService(research, theses);
    const result = await service.create(candidate, "thesis-1");

    expect(result.researchRunId).toBe("run-1");
    expect(result.thesis.thesisId).toBe("thesis-1");
    expect(result.thesis.version).toBe(1);
  });

  it("rejects thesis creation from non-publishable research", async () => {
    const store = new InMemoryThesisStore();
    const theses = new ThesisService(store);
    const research = {
      async run() {
        return {
          ...publishable("run-2"),
          status: "REJECTED",
          decision: "REJECT",
          thesis: undefined,
          stopReason: "INSUFFICIENT_EVIDENCE",
        } as ResearchResult;
      },
    } as any;

    const service = new ThesisResearchService(research, theses);

    await expect(service.create(candidate, "thesis-1")).rejects.toThrow(
      /Cannot create thesis/,
    );
  });
});
