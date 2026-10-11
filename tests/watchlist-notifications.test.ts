import { describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import { InMemoryThesisStore } from "../src/thesis/store.js";
import { ThesisService } from "../src/thesis/service.js";
import { ThesisResearchService } from "../src/thesis/research-service.js";
import { InMemoryNotificationStore } from "../src/notifications/store.js";
import { NotificationService } from "../src/notifications/service.js";
import { InMemoryWatchlistStore } from "../src/watchlist/store.js";
import { WatchlistService } from "../src/watchlist/service.js";

const candidate: CandidatePacket = {
  candidateId: "c1",
  ticker: "2330",
  companyName: "台積電",
  market: "TWSE",
  industry: "半導體業",
  asOf: "2026-10-11",
  quantScore: 0.9,
  quantSignals: [],
  hardConstraintsPassed: true,
};

function publishable(
  runId: string,
  claimStatus: "SUPPORTED" | "REFUTED" = "SUPPORTED",
): ResearchResult {
  return {
    runId,
    ticker: "2330",
    companyName: "台積電",
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified thesis",
    keyReasons: ["Reason"],
    claims: [
      {
        claimId: "core",
        text: "Core claim",
        status: claimStatus,
        category: "FINANCIAL",
        importance: "CORE",
        sourceIds: ["s1"],
      },
    ],
    risks: [
      {
        title: "Risk",
        explanation: "Risk",
        sourceIds: ["s2"],
      },
    ],
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
    startedAt: "2026-10-11T00:00:00Z",
    completedAt:
      runId === "run-1"
        ? "2026-10-11T00:00:01Z"
        : "2026-11-11T00:00:01Z",
  };
}

describe("watchlist + notifications", () => {
  it("saving a publishable run creates a thesis and watchlist item", async () => {
    const runs = new Map([
      [
        "run-1",
        {
          runId: "run-1",
          ticker: "2330",
          candidate,
          result: publishable("run-1"),
          createdAt: "2026-10-11T00:00:00Z",
        },
      ],
    ]);

    const research = {
      async get(runId: string) {
        return runs.get(runId) ?? null;
      },
      async run() {
        return publishable("run-2");
      },
    };

    const thesisService = new ThesisService(
      new InMemoryThesisStore(),
    );
    const thesisResearch = new ThesisResearchService(
      research,
      thesisService,
    );
    const notifications = new NotificationService(
      new InMemoryNotificationStore(),
    );
    const service = new WatchlistService(
      new InMemoryWatchlistStore(),
      research,
      thesisService,
      thesisResearch,
      notifications,
    );

    const item = await service.saveFromResearchRun(
      "u1",
      "run-1",
    );

    expect(item.ticker).toBe("2330");
    expect(item.thesisId).toBeTruthy();
    expect(await service.list("u1")).toHaveLength(1);
  });

  it("creates a user notification for a material thesis change", async () => {
    const store = new InMemoryNotificationStore();
    const notifications = new NotificationService(store);

    const item = await notifications.thesisChanged({
      userId: "u1",
      researchRunId: "run-2",
      thesis: {
        thesisId: "t1",
        ticker: "2330",
        version: 2,
        thesisText: "Thesis",
        status: "WEAKENED",
        coreClaims: [],
        supportingClaims: [],
        risks: [],
        invalidationConditions: [],
        createdAt: "2026-11-11T00:00:00Z",
        changeReason: "One core claim lost support.",
      },
    });

    expect(item?.type).toBe("THESIS_CHANGED");
    expect((await notifications.list("u1")).length).toBe(1);
  });
});
