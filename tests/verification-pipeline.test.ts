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
        snippet: "Margin pressure was reported.",
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
    expect(current.risks).toHaveLength(1);
    expect(current.risks[0]?.sourceIds).toEqual(["s-news"]);
    expect(current.conflicts).toHaveLength(0);
  });
});
