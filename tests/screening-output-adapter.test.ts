import { describe, expect, it } from "vitest";
import {
  ScreeningOutputV1Schema,
  screeningOutputToCandidatePackets,
} from "../src/domain/screening-output.js";
import { hydrateUpstreamEvidence } from "../src/evidence/upstream-evidence.js";
import { enforceControllerPolicy } from "../src/harness/controller-policy.js";
import type { ResearchState } from "../src/domain/research.js";

function screeningFixture() {
  return ScreeningOutputV1Schema.parse({
    schemaVersion: "screening-output-v1",
    run: {
      runId: "20261010-001",
      runAt: "2026-10-10T12:00:00+08:00",
      asOfDate: "2026-10-10",
      priceAsOf: "2026-10-08",
      revenueAsOf: "2026-08",
      revenueCoverage: 1,
      financialAsOf: "2026Q2",
      financialCoverage: 0.99,
      configVersion: "v1",
      dataVersion: "ds-test",
      sourceSnapshot: "sha256:test",
      status: "success",
      profile: {},
      config: {},
      counts: {
        universe: 100,
        baseEligible: 50,
        ranked: 20,
      },
    },
    candidates: [
      {
        stockId: "2330",
        stockName: "台積電",
        market: "TWSE",
        industry: "半導體業",
        percentileScope: "industry",
        metrics: {
          revenueYoY: {
            value: 53.32,
            percentile: 0.95,
            evidenceId: "ev-001",
          },
          operatingMargin: {
            value: 50.1,
            percentile: 0.9,
            evidenceId: "ev-002",
          },
          debtRatio: {
            value: 30.2,
            percentile: 0.8,
            evidenceId: "ev-003",
          },
          avgTurnover20d: {
            value: 9_000_000_000,
            percentile: null,
            evidenceId: "ev-004",
          },
        },
        riskFlags: ["notice"],
        quantScore: 0.91,
        rank: 1,
      },
    ],
    evidence: [
      {
        id: "ev-001",
        stockId: "2330",
        metric: "revenueYoY",
        claim: "2026-08 月營收年增 53.3%",
        value: 53.32,
        unit: "%",
        dataset: "monthly_revenue",
        source: "MOPS",
        sourceUrl: "https://mopsov.twse.com.tw/nas/t21/",
        referenceUrl: null,
        dataAsOf: "2026-08",
        windowStart: "2025-08",
        windowEnd: "2026-08",
        fetchedAt: "2026-10-10T01:00:00+08:00",
        fetchedAtScope: "dataset",
        calculation: {
          formula: "revenue / priorYearRevenue - 1",
          method: "independent cross-check",
          inputs: {},
        },
        verificationStatus: "verified",
      },
      {
        id: "ev-002",
        stockId: "2330",
        metric: "operatingMargin",
        claim: "2026Q2 單季營業利益率 50.1%",
        value: 50.1,
        unit: "%",
        dataset: "quarterly_financials",
        source: "MOPS",
        sourceUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04",
        referenceUrl: null,
        dataAsOf: "2026Q2",
        windowStart: "2026Q2",
        windowEnd: "2026Q2",
        fetchedAt: "2026-10-10T01:00:00+08:00",
        fetchedAtScope: "row",
        calculation: {
          formula: "operating_income_quarter / revenue_quarter",
          method: "derived from complete inputs",
          inputs: {},
        },
        verificationStatus: "verified",
      },
      {
        id: "ev-003",
        stockId: "2330",
        metric: "debtRatio",
        claim: "2026Q2 負債比 30.2%",
        value: 30.2,
        unit: "%",
        dataset: "quarterly_financials",
        source: "MOPS",
        sourceUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t163sb05",
        referenceUrl: null,
        dataAsOf: "2026Q2",
        windowStart: "2026Q2",
        windowEnd: "2026Q2",
        fetchedAt: "2026-10-10T01:00:00+08:00",
        fetchedAtScope: "row",
        calculation: {
          formula: "total_liabilities / total_assets",
          method: "derived from complete inputs",
          inputs: {},
        },
        verificationStatus: "verified",
      },
      {
        id: "ev-004",
        stockId: "2330",
        metric: "avgTurnover20d",
        claim: "近 20 個交易日日均成交金額 90 億元",
        value: 9_000_000_000,
        unit: "TWD",
        dataset: "daily_prices",
        source: "TWSE",
        sourceUrl: "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX",
        referenceUrl: null,
        dataAsOf: "2026-10-08",
        windowStart: "2026-09-09",
        windowEnd: "2026-10-08",
        fetchedAt: "2026-10-10T01:00:00+08:00",
        fetchedAtScope: "dataset",
        calculation: {
          formula: "AVG(turnover)",
          method: "20 complete trading days",
          inputs: {},
        },
        verificationStatus: "verified",
      },
    ],
    excluded: {
      total: 80,
      byStage: { base: 50, constraint: 30 },
      byReason: { min_liquidity: 30 },
    },
  });
}

describe("screening-output-v1 adapter", () => {
  it("maps A candidates and evidence into B CandidatePacket without losing lineage", () => {
    const [candidate] = screeningOutputToCandidatePackets(
      screeningFixture(),
    );

    expect(candidate).toMatchObject({
      candidateId: "20261010-001:2330",
      ticker: "2330",
      companyName: "台積電",
      market: "TWSE",
      industry: "半導體業",
      quantScore: 0.91,
      hardConstraintsPassed: true,
      riskFlags: ["notice"],
      upstreamRun: {
        runId: "20261010-001",
        dataVersion: "ds-test",
      },
    });

    expect(candidate?.quantSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "revenue_yoy",
          value: 53.32,
          period: "2026-08",
          industryPercentile: 95,
        }),
        expect.objectContaining({
          metric: "operating_margin",
          value: 50.1,
          period: "2026Q2",
          industryPercentile: 90,
        }),
      ]),
    );
    expect(candidate?.upstreamEvidence).toHaveLength(4);
  });

  it("hydrates verified upstream evidence as Tier-1 sources and risk questions", () => {
    const [candidate] = screeningOutputToCandidatePackets(
      screeningFixture(),
    );
    if (!candidate) throw new Error("fixture failed");

    const hydrated = hydrateUpstreamEvidence(candidate);

    expect(hydrated.sources).toHaveLength(4);
    expect(
      hydrated.sources.every((source) => source.sourceTier === 1),
    ).toBe(true);
    expect(
      hydrated.sources.find(
        (source) => source.metadata?.upstreamMetric === "revenueYoY",
      )?.metadata?.yearOverYearPercent,
    ).toBe(53.32);
    expect(hydrated.openQuestions[0]?.text).toMatch(/notice-stock/);
  });

  it("prevents duplicate monthly-revenue research when A already verified it", () => {
    const [candidate] = screeningOutputToCandidatePackets(
      screeningFixture(),
    );
    if (!candidate) throw new Error("fixture failed");

    const hydrated = hydrateUpstreamEvidence(candidate);
    const state: ResearchState = {
      runId: "run",
      candidate,
      phase: "DISCOVERY",
      knownFacts: hydrated.knownFacts,
      openQuestions: hydrated.openQuestions,
      sources: hydrated.sources,
      claims: [],
      evidence: [],
      risks: [],
      conflicts: [],
      budget: {
        stepsUsed: 0,
        maxSteps: 12,
        searchesUsed: 0,
        maxSearches: 5,
        skepticRounds: 0,
        maxSkepticRounds: 1,
        startedAt: "2026-10-10T00:00:00Z",
      },
      researchTrace: [],
      evidenceDirty: true,
      invalidationConditions: [],
    };

    const decision = enforceControllerPolicy(state, {
      reasonCode: "MODEL_DUPLICATE_LOOKUP",
      summary: "Search revenue again.",
      action: {
        type: "SEARCH_OFFICIAL",
        dataset: "MONTHLY_REVENUE",
        purpose: "revenue",
        query: "2330",
        evidenceNeed: "revenue",
      },
    });

    expect(decision.action.type).toBe("VERIFY");
    expect(decision.reasonCode).toBe("POLICY_FORCE_VERIFY");
  });

  it("rejects unverified upstream evidence instead of silently trusting it", () => {
    const fixture = screeningFixture();
    fixture.evidence[0]!.verificationStatus = "conflict";

    expect(() =>
      screeningOutputToCandidatePackets(fixture),
    ).toThrow(/SCREENING_ADAPTER_UNVERIFIED_EVIDENCE/);
  });
});
