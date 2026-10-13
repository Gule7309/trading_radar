import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryResearchRunStore,
  type StoredResearchRun,
} from "../src/research/store.js";
import { SqliteResearchRunStore } from "../src/research/sqlite-store.js";

const sqliteStores: SqliteResearchRunStore[] = [];

afterEach(() => {
  for (const store of sqliteStores.splice(0)) {
    store.close();
  }
});

function fixture(runId: string, createdAt: string): StoredResearchRun {
  return {
    runId,
    ticker: "2330",
    createdAt,
    candidate: {
      candidateId: "c1",
      ticker: "2330",
      companyName: "台積電",
      market: "TWSE",
      industry: "半導體業",
      asOf: "2026-10-07",
      quantScore: 0.9,
      quantSignals: [],
      hardConstraintsPassed: true,
    },
    result: {
      runId,
      ticker: "2330",
      companyName: "台積電",
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
      startedAt: createdAt,
      completedAt: createdAt,
    },
  };
}

describe("research run stores", () => {
  it("stores and orders runs in memory", async () => {
    const store = new InMemoryResearchRunStore();
    await store.save(fixture("run-1", "2026-10-07T00:00:00Z"));
    await store.save(fixture("run-2", "2026-10-08T00:00:00Z"));

    expect((await store.get("run-1"))?.runId).toBe("run-1");
    expect(
      (await store.listByTicker("2330")).map((run) => run.runId),
    ).toEqual(["run-2", "run-1"]);
  });

  it("persists research runs in SQLite", async () => {
    const store = new SqliteResearchRunStore(":memory:");
    sqliteStores.push(store);

    await store.save(fixture("run-1", "2026-10-07T00:00:00Z"));
    await store.save(fixture("run-2", "2026-10-08T00:00:00Z"));

    expect((await store.get("run-2"))?.result.stopReason).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    expect(await store.listByTicker("2330")).toHaveLength(2);
  });
});
