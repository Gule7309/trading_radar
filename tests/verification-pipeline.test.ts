import { describe, expect, it } from "vitest";
import type { ResearchState } from "../src/domain/research.js";
import {
  DefaultVerificationPipeline,
} from "../src/evidence/verification-pipeline.js";
import type {
  ClaimExtractor,
  ExtractedClaim,
} from "../src/evidence/claim-extractor.js";
import type {
  TextualVerifier,
  TextualVerificationResult,
} from "../src/evidence/textual-verifier.js";
import type { RiskExtractor } from "../src/evidence/risk-extractor.js";

class FixtureClaimExtractor implements ClaimExtractor {
  async extract(): Promise<ExtractedClaim[]> {
    return [
      {
        text: "2026-09 monthly revenue YoY was 35%.",
        category: "FINANCIAL",
        importance: "CORE",
        sourceIds: ["s-official"],
      },
    ];
  }
}

class FixtureTextualVerifier implements TextualVerifier {
  async verify(): Promise<TextualVerificationResult> {
    return {
      result: "SUPPORTED",
      reason: "The official source directly states the metric.",
      evidenceSpan: "YoY 35%",
    };
  }
}


class EmptyRiskExtractor implements RiskExtractor {
  async extract() {
    return [];
  }
}

class FixtureRiskExtractor implements RiskExtractor {
  async extract() {
    return [
      {
        riskId: "risk-1",
        title: "Margin pressure",
        explanation: "A current source reports margin pressure.",
        sourceIds: ["s-news"],
      },
    ];
  }
}

function state(): ResearchState {
  return {
    runId: "run-1",
    candidate: {
      candidateId: "c1",
      ticker: "2330",
      companyName: "Fixture Company",
      market: "TWSE",
      industry: "Semiconductors",
      asOf: "2026-10-07",
      quantScore: 0.9,
      quantSignals: [],
      hardConstraintsPassed: true,
      riskFlags: ["notice"],
    },
    phase: "VERIFY",
    knownFacts: [],
    openQuestions: [],
    sources: [
      {
        sourceId: "s-official",
        url: "https://example.com/official",
        title: "Official revenue",
        publisher: "TWSE",
        sourceType: "TWSE",
        sourceTier: 1,
        publishedAt: "2026-10-05",
        dataPeriod: "2026-09",
        retrievedAt: "2026-10-07T00:00:00Z",
        ticker: "2330",
        snippet: "YoY 35%",
        contentHash: "official",
        untrustedContent: true,
      },
      {
        sourceId: "s-news",
        url: "https://example.com/news",
        title: "Risk article",
        publisher: "Example",
        sourceType: "NEWS",
        sourceTier: 2,
        publishedAt: "2026-10-06",
        retrievedAt: "2026-10-07T00:00:00Z",
        ticker: "2330",
        snippet:
          "Fixture Company was listed as a notice stock after abnormal trading; the company published self-reported financial results.",
        contentHash: "news",
        untrustedContent: true,
      },
    ],
    claims: [],
    evidence: [],
    risks: [],
    conflicts: [],
    budget: {
      stepsUsed: 2,
      maxSteps: 8,
      searchesUsed: 2,
      maxSearches: 4,
      skepticRounds: 0,
      maxSkepticRounds: 1,
      startedAt: "2026-10-07T00:00:00Z",
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

describe("DefaultVerificationPipeline", () => {
  it("builds supported claims, evidence links, and grounded risks", async () => {
    const current = state();
    const pipeline = new DefaultVerificationPipeline(
      new FixtureClaimExtractor(),
      new FixtureTextualVerifier(),
      new FixtureRiskExtractor(),
    );

    await pipeline.run(current);

    expect(current.claims).toHaveLength(1);
    expect(current.claims[0]?.status).toBe("SUPPORTED");
    expect(current.evidence).toHaveLength(1);
    expect(current.evidence[0]?.sourceId).toBe("s-official");
    expect(current.risks).toHaveLength(2);
    expect(current.risks[0]?.sourceIds).toEqual(["s-news"]);
    expect(
      current.risks.some((risk) =>
        risk.addressesRiskFlags?.includes("notice"),
      ),
    ).toBe(true);
    expect(current.conflicts).toHaveLength(0);
  });
  it.each([false, true])("preserves grounded risks across empty extraction passes (notice flag: %s)", async (hasNoticeFlag) => {
    const current = state();
    current.candidate.riskFlags = hasNoticeFlag ? ["notice"] : [];
    current.risks = [
      {
        riskId: "risk-existing",
        title: "Notice-stock volatility",
        explanation: "A fetched current source grounds the notice-stock risk.",
        sourceIds: ["s-news"],
        addressesRiskFlags: [],
      },
    ];

    const pipeline = new DefaultVerificationPipeline(
      new FixtureClaimExtractor(),
      new FixtureTextualVerifier(),
      new EmptyRiskExtractor(),
    );

    const existingRisk = structuredClone(current.risks[0]);
    await pipeline.run(current);

    const expectedRisks = [
      existingRisk,
      ...(hasNoticeFlag ? [expect.objectContaining({
        riskId: "risk-upstream-notice-s-news",
        sourceIds: ["s-news"],
        addressesRiskFlags: ["notice"],
      })] : []),
    ];
    expect(current.risks).toEqual(expectedRisks);

    // A repeated VERIFY must preserve both risks without duplicating the
    // deterministic notice risk, even when the model extracts nothing.
    await pipeline.run(current);
    expect(current.risks).toEqual(expectedRisks);
  });

});
