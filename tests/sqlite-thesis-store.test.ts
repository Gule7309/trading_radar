import { afterEach, describe, expect, it } from "vitest";
import { SqliteThesisStore } from "../src/thesis/sqlite-store.js";
import type { ThesisVersion } from "../src/thesis/types.js";

const stores: SqliteThesisStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
});

describe("SqliteThesisStore", () => {
  it("persists ordered thesis versions and events", async () => {
    const store = new SqliteThesisStore(":memory:");
    stores.push(store);

    const version: ThesisVersion = {
      thesisId: "thesis-1",
      ticker: "2330",
      version: 1,
      thesisText: "Verified thesis",
      status: "ACTIVE",
      coreClaims: [],
      supportingClaims: [],
      risks: [],
      invalidationConditions: ["Revenue growth turns negative."],
      createdAt: "2026-10-07T00:00:00Z",
    };

    await store.saveVersion(version);
    await store.saveVersion({
      ...version,
      version: 2,
      status: "WEAKENED",
      createdAt: "2026-11-07T00:00:00Z",
    });

    await store.appendEvent({
      eventId: "event-1",
      thesisId: "thesis-1",
      ticker: "2330",
      occurredAt: "2026-11-07T00:00:00Z",
      eventType: "MONTHLY_REVENUE",
      summary: "New monthly revenue available.",
      sourceIds: ["s1"],
    });

    expect((await store.getLatest("thesis-1"))?.version).toBe(2);
    expect(
      (await store.listVersions("thesis-1")).map((item) => item.version),
    ).toEqual([1, 2]);
    expect(await store.listEvents("thesis-1")).toHaveLength(1);
  });
});
