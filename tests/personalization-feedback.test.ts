import { describe, expect, it } from "vitest";
import type { CandidatePacket } from "../src/domain/candidate.js";
import type { ResearchResult } from "../src/domain/research.js";
import type { StoredResearchRun } from "../src/research/store.js";
import { InMemoryPersonalizationStore } from "../src/personalization/store.js";
import { PersonalizationService } from "../src/personalization/service.js";
import {
  personalizedQuantScore,
  personalizeCandidates,
} from "../src/personalization/ranking.js";

function candidate(
  id: string,
  ticker: string,
  growth: number,
  profitability: number,
  safety: number,
): CandidatePacket {
  return {
    candidateId: id,
    ticker,
    companyName: ticker,
    market: "TWSE",
    industry: "Test",
    asOf: "2026-10-11",
    quantScore: (growth + profitability + safety) / 300,
    quantSignals: [
      {
        metric: "revenue_yoy",
        value: 10,
        period: "2026-08",
        industryPercentile: growth,
      },
      {
        metric: "operating_margin",
        value: 20,
        period: "2026Q2",
        industryPercentile: profitability,
      },
      {
        metric: "debt_ratio",
        value: 30,
        period: "2026Q2",
        industryPercentile: safety,
      },
    ],
    hardConstraintsPassed: true,
  };
}

function result(item: CandidatePacket): ResearchResult {
  return {
    runId: `run-${item.ticker}`,
    ticker: item.ticker,
    companyName: item.companyName,
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis: "Verified thesis",
    keyReasons: ["Reason"],
    claims: [],
    risks: [
      {
        title: "Risk",
        explanation: "Risk",
        sourceIds: ["s"],
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
    startedAt: "2026-10-11T00:00:00Z",
    completedAt: "2026-10-11T00:00:01Z",
  };
}

describe("feedback loop", () => {
  it("adjusts only soft preferences and changes the next ranking", async () => {
    // Equal under default balanced weights; one bounded growth-feedback
    // adjustment should make the growth-heavy candidate rank first.
    const growthStock = candidate("a", "1111", 90, 50, 50);
    const qualityStock = candidate("b", "2222", 50, 70, 70);
    const run: StoredResearchRun = {
      runId: "run-1111",
      ticker: "1111",
      candidate: growthStock,
      result: result(growthStock),
      createdAt: "2026-10-11T00:00:00Z",
    };

    const service = new PersonalizationService(
      new InMemoryPersonalizationStore(),
      {
        async get(runId: string) {
          return runId === run.runId ? run : null;
        },
      },
    );

    const before = await service.getOrCreateProfile("u1");
    const beforeHard = structuredClone(before.hardConstraints);
    const beforeGrowth = before.softPreferences.growth;

    const recorded = await service.recordFeedback("u1", {
      runId: "run-1111",
      action: "SAVE",
      reasons: ["GROWTH"],
    });

    expect(recorded.profile.hardConstraints).toEqual(beforeHard);
    expect(recorded.profile.softPreferences.growth).toBeGreaterThan(
      beforeGrowth,
    );
    expect(recorded.preferenceChange.delta.growth).toBeGreaterThan(0);

    const personalized = personalizeCandidates(
      [growthStock, qualityStock],
      recorded.profile,
    );

    expect(
      personalizedQuantScore(growthStock, recorded.profile),
    ).toBeGreaterThan(
      personalizedQuantScore(qualityStock, recorded.profile),
    );
    expect(personalized[0]?.hardConstraintsPassed).toBe(true);
  });

  it("records feedback even when a reason is not mapped to automatic weights", async () => {
    const item = candidate("a", "1111", 50, 50, 50);
    const run: StoredResearchRun = {
      runId: "run-1111",
      ticker: "1111",
      candidate: item,
      result: result(item),
      createdAt: "2026-10-11T00:00:00Z",
    };

    const service = new PersonalizationService(
      new InMemoryPersonalizationStore(),
      {
        async get() {
          return run;
        },
      },
    );

    const recorded = await service.recordFeedback("u1", {
      runId: "run-1111",
      action: "SKIP",
      reasons: ["VALUATION_CONCERN"],
    });

    expect(recorded.preferenceChange.reason).toMatch(
      /no automatic weight mapping/,
    );
  });
});
