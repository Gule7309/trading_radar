import type { ResearchState } from "../domain/research.js";

export type PublicationGateFailure =
  | "NO_CORE_CLAIM"
  | "UNSUPPORTED_CORE_CLAIM"
  | "CORE_CLAIM_DISCOVERY_ONLY"
  | "FINANCIAL_CORE_WITHOUT_PRIMARY"
  | "NO_RISK_IDENTIFIED"
  | "RISK_DISCOVERY_ONLY"
  | "UPSTREAM_RISK_FLAG_UNADDRESSED"
  | "HIGH_CONFLICT";

export type PublicationGateResult =
  | { ok: true }
  | {
      ok: false;
      reason: PublicationGateFailure;
      claimIds?: string[];
    };

function supportedSourcesForClaim(
  state: ResearchState,
  claimId: string,
) {
  const sourceIds = new Set(
    state.evidence
      .filter(
        (evidence) =>
          evidence.claimId === claimId &&
          evidence.verificationResult === "SUPPORTED",
      )
      .map((evidence) => evidence.sourceId),
  );

  return state.sources.filter((source) =>
    sourceIds.has(source.sourceId),
  );
}

export function evaluatePublicationGate(
  state: ResearchState,
): PublicationGateResult {
  const coreClaims = state.claims.filter(
    (claim) => claim.importance === "CORE",
  );

  if (coreClaims.length === 0) {
    return { ok: false, reason: "NO_CORE_CLAIM" };
  }

  const unsupportedCore = coreClaims.filter(
    (claim) => claim.status !== "SUPPORTED",
  );

  if (unsupportedCore.length > 0) {
    return {
      ok: false,
      reason: "UNSUPPORTED_CORE_CLAIM",
      claimIds: unsupportedCore.map(
        (claim) => claim.claimId,
      ),
    };
  }

  const discoveryOnly = coreClaims.filter((claim) => {
    const supportingSources = supportedSourcesForClaim(
      state,
      claim.claimId,
    );

    return (
      supportingSources.length === 0 ||
      supportingSources.every(
        (source) => source.sourceTier === 3,
      )
    );
  });

  if (discoveryOnly.length > 0) {
    return {
      ok: false,
      reason: "CORE_CLAIM_DISCOVERY_ONLY",
      claimIds: discoveryOnly.map(
        (claim) => claim.claimId,
      ),
    };
  }

  const financialWithoutPrimary = coreClaims.filter(
    (claim) =>
      claim.category === "FINANCIAL" &&
      supportedSourcesForClaim(
        state,
        claim.claimId,
      ).every((source) => source.sourceTier !== 1),
  );

  if (financialWithoutPrimary.length > 0) {
    return {
      ok: false,
      reason: "FINANCIAL_CORE_WITHOUT_PRIMARY",
      claimIds: financialWithoutPrimary.map(
        (claim) => claim.claimId,
      ),
    };
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
      supportingSources.every(
        (source) => source.sourceTier === 3,
      )
    ) {
      return {
        ok: false,
        reason: "RISK_DISCOVERY_ONLY",
      };
    }
  }

  const requiredRiskFlags =
    state.candidate.riskFlags ?? [];
  const addressedRiskFlags = new Set(
    state.risks.flatMap(
      (risk) => risk.addressesRiskFlags ?? [],
    ),
  );

  if (
    requiredRiskFlags.some(
      (flag) => !addressedRiskFlags.has(flag),
    )
  ) {
    return {
      ok: false,
      reason: "UPSTREAM_RISK_FLAG_UNADDRESSED",
    };
  }

  const hasHighConflict = state.conflicts.some(
    (conflict) =>
      conflict.severity === "HIGH" && !conflict.resolved,
  );

  if (hasHighConflict) {
    return { ok: false, reason: "HIGH_CONFLICT" };
  }

  return { ok: true };
}
