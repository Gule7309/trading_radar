import type { SourceDocument } from "../domain/research.js";

export interface FreshnessAssessment {
  known: boolean;
  fresh: boolean;
  ageDays?: number;
  reason:
    | "FRESH"
    | "STALE"
    | "MISSING_PUBLISHED_AT"
    | "INVALID_DATE"
    | "FUTURE_DATE";
}

const MS_PER_DAY = 86_400_000;

export function assessSourceFreshness(
  source: SourceDocument,
  asOf: string,
  maxAgeDays: number,
): FreshnessAssessment {
  if (!source.publishedAt) {
    return {
      known: false,
      fresh: false,
      reason: "MISSING_PUBLISHED_AT",
    };
  }

  const published = new Date(source.publishedAt);
  const reference = new Date(asOf);

  if (
    Number.isNaN(published.getTime()) ||
    Number.isNaN(reference.getTime())
  ) {
    return {
      known: false,
      fresh: false,
      reason: "INVALID_DATE",
    };
  }

  const ageDays = (reference.getTime() - published.getTime()) / MS_PER_DAY;

  if (ageDays < -1) {
    return {
      known: true,
      fresh: false,
      ageDays,
      reason: "FUTURE_DATE",
    };
  }

  return {
    known: true,
    fresh: ageDays <= maxAgeDays,
    ageDays,
    reason: ageDays <= maxAgeDays ? "FRESH" : "STALE",
  };
}
