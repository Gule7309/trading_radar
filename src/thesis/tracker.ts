import { randomUUID } from "node:crypto";
import type { ResearchResult } from "../domain/research.js";
import type {
  ThesisClaimSnapshot,
  ThesisStatus,
  ThesisVersion,
} from "./types.js";

function resultClaims(
  result: ResearchResult,
  previous?: ThesisVersion,
): ThesisClaimSnapshot[] {
  const previousImportance = new Map<string, "CORE" | "SUPPORTING">();

  if (previous) {
    for (const claim of [...previous.coreClaims, ...previous.supportingClaims]) {
      previousImportance.set(claim.claimId, claim.importance);
    }
  }

  return result.claims.map((claim) => ({
    ...claim,
    importance: previousImportance.get(claim.claimId) ?? "CORE",
  }));
}

function deriveStatus(
  previous: ThesisVersion,
  currentClaims: ThesisClaimSnapshot[],
): { status: ThesisStatus; reason: string } {
  const previousCoreById = new Map(
    previous.coreClaims.map((claim) => [claim.claimId, claim]),
  );

  const currentCore = currentClaims.filter(
    (claim) =>
      previousCoreById.has(claim.claimId) || claim.importance === "CORE",
  );

  const refuted = currentCore.filter((claim) => claim.status === "REFUTED");
  if (refuted.length > 0) {
    return {
      status: "INVALIDATED",
      reason: `${refuted.length} core claim(s) are now refuted.`,
    };
  }

  const weakened = currentCore.filter(
    (claim) =>
      claim.status === "CONFLICTING" || claim.status === "INSUFFICIENT",
  );
  if (weakened.length > 0) {
    return {
      status: "WEAKENED",
      reason: `${weakened.length} core claim(s) lost sufficient support.`,
    };
  }

  const newSupportedCore = currentCore.filter(
    (claim) =>
      claim.status === "SUPPORTED" && !previousCoreById.has(claim.claimId),
  );
  if (newSupportedCore.length > 0) {
    return {
      status: "STRENGTHENED",
      reason: `${newSupportedCore.length} new supported core claim(s) were added.`,
    };
  }

  return {
    status: "UNCHANGED",
    reason: "No material verified change to the core thesis was detected.",
  };
}

function partitionClaims(claims: ThesisClaimSnapshot[]) {
  return {
    coreClaims: claims.filter((claim) => claim.importance === "CORE"),
    supportingClaims: claims.filter(
      (claim) => claim.importance === "SUPPORTING",
    ),
  };
}

export function createInitialThesis(
  result: ResearchResult,
  thesisId: string = randomUUID(),
): ThesisVersion {
  if (result.status !== "PUBLISHABLE" || !result.thesis) {
    throw new Error("Only a publishable research result can create a thesis.");
  }

  const claims = resultClaims(result);
  const { coreClaims, supportingClaims } = partitionClaims(claims);

  return {
    thesisId,
    ticker: result.ticker,
    version: 1,
    thesisText: result.thesis,
    status: "ACTIVE",
    coreClaims,
    supportingClaims,
    risks: result.risks,
    invalidationConditions: result.invalidationConditions,
    createdAt: result.completedAt,
    changeReason: "Initial verified thesis created.",
  };
}

export function recheckThesis(
  previous: ThesisVersion,
  result: ResearchResult,
): ThesisVersion {
  if (previous.ticker !== result.ticker) {
    throw new Error("Cannot recheck a thesis with a different ticker.");
  }

  const claims = resultClaims(result, previous);
  const { coreClaims, supportingClaims } = partitionClaims(claims);
  const change = deriveStatus(previous, claims);

  return {
    thesisId: previous.thesisId,
    ticker: previous.ticker,
    version: previous.version + 1,
    thesisText: result.thesis ?? previous.thesisText,
    status: change.status,
    coreClaims,
    supportingClaims,
    risks: result.risks,
    invalidationConditions:
      result.invalidationConditions.length > 0
        ? result.invalidationConditions
        : previous.invalidationConditions,
    createdAt: result.completedAt,
    changeReason: change.reason,
  };
}
