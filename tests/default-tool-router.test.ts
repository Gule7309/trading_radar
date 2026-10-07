import { describe, expect, it } from "vitest";
import { DefaultToolRouter } from "../src/tools/default-tool-router.js";
import type { SearchProvider } from "../src/infra/search/provider.js";
import type { MonthlyRevenueFetcher } from "../src/tools/default-tool-router.js";

const searchProvider: SearchProvider = {
  name: "fixture",
  async search() {
    return [
      {
        title: "Risk update",
        url: "https://example.com/risk",
        publisher: "Example Finance",
        publishedAt: "2026-10-06",
        snippet: "Input costs may pressure margins.",
      },
    ];
  },
};

const monthlyRevenueFetcher: MonthlyRevenueFetcher = async (market, ticker) => ({
  record: {
    market,
    ticker,
    companyName: "Fixture Company",
    period: "2026-09",
    monthlyRevenueTwdThousands: 1000000,
    yearOverYearPercent: 35,
  },
  source: {
    sourceId: "official-fixture",
    url: "https://example.com/official",
    title: "Official fixture",
    publisher: "TWSE",
    sourceType: market,
    sourceTier: 1,
    publishedAt: "2026-10-05",
    dataPeriod: "2026-09",
    retrievedAt: "2026-10-07T00:00:00Z",
    ticker,
    snippet: "YoY 35%",
    contentHash: "fixture",
    metadata: {
      yearOverYearPercent: 35,
      monthlyRevenueTwdThousands: 1000000,
    },
    untrustedContent: true,
  },
  attempts: 1,
  durationMs: 10,
});

const context = {
  candidate: {
    candidateId: "c1",
    ticker: "2330",
    companyName: "Fixture Company",
    market: "TWSE" as const,
    industry: "Semiconductors",
    asOf: "2026-10-07",
    quantScore: 0.9,
    quantSignals: [],
    hardConstraintsPassed: true,
  },
};

describe("DefaultToolRouter", () => {
  it("routes official monthly revenue and emits a known fact", async () => {
    const router = new DefaultToolRouter(searchProvider, monthlyRevenueFetcher);

    const observation = await router.execute(
      {
        type: "SEARCH_OFFICIAL",
        dataset: "MONTHLY_REVENUE",
        purpose: "verify",
        query: "2330 monthly revenue",
        evidenceNeed: "official revenue",
      },
      context,
    );

    expect(observation.outcome).toBe("SUCCESS");
    expect(observation.sources?.[0]?.sourceTier).toBe(1);
    expect(observation.knownFacts?.[0]?.text).toContain("YoY=35%");
  });

  it("routes news search through the injected provider", async () => {
    const router = new DefaultToolRouter(searchProvider, monthlyRevenueFetcher);

    const observation = await router.execute(
      {
        type: "SEARCH_NEWS",
        purpose: "risk discovery",
        query: "Fixture Company risk",
      },
      context,
    );

    expect(observation.outcome).toBe("SUCCESS");
    expect(observation.sources?.[0]?.sourceType).toBe("NEWS");
    expect(observation.sources?.[0]?.sourceTier).toBe(2);
  });
});
