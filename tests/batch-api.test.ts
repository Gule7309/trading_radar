import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type { BatchResearchResult } from "../src/research/batch-service.js";
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
  async run(candidates: CandidatePacket[]): Promise<BatchResearchResult> {
    return {
      researched: candidates.length,
      rejectedOrSkipped: [],
      top: [],
    };
  }
}

async function start() {
  const server = createResearchApi(new ResearchFixture(), {
    batch: new BatchFixture(),
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("batch research API", () => {
  it("accepts CandidatePacket arrays", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/research/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidates: [
          {
            candidateId: "c1",
            ticker: "2330",
            companyName: "台積電",
            market: "TWSE",
            industry: "半導體業",
            asOf: "2026-10-10",
            quantScore: 0.9,
            quantSignals: [],
            hardConstraintsPassed: true,
          },
        ],
        options: {
          topK: 5,
          researchLimit: 10,
          concurrency: 2,
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as BatchResearchResult;
    expect(body.researched).toBe(1);
  });

  it("rejects malformed candidate entries", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/research/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidates: [{ ticker: "2330" }],
      }),
    });

    expect(response.status).toBe(400);
  });
});
