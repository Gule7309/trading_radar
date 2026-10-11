import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type { StoredResearchRun } from "../src/research/store.js";
import { BatchResearchService } from "../src/research/batch-service.js";
import { InMemoryThesisStore } from "../src/thesis/store.js";
import { ThesisService } from "../src/thesis/service.js";
import { ThesisResearchService } from "../src/thesis/research-service.js";
import { InMemoryPersonalizationStore } from "../src/personalization/store.js";
import { PersonalizationService } from "../src/personalization/service.js";
import { InMemoryNotificationStore } from "../src/notifications/store.js";
import { NotificationService } from "../src/notifications/service.js";
import { InMemoryWatchlistStore } from "../src/watchlist/store.js";
import { WatchlistService } from "../src/watchlist/service.js";
import {
  createResearchApi,
  type ResearchApiService,
} from "../src/api/research-api.js";

const servers: ReturnType<typeof createResearchApi>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) =>
          server.close(() => resolve()),
        ),
    ),
  );
});

class FixtureResearch implements ResearchApiService {
  private readonly runs = new Map<string, StoredResearchRun>();
  private calls = 0;

  async run(candidate: CandidatePacket): Promise<ResearchResult> {
    this.calls += 1;
    const refuted = this.calls > 1;
    const runId = `run-${this.calls}`;
    const now = new Date(
      Date.UTC(2026, 9 + this.calls, 11),
    ).toISOString();

    const result: ResearchResult = {
      runId,
      ticker: candidate.ticker,
      companyName: candidate.companyName,
      status: "PUBLISHABLE",
      decision: "KEEP",
      thesis: refuted ? "Updated thesis" : "Initial thesis",
      keyReasons: ["Reason"],
      claims: [
        {
          claimId: "core",
          text: "Core claim",
          status: refuted ? "REFUTED" : "SUPPORTED",
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
          addressesRiskFlags: candidate.riskFlags ?? [],
        },
      ],
      invalidationConditions: ["Condition"],
      sources: [
        {
          sourceId: "s1",
          title: "Official",
          url: "https://example.com/official",
          publisher: "MOPS",
          sourceType: "MOPS",
          dataPeriod: candidate.asOf,
          sourceTier: 1,
        },
        {
          sourceId: "s2",
          title: "Risk",
          url: "https://example.com/risk",
          publisher: "News",
          sourceType: "NEWS",
          publishedAt: candidate.asOf,
          sourceTier: 2,
        },
      ],
      verificationSummary: {
        coreClaimCoverage: 1,
        primarySourceRatio: 0.5,
        unresolvedConflicts: 0,
        freshness: "CURRENT",
      },
      researchTrace: [],
      stopReason: "PUBLISHED",
      startedAt: now,
      completedAt: now,
    };

    this.runs.set(runId, {
      runId,
      ticker: candidate.ticker,
      candidate,
      result,
      createdAt: now,
    });

    return result;
  }

  async get(runId: string): Promise<StoredResearchRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async listByTicker(
    ticker: string,
    limit = 20,
  ): Promise<StoredResearchRun[]> {
    return Array.from(this.runs.values())
      .filter((run) => run.ticker === ticker)
      .slice(0, limit);
  }
}

async function start() {
  const research = new FixtureResearch();
  const batch = new BatchResearchService(research);

  const thesisService = new ThesisService(
    new InMemoryThesisStore(),
  );
  const thesisResearch = new ThesisResearchService(
    research,
    thesisService,
  );

  const personalization = new PersonalizationService(
    new InMemoryPersonalizationStore(),
    research,
  );
  const notifications = new NotificationService(
    new InMemoryNotificationStore(),
  );
  const watchlist = new WatchlistService(
    new InMemoryWatchlistStore(),
    research,
    thesisService,
    thesisResearch,
    notifications,
  );

  const server = createResearchApi(research, {
    batch,
    theses: thesisResearch,
    personalization,
    notifications,
    watchlist,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function fixture() {
  const url = new URL(
    "../packages/taiwan_data/tests/fixtures/sample_screening_output.json",
    import.meta.url,
  );
  return JSON.parse(await readFile(url, "utf8")) as unknown;
}

describe("engagement API", () => {
  it("closes screening -> feedback -> preference -> save -> thesis -> notification", async () => {
    const base = await start();

    const profileResponse = await fetch(
      `${base}/api/users/u1/profile`,
    );
    expect(profileResponse.status).toBe(200);
    const profileBefore = (await profileResponse.json()) as {
      softPreferences: { growth: number };
    };

    const screeningResponse = await fetch(
      `${base}/api/research/screening-output`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "u1",
          screeningOutput: await fixture(),
          options: { topK: 1, researchLimit: 1 },
        }),
      },
    );
    expect(screeningResponse.status).toBe(200);

    const screening = (await screeningResponse.json()) as {
      top: Array<{
        result: { runId: string };
      }>;
    };
    const runId = screening.top[0]?.result.runId;
    expect(runId).toBeTruthy();

    const feedbackResponse = await fetch(
      `${base}/api/users/u1/feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          action: "SAVE",
          reasons: ["GROWTH"],
        }),
      },
    );
    expect(feedbackResponse.status).toBe(200);

    const feedback = (await feedbackResponse.json()) as {
      profile: { softPreferences: { growth: number } };
      watchlistItem: { ticker: string; thesisId: string };
    };
    expect(feedback.profile.softPreferences.growth).toBeGreaterThan(
      profileBefore.softPreferences.growth,
    );
    expect(feedback.watchlistItem.thesisId).toBeTruthy();

    const watchlistResponse = await fetch(
      `${base}/api/users/u1/watchlist`,
    );
    const watchlist = (await watchlistResponse.json()) as {
      items: Array<{ candidate: CandidatePacket; ticker: string }>;
    };
    expect(watchlist.items).toHaveLength(1);

    const item = watchlist.items[0]!;
    const recheckResponse = await fetch(
      `${base}/api/users/u1/watchlist/${item.ticker}/recheck`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate: item.candidate,
          eventType: "MONTHLY_REVENUE",
        }),
      },
    );
    expect(recheckResponse.status).toBe(200);

    const recheck = (await recheckResponse.json()) as {
      thesis: { status: string };
    };
    expect(recheck.thesis.status).toBe("INVALIDATED");

    const notificationResponse = await fetch(
      `${base}/api/users/u1/notifications?unread=1`,
    );
    const notificationBody =
      (await notificationResponse.json()) as {
        notifications: Array<{ type: string }>;
      };

    expect(
      notificationBody.notifications.some(
        (item) => item.type === "THESIS_CHANGED",
      ),
    ).toBe(true);

    const historyResponse = await fetch(
      `${base}/api/users/u1/preference-history`,
    );
    const history = (await historyResponse.json()) as {
      changes: unknown[];
    };
    expect(history.changes).toHaveLength(1);
  });
});
