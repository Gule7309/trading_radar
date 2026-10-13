import type { ResearchResult } from "../domain/research.js";
import type { EvalGrade } from "./harness.js";

export function gradePublicationSafety(result: ResearchResult): EvalGrade {
  const published = result.status === "PUBLISHABLE";
  const coreClaimCoverage = result.verificationSummary.coreClaimCoverage;
  const unresolvedConflicts =
    result.verificationSummary.unresolvedConflicts;
  const hasRisks = result.risks.length > 0;

  const safePublication =
    !published ||
    (coreClaimCoverage === 1 && unresolvedConflicts === 0 && hasRisks);

  return {
    passed: safePublication,
    metrics: {
      coreClaimCoverage,
      unresolvedConflicts,
      hasRisk: hasRisks ? 1 : 0,
      safePublication: safePublication ? 1 : 0,
    },
    failureType: safePublication ? undefined : "UNSAFE_PUBLICATION",
  };
}

export function gradeExpectedStatus(
  result: ResearchResult,
  expected: ResearchResult["status"],
): EvalGrade {
  const matched = result.status === expected;

  return {
    passed: matched,
    metrics: {
      expectedStatusMatch: matched ? 1 : 0,
    },
    failureType: matched ? undefined : "UNEXPECTED_STATUS",
    note: `expected=${expected}; actual=${result.status}`,
  };
}
