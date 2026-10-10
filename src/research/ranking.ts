import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";

export interface RankingWeights {
  quant: number;
  evidence: number;
}

export interface RankedResearchResult {
  rank: number;
  candidateId: string;
  ticker: string;
  score: number;
  quantScore: number;
  evidenceQuality: number;
  result: ResearchResult;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function computeEvidenceQuality(result: ResearchResult): number {
  const freshness =
    result.verificationSummary.freshness === "CURRENT"
      ? 1
      : result.verificationSummary.freshness === "UNKNOWN"
        ? 0.5
        : 0;

  const conflictPenalty =
    result.verificationSummary.unresolvedConflicts > 0 ? 0 : 1;

  return clamp01(
    0.5 * clamp01(result.verificationSummary.coreClaimCoverage) +
      0.3 * clamp01(result.verificationSummary.primarySourceRatio) +
      0.15 * freshness +
      0.05 * conflictPenalty,
  );
}

export function rankPublishableResearch(
  items: Array<{ candidate: CandidatePacket; result: ResearchResult }>,
  topK = 5,
  weights: RankingWeights = { quant: 0.6, evidence: 0.4 },
): RankedResearchResult[] {
  const weightSum = weights.quant + weights.evidence;
  if (weightSum <= 0) {
    throw new Error("Ranking weights must have a positive sum.");
  }

  const quantWeight = weights.quant / weightSum;
  const evidenceWeight = weights.evidence / weightSum;

  return items
    .filter(({ result }) => result.status === "PUBLISHABLE")
    .map(({ candidate, result }) => {
      const quantScore = clamp01(candidate.quantScore);
      const evidenceQuality = computeEvidenceQuality(result);

      return {
        rank: 0,
        candidateId: candidate.candidateId,
        ticker: candidate.ticker,
        score:
          quantWeight * quantScore +
          evidenceWeight * evidenceQuality,
        quantScore,
        evidenceQuality,
        result,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.evidenceQuality - a.evidenceQuality ||
        b.quantScore - a.quantScore ||
        a.ticker.localeCompare(b.ticker),
    )
    .slice(0, Math.max(1, topK))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}
