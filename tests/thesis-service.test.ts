import { describe, expect, it } from "vitest";
import type { ResearchResult } from "../src/domain/research.js";
import { InMemoryThesisStore } from "../src/thesis/store.js";
import { ThesisService } from "../src/thesis/service.js";

function research(
  status: ResearchResult["claims"][number]["status"],
  completedAt: string,
): ResearchResult {
  return {
    runId: "run-1",
    ticker: "2330",
    companyName: "Fixture Company",
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified revenue growth remains worth monitoring.",
    keyReasons: ["Revenue growth"],
    claims: [
      {
        claimId: "core-1",
        text: "Revenue growth remains positive.",
        status,
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
    sources: [
      {
        sourceId: "s1",
        title: "Official",
        url: "https://example.com/official",
        publisher: "TWSE",
        publishedAt: completedAt.slice(0, 10),
        sourceTier: 1,
      },
    ],
    verificationSummary: {
      coreClaimCoverage: status === "SUPPORTED" ? 1 : 0,
      primarySourceRatio: 1,
      unresolvedConflicts: status === "CONFLICTING" ? 1 : 0,
    },
    researchTrace: [],
    stopReason: "PUBLISHED",
    startedAt: completedAt,
    completedAt,
  };
}

describe("ThesisService", () => {
  it("persists creation and later recheck events", async () => {
    const store = new InMemoryThesisStore();
    const service = new ThesisService(store);

    const initial = await service.createFromResearch(
      research("SUPPORTED", "2026-10-07T00:00:00Z"),
      "thesis-1",
    );

    const next = await service.recheckFromResearch(
      initial.thesisId,
      research("REFUTED", "2026-11-07T00:00:00Z"),
      {
        occurredAt: "2026-11-07T00:00:00Z",
        eventType: "MONTHLY_REVENUE",
        summary: "Latest monthly revenue invalidated a core assumption.",
        sourceIds: ["s1"],
      },
    );

    expect(next.version).toBe(2);
    expect(next.status).toBe("INVALIDATED");
    expect(await store.listVersions("thesis-1")).toHaveLength(2);
    expect(await store.listEvents("thesis-1")).toHaveLength(2);
  });
});
