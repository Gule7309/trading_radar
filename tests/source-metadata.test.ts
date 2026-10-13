import { describe, expect, it } from "vitest";
import { extractPublishedAt } from "../src/tools/web/fetch-source.js";
import { assessSourceFreshness } from "../src/evidence/freshness.js";
import type { SourceDocument } from "../src/domain/research.js";

function source(publishedAt?: string): SourceDocument {
  return {
    sourceId: "s1",
    url: "https://example.com/article",
    title: "Article",
    publisher: "example.com",
    sourceType: "NEWS",
    sourceTier: 2,
    publishedAt,
    retrievedAt: "2026-10-07T00:00:00Z",
    snippet: "Evidence",
    contentHash: "hash",
    untrustedContent: true,
  };
}

describe("source metadata", () => {
  it("extracts article:published_time metadata", () => {
    const html =
      '<html><head><meta property="article:published_time" content="2026-10-01T08:30:00+08:00"></head></html>';

    expect(extractPublishedAt(html)).toBe("2026-10-01T00:30:00.000Z");
  });

  it("extracts JSON-LD datePublished metadata", () => {
    const html =
      '<script type="application/ld+json">{"datePublished":"2026-09-30"}</script>';

    expect(extractPublishedAt(html)).toBe("2026-09-30T00:00:00.000Z");
  });

  it("flags stale sources deterministically", () => {
    const result = assessSourceFreshness(
      source("2026-01-01T00:00:00Z"),
      "2026-10-07T00:00:00Z",
      90,
    );

    expect(result.reason).toBe("STALE");
    expect(result.fresh).toBe(false);
  });

  it("does not pretend freshness is known when publication time is missing", () => {
    const result = assessSourceFreshness(
      source(),
      "2026-10-07T00:00:00Z",
      90,
    );

    expect(result.known).toBe(false);
    expect(result.reason).toBe("MISSING_PUBLISHED_AT");
  });
});
