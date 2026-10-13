import type { CandidatePacket } from "../domain/candidate.js";
import type { UserProfile } from "./types.js";

const SIGNAL_TO_WEIGHT = {
  revenue_yoy: "growth",
  operating_margin: "profitability",
  debt_ratio: "safety",
} as const;

export function personalizedQuantScore(
  candidate: CandidatePacket,
  profile: UserProfile,
): number {
  let weighted = 0;
  let totalWeight = 0;

  for (const signal of candidate.quantSignals) {
    const key =
      SIGNAL_TO_WEIGHT[
        signal.metric as keyof typeof SIGNAL_TO_WEIGHT
      ];
    if (!key || signal.industryPercentile === undefined) continue;

    const weight = profile.softPreferences[key];
    weighted += weight * (signal.industryPercentile / 100);
    totalWeight += weight;
  }

  return totalWeight > 0
    ? weighted / totalWeight
    : candidate.quantScore;
}

export function personalizeCandidates(
  candidates: CandidatePacket[],
  profile: UserProfile,
): CandidatePacket[] {
  return candidates.map((candidate) => ({
    ...candidate,
    quantScore: personalizedQuantScore(candidate, profile),
  }));
}
