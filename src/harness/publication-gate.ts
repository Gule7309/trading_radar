import type { ResearchState } from "../domain/research.js";

export type PublicationGateFailure =
  | "NO_CORE_CLAIM"
  | "UNSUPPORTED_CORE_CLAIM"
  | "NO_RISK_IDENTIFIED"
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

  if (state.risks.length === 0) {
    return { ok: false, reason: "NO_RISK_IDENTIFIED" };
  }

  const hasHighConflict = state.conflicts.some(
    (conflict) => conflict.severity === "HIGH" && !conflict.resolved,
  );

  if (hasHighConflict) {
    return { ok: false, reason: "HIGH_CONFLICT" };
  }

  return { ok: true };
}
