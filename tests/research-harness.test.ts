import { describe, expect, it } from "vitest";
import { CandidatePacketSchema } from "../src/domain/candidate.js";
import { MockResearchController } from "../src/agent/controller.js";
import { researchCandidate } from "../src/harness/research-harness.js";
import { MockToolRouter } from "../src/tools/tool-router.js";

describe("researchCandidate", () => {
  it("produces a publishable result with a trace using the mock pipeline", async () => {
    const candidate = CandidatePacketSchema.parse({
      candidateId: "c1",
      ticker: "TEST",
      companyName: "Test Company",
      market: "TWSE",
      industry: "Technology",
      asOf: "2026-10-07",
      quantScore: 0.91,
      quantSignals: [
        {
          metric: "revenue_yoy",
          value: 0.35,
          period: "2026-09",
        },
      ],
      hardConstraintsPassed: true,
    });

    const result = await researchCandidate(
      candidate,
      new MockResearchController(),
      new MockToolRouter(),
    );

    expect(result.status, JSON.stringify(result, null, 2)).toBe("PUBLISHABLE");
    expect(result.decision).toBe("KEEP");
    expect(result.verificationSummary.coreClaimCoverage).toBe(1);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.researchTrace.length).toBeGreaterThanOrEqual(4);
  });
});
