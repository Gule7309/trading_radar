import { z } from "zod";
import {
  CandidatePacketSchema,
  RiskFlagSchema,
  UpstreamEvidenceSchema,
  type CandidatePacket,
} from "./candidate.js";

const ScreeningMetricSchema = z.object({
  value: z.number(),
  percentile: z.number().min(0).max(1).nullable(),
  evidenceId: z.string().min(1),
});

const ScreeningCandidateSchema = z.object({
  stockId: z.string().min(1),
  stockName: z.string().nullable(),
  market: z.enum(["TWSE", "TPEX"]).nullable(),
  industry: z.string().nullable(),
  percentileScope: z.enum(["industry", "market"]),
  metrics: z.object({
    revenueYoY: ScreeningMetricSchema,
    operatingMargin: ScreeningMetricSchema,
    debtRatio: ScreeningMetricSchema,
    avgTurnover20d: ScreeningMetricSchema,
  }),
  riskFlags: z.array(RiskFlagSchema),
  quantScore: z.number().min(0).max(1),
  rank: z.number().int().min(1),
});

const ScreeningEvidenceSchema = UpstreamEvidenceSchema.extend({
  stockId: z.string().min(1),
});

export const ScreeningOutputV1Schema = z.object({
  schemaVersion: z.literal("screening-output-v1"),
  run: z.object({
    runId: z.string().min(1),
    runAt: z.string().min(1),
    asOfDate: z.string().min(1),
    priceAsOf: z.string().min(1),
    revenueAsOf: z.string().min(1),
    revenueCoverage: z.number().min(0),
    financialAsOf: z.string().min(1),
    financialCoverage: z.number().min(0),
    configVersion: z.string().min(1),
    dataVersion: z.string().min(1),
    sourceSnapshot: z.string().nullable(),
    status: z.literal("success"),
    profile: z.record(z.unknown()),
    config: z.record(z.unknown()),
    counts: z.object({
      universe: z.number().int().min(0),
      baseEligible: z.number().int().min(0),
      ranked: z.number().int().min(0),
    }),
  }),
  candidates: z.array(ScreeningCandidateSchema),
  evidence: z.array(ScreeningEvidenceSchema),
  excluded: z.object({
    total: z.number().int().min(0),
    byStage: z.object({
      base: z.number().int().min(0),
      constraint: z.number().int().min(0),
    }),
    byReason: z.record(z.number().int().min(0)),
  }),
});

export type ScreeningOutputV1 = z.infer<typeof ScreeningOutputV1Schema>;

const METRIC_MAP = {
  revenueYoY: "revenue_yoy",
  operatingMargin: "operating_margin",
  debtRatio: "debt_ratio",
  avgTurnover20d: "avg_turnover_20d",
} as const;

function requireCandidateIdentity(
  candidate: z.infer<typeof ScreeningCandidateSchema>,
): {
  companyName: string;
  market: "TWSE" | "TPEX";
  industry: string;
} {
  if (!candidate.stockName?.trim()) {
    throw new Error(
      `SCREENING_ADAPTER_MISSING_STOCK_NAME:${candidate.stockId}`,
    );
  }

  if (!candidate.market) {
    throw new Error(
      `SCREENING_ADAPTER_MISSING_MARKET:${candidate.stockId}`,
    );
  }

  if (!candidate.industry?.trim()) {
    throw new Error(
      `SCREENING_ADAPTER_MISSING_INDUSTRY:${candidate.stockId}`,
    );
  }

  return {
    companyName: candidate.stockName,
    market: candidate.market,
    industry: candidate.industry,
  };
}

export function screeningOutputToCandidatePackets(
  input: ScreeningOutputV1,
): CandidatePacket[] {
  const evidenceById = new Map(
    input.evidence.map((evidence) => [
      evidence.id.toLowerCase(),
      evidence,
    ]),
  );

  return input.candidates.map((candidate) => {
    const identity = requireCandidateIdentity(candidate);
    const upstreamEvidence = Object.entries(candidate.metrics).map(
      ([metricName, metric]) => {
        const evidence = evidenceById.get(
          metric.evidenceId.toLowerCase(),
        );

        if (!evidence) {
          throw new Error(
            `SCREENING_ADAPTER_MISSING_EVIDENCE:${candidate.stockId}:${metric.evidenceId}`,
          );
        }

        if (evidence.stockId !== candidate.stockId) {
          throw new Error(
            `SCREENING_ADAPTER_EVIDENCE_ENTITY_MISMATCH:${candidate.stockId}:${metric.evidenceId}`,
          );
        }

        if (evidence.metric !== metricName) {
          throw new Error(
            `SCREENING_ADAPTER_EVIDENCE_METRIC_MISMATCH:${candidate.stockId}:${metric.evidenceId}`,
          );
        }

        if (evidence.verificationStatus !== "verified") {
          throw new Error(
            `SCREENING_ADAPTER_UNVERIFIED_EVIDENCE:${candidate.stockId}:${metric.evidenceId}`,
          );
        }

        return UpstreamEvidenceSchema.parse(evidence);
      },
    );

    const quantSignals = Object.entries(candidate.metrics).map(
      ([metricName, metric]) => {
        const evidence = upstreamEvidence.find(
          (item) => item.metric === metricName,
        );

        if (!evidence) {
          throw new Error(
            `SCREENING_ADAPTER_INTERNAL_MISSING_EVIDENCE:${candidate.stockId}:${metricName}`,
          );
        }

        return {
          metric:
            METRIC_MAP[metricName as keyof typeof METRIC_MAP],
          value: metric.value,
          period: evidence.dataAsOf,
          // A uses [0, 1]; the existing B contract exposes [0, 100].
          industryPercentile:
            metric.percentile === null
              ? undefined
              : metric.percentile * 100,
        };
      },
    );

    const dataSources = Array.from(
      new Map(
        upstreamEvidence.map((evidence) => [
          `${evidence.source}|${evidence.dataAsOf}`,
          {
            source: evidence.source,
            asOf: evidence.dataAsOf,
          },
        ]),
      ).values(),
    );

    return CandidatePacketSchema.parse({
      candidateId: `${input.run.runId}:${candidate.stockId}`,
      ticker: candidate.stockId,
      companyName: identity.companyName,
      market: identity.market,
      industry: identity.industry,
      asOf: input.run.asOfDate,
      quantScore: candidate.quantScore,
      quantSignals,
      hardConstraintsPassed: true,
      riskFlags: candidate.riskFlags,
      upstreamRun: {
        schemaVersion: input.schemaVersion,
        runId: input.run.runId,
        dataVersion: input.run.dataVersion,
        sourceSnapshot: input.run.sourceSnapshot,
        priceAsOf: input.run.priceAsOf,
        revenueAsOf: input.run.revenueAsOf,
        financialAsOf: input.run.financialAsOf,
      },
      upstreamEvidence,
      dataSources,
    });
  });
}
