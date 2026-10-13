import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ResearchResult } from "../src/domain/research.js";
import type { StoredResearchRun } from "../src/research/store.js";
import {
  createResearchApi,
  type AdminApiService,
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

class AdminFixture implements AdminApiService {
  async status() {
    return {
      llmProvider: "mock",
      modelCredentialConfigured: false,
      taiwanDataConfigured: true,
    };
  }

  async modelCheck() {
    return {
      ok: true,
      provider: "mock",
      model: "mock",
      latencyMs: 0,
    };
  }

  async dataStatus() {
    return {
      configured: true,
      tables: { daily_prices: { rows: 123 } },
      datasetStatus: [],
    };
  }
}

async function start() {
  const server = createResearchApi(new ResearchFixture(), {
    admin: new AdminFixture(),
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("admin API", () => {
  it("exposes safe runtime status without credentials", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/admin/status`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.llmProvider).toBe("mock");
    expect(body).not.toHaveProperty("apiKey");
  });

  it("supports explicit model and data-source checks", async () => {
    const base = await start();

    const model = await fetch(`${base}/api/admin/model-check`, {
      method: "POST",
    });
    expect(model.status).toBe(200);
    expect((await model.json()) as { ok: boolean }).toMatchObject({
      ok: true,
    });

    const data = await fetch(`${base}/api/admin/data-status`);
    expect(data.status).toBe(200);
    expect(
      (await data.json()) as { configured: boolean },
    ).toMatchObject({ configured: true });
  });
});
