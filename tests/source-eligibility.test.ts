import { describe, expect, it } from "vitest";
import { assessSourceEligibility } from "../src/evidence/source-eligibility.js";

const candidate = {
  candidateId: "c1",
  ticker: "2330",
  companyName: "台積電",
  market: "TWSE" as const,
  industry: "半導體業",
  asOf: "2026-10-10",
  quantScore: 0.9,
  quantSignals: [],
  hardConstraintsPassed: true,
};

describe("source eligibility", () => {
  it("accepts current direct news mentioning the company", () => {
    const result = assessSourceEligibility(
      {
        sourceId: "s1",
        url: "https://example.com",
        title: "台積電法說展望",
        publisher: "example.com",
        sourceType: "NEWS",
        sourceTier: 2,
        publishedAt: "2026-10-01",
        retrievedAt: "2026-10-10T00:00:00Z",
        snippet: "台積電 2330 最新營運消息",
        contentHash: "x",
        untrustedContent: true,
      },
      candidate,
    );

    expect(result.eligible).toBe(true);
  });

  it("rejects a similar but wrong entity", () => {
    const result = assessSourceEligibility(
      {
        sourceId: "s2",
        url: "https://example.com",
        title: "台達電營運消息",
        publisher: "example.com",
        sourceType: "NEWS",
        sourceTier: 2,
        publishedAt: "2026-10-01",
        retrievedAt: "2026-10-10T00:00:00Z",
        snippet: "台達電 2308 最新營運消息",
        contentHash: "y",
        untrustedContent: true,
      },
      candidate,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("ENTITY_MISMATCH");
  });

  it("rejects stale news", () => {
    const result = assessSourceEligibility(
      {
        sourceId: "s3",
        url: "https://example.com",
        title: "台積電歷史消息",
        publisher: "example.com",
        sourceType: "NEWS",
        sourceTier: 2,
        publishedAt: "2025-01-01",
        retrievedAt: "2026-10-10T00:00:00Z",
        snippet: "台積電 2330 舊消息",
        contentHash: "z",
        untrustedContent: true,
      },
      candidate,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("STALE");
  });
});
