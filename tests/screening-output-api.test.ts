import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type {
  BatchResearchOptions,
  BatchResearchResult,
} from "../src/research/batch-service.js";
import type { StoredResearchRun } from "../src/research/store.js";
import {
  createResearchApi,
  type BatchResearchApiService,
  type ResearchApiService,
} from "../src/api/research-api.js";

const servers: ReturnType<typeof createResearchApi>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

class ResearchFixture implements ResearchApiService {
  async run(): Promise<ResearchResult> {
    throw new Error("not used");
  }
  async get(): Promise<StoredResearchRun | null> {
    return null;
  }
  async listByTicker(): Promise<StoredResearchRun[]> {
    return [];
  }
}

class BatchFixture implements BatchResearchApiService {
  lastCandidates: CandidatePacket[] = [];

  async run(
    candidates: CandidatePacket[],
    _options?: BatchResearchOptions,
  ): Promise<BatchResearchResult> {
    this.lastCandidates = candidates;
    return {
      researched: candidates.length,
      rejectedOrSkipped: [],
      top: [],
    };
  }
}

function screeningOutput() {
  const metric = (
    evidenceId: string,
    value: number,
    percentile: number | null,
  ) => ({ value, percentile, evidenceId });

  const evidence = (
    id: string,
    metricName: string,
    value: number,
    unit: "%" | "TWD",
    dataAsOf: string,
    source = "MOPS",
  ) => ({
    id,
    stockId: "2330",
    metric: metricName,
    claim: `${metricName} verified`,
    value,
    unit,
    dataset:
      metricName === "revenueYoY"
        ? "monthly_revenue"
        : metricName === "avgTurnover20d"
          ? "daily_prices"
          : "quarterly_financials",
    source,
    sourceUrl: "https://example.com/source",
    referenceUrl: null,
    dataAsOf,
    windowStart: dataAsOf,
    windowEnd: dataAsOf,
    fetchedAt: "2026-10-10T00:00:00Z",
    fetchedAtScope: "dataset",
    calculation: { formula: "fixture", inputs: {} },
    verificationStatus: "verified",
  });

  return {
    schemaVersion: "screening-output-v1",
    run: {
      runId: "20261010-001",
      runAt: "2026-10-10T12:00:00+08:00",
      asOfDate: "2026-10-10",
      priceAsOf: "2026-10-08",
      revenueAsOf: "2026-08",
      revenueCoverage: 1,
      financialAsOf: "2026Q2",
      financialCoverage: 1,
      configVersion: "v1",
      dataVersion: "ds-test",
      sourceSnapshot: null,
      status: "success",
      profile: {},
      config: {},
      counts: { universe: 1, baseEligible: 1, ranked: 1 },
    },
    candidates: [
      {
        stockId: "2330",
        stockName: "台積電",
        market: "TWSE",
        industry: "半導體業",
        percentileScope: "industry",
        metrics: {
          revenueYoY: metric("ev-001", 53.32, 0.95),
          operatingMargin: metric("ev-002", 50, 0.9),
          debtRatio: metric("ev-003", 30, 0.8),
          avgTurnover20d: metric("ev-004", 9_000_000_000, null),
        },
        riskFlags: ["notice"],
        quantScore: 0.91,
        rank: 1,
      },
    ],
    evidence: [
      evidence("ev-001", "revenueYoY", 53.32, "%", "2026-08"),
      evidence("ev-002", "operatingMargin", 50, "%", "2026Q2"),
      evidence("ev-003", "debtRatio", 30, "%", "2026Q2"),
      evidence(
        "ev-004",
        "avgTurnover20d",
        9_000_000_000,
        "TWD",
        "2026-10-08",
        "TWSE",
      ),
    ],
    excluded: {
      total: 0,
      byStage: { base: 0, constraint: 0 },
      byReason: {},
    },
  };
}

describe("screening-output research API", () => {
  it("accepts the Data Layer v1 contract and adapts it before batch research", async () => {
    const batch = new BatchFixture();
    const server = createResearchApi(new ResearchFixture(), { batch });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(
      `${base}/api/research/screening-output`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          screeningOutput: screeningOutput(),
          options: { topK: 5 },
        }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      screeningRunId: string;
      dataVersion: string;
      researched: number;
    };

    expect(body).toMatchObject({
      screeningRunId: "20261010-001",
      dataVersion: "ds-test",
      researched: 1,
    });
    expect(batch.lastCandidates[0]).toMatchObject({
      ticker: "2330",
      riskFlags: ["notice"],
      hardConstraintsPassed: true,
    });
    expect(batch.lastCandidates[0]?.upstreamEvidence).toHaveLength(4);
  });
});
