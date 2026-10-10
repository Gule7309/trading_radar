import type { CandidatePacket } from "../domain/candidate.js";
import type { SourceDocument } from "../domain/research.js";
import { assessSourceFreshness } from "./freshness.js";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）股份有限公司companylimitedltd.,-]/g, "");
}

export interface SourceEligibility {
  eligible: boolean;
  entityMatch: boolean;
  freshnessKnown: boolean;
  fresh: boolean;
  reasons: string[];
}

export function assessSourceEligibility(
  source: SourceDocument,
  candidate: CandidatePacket,
  maxNewsAgeDays = 120,
): SourceEligibility {
  const reasons: string[] = [];

  if (source.sourceTier === 3) {
    reasons.push("DISCOVERY_ONLY");
  }

  const official =
    source.sourceType === "TWSE" ||
    source.sourceType === "TPEX" ||
    source.sourceType === "MOPS" ||
    source.sourceType === "COMPANY_IR";

  const haystack = normalize(
    [source.title, source.publisher, source.snippet, source.ticker ?? ""].join(
      " ",
    ),
  );
  const company = normalize(candidate.companyName);
  const ticker = normalize(candidate.ticker);

  const entityMatch =
    official
      ? source.ticker === undefined || source.ticker === candidate.ticker
      : haystack.includes(company) || haystack.includes(ticker);

  if (!entityMatch) {
    reasons.push("ENTITY_MISMATCH");
  }

  let freshnessKnown = true;
  let fresh = true;

  if (!official && (source.sourceType === "NEWS" || source.sourceType === "OTHER")) {
    const freshness = assessSourceFreshness(
      source,
      candidate.asOf,
      maxNewsAgeDays,
    );
    freshnessKnown = freshness.known;
    fresh = freshness.fresh;

    if (!freshnessKnown) {
      reasons.push("UNKNOWN_FRESHNESS");
    } else if (!fresh) {
      reasons.push(freshness.reason);
    }
  }

  return {
    eligible:
      source.sourceTier <= 2 &&
      entityMatch &&
      (official || (freshnessKnown && fresh)),
    entityMatch,
    freshnessKnown,
    fresh,
    reasons,
  };
}

export function eligibleEvidenceSources(
  sources: SourceDocument[],
  candidate: CandidatePacket,
): SourceDocument[] {
  return sources.filter(
    (source) => assessSourceEligibility(source, candidate).eligible,
  );
}
