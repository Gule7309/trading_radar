import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type { StoredResearchRun } from "../src/research/store.js";
import {
  createResearchApi,
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

function result(candidate: CandidatePacket): ResearchResult {
  return {
    runId: "run-1",
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    status: "REJECTED",
    decision: "REJECT",
    keyReasons: [],
    claims: [],
    risks: [],
    invalidationConditions: [],
    sources: [],
    verificationSummary: {
      coreClaimCoverage: 0,
      primarySourceRatio: 0,
      unresolvedConflicts: 0,
    },
    researchTrace: [],
    stopReason: "INSUFFICIENT_EVIDENCE",
    startedAt: "2026-10-09T00:00:00Z",
    completedAt: "2026-10-09T00:00:01Z",
  };
}

class FixtureService implements ResearchApiService {
  private stored: StoredResearchRun | null = null;

  async run(candidate: CandidatePacket): Promise<ResearchResult> {
    const researchResult = result(candidate);
    this.stored = {
      runId: researchResult.runId,
      ticker: researchResult.ticker,
      candidate,
      result: researchResult,
      createdAt: researchResult.startedAt,
    };
    return researchResult;
  }

  async get(runId: string): Promise<StoredResearchRun | null> {
    return this.stored?.runId === runId ? this.stored : null;
  }

  async listByTicker(ticker: string): Promise<StoredResearchRun[]> {
    return this.stored?.ticker === ticker ? [this.stored] : [];
  }
}

async function start() {
  const server = createResearchApi(new FixtureService(), {
    corsOrigin: "http://localhost:5173",
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const candidate = {
  candidateId: "c1",
  ticker: "2330",
  companyName: "台積電",
  market: "TWSE",
  industry: "半導體業",
  asOf: "2026-10-09",
  quantScore: 0.9,
  quantSignals: [],
  hardConstraintsPassed: true,
} as const;

describe("research API", () => {
  it("accepts a candidate and returns a research result", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/research/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(candidate),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ResearchResult;
    expect(body.runId).toBe("run-1");
    expect(body.ticker).toBe("2330");
  });

  it("rejects malformed candidates", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/research/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: "2330" }),
    });

    expect(response.status).toBe(400);
  });

  it("exposes stored run history", async () => {
    const base = await start();

    await fetch(`${base}/api/research/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(candidate),
    });

    const response = await fetch(`${base}/api/research/runs/run-1`);
    expect(response.status).toBe(200);

    const history = await fetch(
      `${base}/api/research/tickers/2330/runs?limit=5`,
    );
    const body = (await history.json()) as { runs: StoredResearchRun[] };
    expect(body.runs).toHaveLength(1);
  });
});
