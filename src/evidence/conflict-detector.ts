import type {
  Claim,
  ConflictItem,
  EvidenceLink,
} from "../domain/research.js";

export function detectVerificationConflict(
  claim: Claim,
  evidence: EvidenceLink[],
): ConflictItem | null {
  const relevant = evidence.filter((item) => item.claimId === claim.claimId);
  const supported = relevant.filter(
    (item) => item.verificationResult === "SUPPORTED",
  );
  const refuted = relevant.filter(
    (item) => item.verificationResult === "REFUTED",
  );

  if (supported.length === 0 || refuted.length === 0) {
    return null;
  }

  return {
    conflictId: `conflict-${claim.claimId}`,
    claimId: claim.claimId,
    severity: claim.importance === "CORE" ? "HIGH" : "MEDIUM",
    sourceIds: Array.from(
      new Set([...supported, ...refuted].map((item) => item.sourceId)),
    ),
    resolved: false,
    note:
      "The same normalized claim has both supporting and refuting evidence. " +
      "Resolve period/entity/metric alignment before publication.",
  };
}
