import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type { StoredResearchRun } from "../src/research/store.js";
import type {
  ThesisEvent,
  ThesisVersion,
} from "../src/thesis/types.js";
import {
  createResearchApi,
  type ResearchApiService,
  type ThesisApiService,
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

const candidate: CandidatePacket = {
  candidateId: "c1",
  ticker: "2330",
  companyName: "台積電",
  market: "TWSE",
  industry: "半導體業",
  asOf: "2026-10-10",
  quantScore: 0.9,
  quantSignals: [],
  hardConstraintsPassed: true,
};

function researchResult(): ResearchResult {
  return {
    runId: "run-1",
    ticker: "2330",
    companyName: "台積電",
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified thesis.",
    keyReasons: ["Official growth evidence"],
    claims: [
      {
        claimId: "c1",
        text: "Revenue growth is positive.",
        status: "SUPPORTED",
        sourceIds: ["s1"],
      },
    ],
    risks: [
      {
        title: "Margin pressure",
        explanation: "Margin pressure is a monitorable risk.",
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
    startedAt: "2026-10-10T00:00:00Z",
    completedAt: "2026-10-10T00:00:01Z",
  };
}

class ResearchFixture implements ResearchApiService {
  async run(): Promise<ResearchResult> {
    return researchResult();
  }

  async get(): Promise<StoredResearchRun | null> {
    return null;
  }

  async listByTicker(): Promise<StoredResearchRun[]> {
    return [];
  }
}

class ThesisFixture implements ThesisApiService {
  private version = 1;

  async create(
    _candidate: CandidatePacket,
    thesisId = "thesis-1",
  ): Promise<{ researchRunId: string; thesis: ThesisVersion }> {
    return {
      researchRunId: "run-1",
      thesis: this.make(thesisId),
    };
  }

  async recheck(
    thesisId: string,
  ): Promise<{ researchRunId: string; thesis: ThesisVersion }> {
    this.version += 1;
    return {
      researchRunId: "run-2",
      thesis: {
        ...this.make(thesisId),
        version: this.version,
        status: "UNCHANGED",
      },
    };
  }

  async getLatest(thesisId: string): Promise<ThesisVersion | null> {
    return this.make(thesisId);
  }

  async listVersions(thesisId: string): Promise<ThesisVersion[]> {
    return [this.make(thesisId)];
  }

  async listEvents(thesisId: string): Promise<ThesisEvent[]> {
    return [
      {
        eventId: "event-1",
        thesisId,
        ticker: "2330",
        occurredAt: "2026-10-10T00:00:01Z",
        eventType: "NEW_RESEARCH_RESULT",
        summary: "created",
        sourceIds: [],
      },
    ];
  }

  private make(thesisId: string): ThesisVersion {
    return {
      thesisId,
      ticker: "2330",
      version: this.version,
      thesisText: "Verified thesis.",
      status: "ACTIVE",
      coreClaims: [],
      supportingClaims: [],
      risks: [],
      invalidationConditions: ["Revenue growth turns negative."],
      createdAt: "2026-10-10T00:00:01Z",
    };
  }
}

async function start() {
  const server = createResearchApi(new ResearchFixture(), {
    corsOrigin: "http://localhost:5173",
    theses: new ThesisFixture(),
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("thesis API", () => {
  it("creates and reads a thesis", async () => {
    const base = await start();

    const created = await fetch(`${base}/api/theses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate,
        thesisId: "thesis-1",
      }),
    });

    expect(created.status).toBe(200);

    const read = await fetch(`${base}/api/theses/thesis-1`);
    const body = (await read.json()) as ThesisVersion;

    expect(body.thesisId).toBe("thesis-1");
    expect(body.version).toBe(1);
  });

  it("rechecks and exposes thesis history", async () => {
    const base = await start();

    const rechecked = await fetch(`${base}/api/theses/thesis-1/recheck`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidate,
        eventType: "MONTHLY_REVENUE",
      }),
    });

    expect(rechecked.status).toBe(200);

    const versions = await fetch(
      `${base}/api/theses/thesis-1/versions`,
    );
    const versionBody = (await versions.json()) as {
      versions: ThesisVersion[];
    };
    expect(versionBody.versions).toHaveLength(1);

    const events = await fetch(`${base}/api/theses/thesis-1/events`);
    const eventBody = (await events.json()) as { events: ThesisEvent[] };
    expect(eventBody.events[0]?.eventType).toBe("NEW_RESEARCH_RESULT");
  });
});
