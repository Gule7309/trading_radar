import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type { StoredResearchRun } from "../src/research/store.js";
import { BatchResearchService } from "../src/research/batch-service.js";
import { InMemoryPersonalizationStore } from "../src/personalization/store.js";
import { PersonalizationService } from "../src/personalization/service.js";
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

class RankingResearchService implements ResearchApiService {
  private readonly runs = new Map<string, StoredResearchRun>();
  private sequence = 0;

  async run(candidate: CandidatePacket): Promise<ResearchResult> {
    this.sequence += 1;
    const now = new Date().toISOString();
    const runId = `ranking-${candidate.ticker}-${this.sequence}`;
    const result: ResearchResult = {
      runId,
      ticker: candidate.ticker,
      companyName: candidate.companyName,
      status: "PUBLISHABLE",
      decision: "KEEP",
      thesis: "Verified fixture thesis.",
      keyReasons: ["Verified fixture reason"],
      claims: [
        {
          claimId: `claim-${candidate.ticker}`,
          text: "Verified fixture claim.",
          status: "SUPPORTED",
          category: "FINANCIAL",
          importance: "CORE",
          sourceIds: ["official"],
        },
      ],
      risks: [
        {
          title: "Fixture risk",
          explanation: "Fixture risk.",
          sourceIds: ["risk"],
          addressesRiskFlags: candidate.riskFlags ?? [],
        },
      ],
      invalidationConditions: ["Fixture condition"],
      sources: [],
      verificationSummary: {
        coreClaimCoverage: 1,
        primarySourceRatio: 1,
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

async function screeningFixture() {
  const url = new URL(
    "../packages/taiwan_data/tests/fixtures/sample_screening_output.json",
    import.meta.url,
  );
  return JSON.parse(await readFile(url, "utf8")) as unknown;
}

async function start() {
  const research = new RankingResearchService();
  const personalization = new PersonalizationService(
    new InMemoryPersonalizationStore(),
    research,
  );
  const server = createResearchApi(research, {
    batch: new BatchResearchService(research),
    personalization,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("feedback changes the next API ranking", () => {
  it("moves the safer tied candidate upward after HIGH_VOLATILITY feedback", async () => {
    const base = await start();
    const fixture = await screeningFixture();

    const runScreen = async () => {
      const response = await fetch(
        `${base}/api/research/screening-output`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: "u1",
            screeningOutput: fixture,
            options: {
              topK: 8,
              researchLimit: 8,
              concurrency: 2,
            },
          }),
        },
      );
      expect(response.status).toBe(200);
      return (await response.json()) as {
        top: Array<{
          ticker: string;
          result: { runId: string };
        }>;
      };
    };

    const before = await runScreen();
    const before3081 = before.top.findIndex(
      (item) => item.ticker === "3081",
    );
    const before6426 = before.top.findIndex(
      (item) => item.ticker === "6426",
    );

    expect(before3081).toBeGreaterThanOrEqual(0);
    expect(before6426).toBeGreaterThan(before3081);

    const feedbackRun = before.top.find(
      (item) => item.ticker === "3081",
    )?.result.runId;
    expect(feedbackRun).toBeTruthy();

    const feedback = await fetch(
      `${base}/api/users/u1/feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: feedbackRun,
          action: "SKIP",
          reasons: ["HIGH_VOLATILITY"],
        }),
      },
    );
    expect(feedback.status).toBe(200);

    const after = await runScreen();
    const after3081 = after.top.findIndex(
      (item) => item.ticker === "3081",
    );
    const after6426 = after.top.findIndex(
      (item) => item.ticker === "6426",
    );

    expect(after6426).toBeLessThan(after3081);
  });
});
