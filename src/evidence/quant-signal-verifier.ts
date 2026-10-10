import { createHash } from "node:crypto";
import type {
  Claim,
  EvidenceLink,
  ResearchState,
} from "../domain/research.js";
import { verifyNumericClaim } from "./numeric-verifier.js";

interface MetricMapping {
  metadataKey: string;
  label: string;
  unit?: string;
}

const METRICS: Record<string, MetricMapping> = {
  revenue_yoy: {
    metadataKey: "yearOverYearPercent",
    label: "monthly revenue YoY",
    unit: "%",
  },
  revenue_mom: {
    metadataKey: "monthOverMonthPercent",
    label: "monthly revenue MoM",
    unit: "%",
  },
  monthly_revenue: {
    metadataKey: "monthlyRevenueTwdThousands",
    label: "monthly revenue",
    unit: " TWD thousand",
  },
  cumulative_revenue_yoy: {
    metadataKey: "cumulativeYearOverYearPercent",
    label: "cumulative revenue YoY",
    unit: "%",
  },
  operating_margin: {
    metadataKey: "operatingMarginPercent",
    label: "operating margin",
    unit: "%",
  },
  debt_ratio: {
    metadataKey: "debtRatioPercent",
    label: "debt ratio",
    unit: "%",
  },
  avg_turnover_20d: {
    metadataKey: "avgTurnover20dTwd",
    label: "20-day average turnover",
    unit: " TWD",
  },
};

function id(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16)}`;
}

export function verifyQuantSignalsAgainstOfficialSources(
  state: ResearchState,
): { claims: Claim[]; evidence: EvidenceLink[] } {
  const claims: Claim[] = [];
  const evidence: EvidenceLink[] = [];

  for (const signal of state.candidate.quantSignals) {
    const mapping = METRICS[signal.metric];
    if (!mapping || typeof signal.value !== "number") continue;

    const source = state.sources.find((item) => {
      if (item.sourceTier !== 1) return false;
      const actual = item.metadata?.[mapping.metadataKey];
      if (typeof actual !== "number") return false;
      if (signal.period && item.dataPeriod && signal.period !== item.dataPeriod) {
        return false;
      }
      return true;
    });

    if (!source) continue;

    const actual = source.metadata?.[mapping.metadataKey];
    if (typeof actual !== "number") continue;

    const normalizedClaimed =
      mapping.unit === "%" &&
      Math.abs(signal.value) <= 2 &&
      Math.abs(actual) > 2
        ? signal.value * 100
        : signal.value;

    const verification = verifyNumericClaim({
      claimed: normalizedClaimed,
      actual,
      absoluteTolerance: mapping.unit === "%" ? 0.05 : 1,
      relativeTolerance: 1e-4,
    });

    const claimText =
      `${signal.period} ${mapping.label} was ${normalizedClaimed}${mapping.unit ?? ""}.`;
    const claimId = id(
      "claim-quant",
      `${state.candidate.ticker}|${signal.metric}|${signal.period}|${normalizedClaimed}`,
    );

    claims.push({
      claimId,
      text: claimText,
      category: "FINANCIAL",
      importance: "CORE",
      status: verification.result,
    });

    evidence.push({
      evidenceId: id("evidence-quant", `${claimId}|${source.sourceId}`),
      claimId,
      sourceId: source.sourceId,
      evidenceText: source.snippet,
      verificationResult: verification.result,
      verifierReason:
        verification.result === "SUPPORTED"
          ? `Deterministic numeric check matched official ${mapping.label}; difference=${verification.difference}.`
          : `Deterministic numeric check disagreed with official ${mapping.label}; claimed=${normalizedClaimed}, actual=${actual}.`,
    });
  }

  return { claims, evidence };
}
