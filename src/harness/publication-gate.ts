import type { ResearchState } from "../domain/research.js";

export type PublicationGateFailure =
  | "NO_CORE_CLAIM"
  | "UNSUPPORTED_CORE_CLAIM"
  | "CORE_CLAIM_DISCOVERY_ONLY"
  | "FINANCIAL_CORE_WITHOUT_PRIMARY"
  | "NO_RISK_IDENTIFIED"
  | "RISK_DISCOVERY_ONLY"
  | "HIGH_CONFLICT";

export type PublicationGateResult =
  | { ok: true }
  | { ok: false; reason: PublicationGateFailure };

export function evaluatePublicationGate(
  state: ResearchState,
): PublicationGateResult {
  const coreClaims = state.claims.filter((claim) => claim.importance === "CORE");

  if (coreClaims.length === 0) {
    return { ok: false, reason: "NO_CORE_CLAIM" };
  }

  if (coreClaims.some((claim) => claim.status !== "SUPPORTED")) {
    return { ok: false, reason: "UNSUPPORTED_CORE_CLAIM" };
  }

  for (const claim of coreClaims) {
    const sourceIds = new Set(
      state.evidence
        .filter(
          (evidence) =>
            evidence.claimId === claim.claimId &&
            evidence.verificationResult === "SUPPORTED",
        )
        .map((evidence) => evidence.sourceId),
    );

    const supportingSources = state.sources.filter((source) =>
      sourceIds.has(source.sourceId),
    );

    if (
      supportingSources.length === 0 ||
      supportingSources.every((source) => source.sourceTier === 3)
    ) {
      return { ok: false, reason: "CORE_CLAIM_DISCOVERY_ONLY" };
    }

    if (
      claim.category === "FINANCIAL" &&
      supportingSources.every((source) => source.sourceTier !== 1)
    ) {
      return { ok: false, reason: "FINANCIAL_CORE_WITHOUT_PRIMARY" };
    }
  }

  if (state.risks.length === 0) {
    return { ok: false, reason: "NO_RISK_IDENTIFIED" };
  }

  for (const risk of state.risks) {
    const supportingSources = state.sources.filter((source) =>
      risk.sourceIds.includes(source.sourceId),
    );

    if (
      supportingSources.length === 0 ||
      supportingSources.every((source) => source.sourceTier === 3)
    ) {
      return { ok: false, reason: "RISK_DISCOVERY_ONLY" };
    }
  }

  const hasHighConflict = state.conflicts.some(
    (conflict) => conflict.severity === "HIGH" && !conflict.resolved,
  );

  if (hasHighConflict) {
    return { ok: false, reason: "HIGH_CONFLICT" };
  }

  return { ok: true };
}
