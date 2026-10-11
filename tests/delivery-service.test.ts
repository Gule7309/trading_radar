import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import {
  ScreeningOutputV1Schema,
  type ScreeningOutputV1,
} from "../src/domain/screening-output.js";
import type { ResearchResult } from "../src/domain/research.js";
import { BatchResearchService } from "../src/research/batch-service.js";
import { InMemoryPersonalizationStore } from "../src/personalization/store.js";
import { PersonalizationService } from "../src/personalization/service.js";
import { InMemoryNotificationStore } from "../src/notifications/store.js";
import { NotificationService } from "../src/notifications/service.js";
import { InMemoryDeliveryRunStore } from "../src/delivery/store.js";
import type { ScreeningProvider } from "../src/delivery/screening-provider.js";
import { DailyDeliveryService } from "../src/delivery/service.js";

class FixtureScreening implements ScreeningProvider {
  calls = 0;

  async screen(): Promise<ScreeningOutputV1> {
    this.calls += 1;
    const url = new URL(
      "../packages/taiwan_data/tests/fixtures/sample_screening_output.json",
      import.meta.url,
    );
    return ScreeningOutputV1Schema.parse(
      JSON.parse(await readFile(url, "utf8")),
    );
  }

  async inspectTicker(): Promise<ScreeningOutputV1> {
    return this.screen();
  }
}

function researchResult(
  candidate: CandidatePacket,
  runId: string,
): ResearchResult {
  const now = new Date().toISOString();
  return {
    runId,
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified thesis",
    keyReasons: ["Reason"],
    claims: [
      {
        claimId: `claim-${candidate.ticker}`,
        text: "Claim",
        status: "SUPPORTED",
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
}

describe("DailyDeliveryService", () => {
  it("creates one daily result + notification and reuses it on the same local date", async () => {
    const screening = new FixtureScreening();
    let calls = 0;
    const batch = new BatchResearchService({
      async run(candidate: CandidatePacket) {
        calls += 1;
        return researchResult(candidate, `run-${calls}`);
      },
    });

    const personalization = new PersonalizationService(
      new InMemoryPersonalizationStore(),
    );
    await personalization.getOrCreateProfile("u1");

    const notificationStore =
      new InMemoryNotificationStore();
    const notifications = new NotificationService(
      notificationStore,
    );

    const delivery = new DailyDeliveryService(
      screening,
      personalization,
      batch,
      notifications,
      new InMemoryDeliveryRunStore(),
    );

    const first = await delivery.runForUser("u1", {
      force: true,
      screeningLimit: 2,
      researchLimit: 1,
      topK: 1,
      concurrency: 1,
    });

    expect(first.reused).toBe(false);
    expect(screening.calls).toBe(1);
    expect((await notifications.list("u1"))[0]?.type).toBe(
      "DAILY_RESEARCH_READY",
    );

    const second = await delivery.runForUser("u1");
    expect(second.reused).toBe(true);
    expect(screening.calls).toBe(1);
  });
});
