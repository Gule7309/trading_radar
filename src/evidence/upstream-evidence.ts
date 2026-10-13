import { createHash } from "node:crypto";
import type { CandidatePacket, UpstreamEvidence } from "../domain/candidate.js";
import type {
  KnownFact,
  OpenQuestion,
  SourceDocument,
} from "../domain/research.js";

function sourceType(
  source: string,
): SourceDocument["sourceType"] {
  const normalized = source.toLowerCase();

  if (normalized.includes("mops")) return "MOPS";
  if (normalized.includes("twse")) return "TWSE";
  if (
    normalized.includes("tpex") ||
    normalized.includes("櫃買")
  ) {
    return "TPEX";
  }

  return "OTHER";
}

function sourceTier(
  type: SourceDocument["sourceType"],
): 1 | 2 {
  return type === "MOPS" || type === "TWSE" || type === "TPEX"
    ? 1
    : 2;
}

function numericMetadata(
  evidence: UpstreamEvidence,
): Record<string, number> {
  if (evidence.metric === "revenueYoY") {
    return { yearOverYearPercent: evidence.value };
  }

  if (evidence.metric === "operatingMargin") {
    return { operatingMarginPercent: evidence.value };
  }

  if (evidence.metric === "debtRatio") {
    return { debtRatioPercent: evidence.value };
  }

  if (evidence.metric === "avgTurnover20d") {
    return { avgTurnover20dTwd: evidence.value };
  }

  return {};
}

function stableSourceId(
  candidate: CandidatePacket,
  evidence: UpstreamEvidence,
): string {
  const runId = candidate.upstreamRun?.runId ?? candidate.candidateId;
  return `upstream-${runId}-${evidence.id}`;
}

export interface HydratedUpstreamEvidence {
  sources: SourceDocument[];
  knownFacts: KnownFact[];
  openQuestions: OpenQuestion[];
}

export function hydrateUpstreamEvidence(
  candidate: CandidatePacket,
): HydratedUpstreamEvidence {
  const upstreamEvidence = candidate.upstreamEvidence ?? [];
  const sources = upstreamEvidence.map((evidence) => {
    const type = sourceType(evidence.source);
    const sourceId = stableSourceId(candidate, evidence);

    return {
      sourceId,
      url: evidence.sourceUrl ?? evidence.referenceUrl ?? "",
      title: evidence.claim,
      publisher: evidence.source,
      sourceType: type,
      sourceTier: sourceTier(type),
      dataPeriod: evidence.dataAsOf,
      retrievedAt: evidence.fetchedAt ?? new Date().toISOString(),
      ticker: candidate.ticker,
      snippet: evidence.claim,
      contentHash: createHash("sha256")
        .update(JSON.stringify(evidence))
        .digest("hex"),
      metadata: {
        origin: "screening-output-v1",
        upstreamRunId:
          candidate.upstreamRun?.runId ?? candidate.candidateId,
        upstreamEvidenceId: evidence.id,
        upstreamDataset: evidence.dataset,
        upstreamMetric: evidence.metric,
        verificationStatus: evidence.verificationStatus,
        calculationFormula: evidence.calculation.formula,
        calculationMethod: evidence.calculation.method ?? "",
        fetchedAtScope: evidence.fetchedAtScope,
        unit: evidence.unit,
        ...numericMetadata(evidence),
      },
      untrustedContent: true as const,
    };
  });

  const knownFacts = upstreamEvidence.map((evidence) => {
    const sourceId = stableSourceId(candidate, evidence);

    return {
      factId: `upstream-fact-${candidate.candidateId}-${evidence.id}`,
      text: evidence.claim,
      sourceIds: [sourceId],
    };
  });

  const openQuestions = (candidate.riskFlags ?? []).map((flag) => ({
    questionId: `upstream-risk-${candidate.candidateId}-${flag}`,
    text:
      flag === "notice"
        ? "The upstream screening flagged a recent notice-stock event. Identify the official/current reason and assess whether it changes the thesis."
        : "The upstream screening flagged a disposition-stock event. Identify the official/current reason and assess whether it changes the thesis.",
    evidenceNeed:
      "Use official disclosure or directly fetched current evidence; do not ignore the upstream risk flag.",
    status: "OPEN" as const,
  }));

  return {
    sources,
    knownFacts,
    openQuestions,
  };
}

export function hasUpstreamMonthlyRevenue(
  candidate: CandidatePacket,
): boolean {
  return (candidate.upstreamEvidence ?? []).some(
    (evidence) =>
      evidence.dataset === "monthly_revenue" &&
      evidence.verificationStatus === "verified",
  );
}
