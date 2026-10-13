import { describe, expect, it } from "vitest";
import { DefaultToolRouter } from "../src/tools/default-tool-router.js";
import type { SearchProvider } from "../src/infra/search/provider.js";
import type {
  MaterialDisclosureFetcher,
  MonthlyRevenueFetcher,
  SourceFetcher,
} from "../src/tools/default-tool-router.js";

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

const materialDisclosureFetcher: MaterialDisclosureFetcher = async () => ({
  records: [],
  sources: [],
  attempts: 1,
  durationMs: 5,
});

const sourceFetcher: SourceFetcher = async (url) => ({
  sourceId: "fetched",
  url,
  title: "Fetched article",
  publisher: "example.com",
  sourceType: "OTHER",
  sourceTier: 3,
  retrievedAt: "2026-10-07T00:00:00Z",
  snippet: "Full source text.",
  contentHash: "fetched",
  untrustedContent: true,
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
    expect(observation.sources?.[0]?.sourceTier).toBe(3);
  });

  it("fetches a known source through the guarded fetcher", async () => {
    const router = new DefaultToolRouter(
      searchProvider,
      monthlyRevenueFetcher,
      materialDisclosureFetcher,
      sourceFetcher,
    );

    const observation = await router.execute(
      {
        type: "FETCH_SOURCE",
        sourceId: "news-source",
        purpose: "retrieve full text",
      },
      {
        ...context,
        sources: [
          {
            sourceId: "news-source",
            url: "https://example.com/full",
            title: "Search result",
            publisher: "Example Finance",
            sourceType: "NEWS",
            sourceTier: 2,
            publishedAt: "2026-10-06",
            retrievedAt: "2026-10-07T00:00:00Z",
            ticker: "2330",
            snippet: "Search snippet",
            contentHash: "snippet",
            untrustedContent: true,
          },
        ],
      },
    );

    expect(observation.outcome).toBe("SUCCESS");
    expect(observation.sources?.[0]?.sourceId).toBe("news-source-full");
    expect(observation.sources?.[0]?.sourceType).toBe("NEWS");
    expect(observation.sources?.[0]?.sourceTier).toBe(2);
  });
});
