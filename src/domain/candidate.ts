import { z } from "zod";

export const RiskFlagSchema = z.enum(["notice", "disposition"]);

export const UpstreamEvidenceSchema = z.object({
  id: z.string().min(1),
  metric: z.enum([
    "revenueYoY",
    "operatingMargin",
    "debtRatio",
    "avgTurnover20d",
  ]),
  claim: z.string().min(1),
  value: z.number(),
  unit: z.enum(["%", "TWD"]),
  dataset: z.string().min(1),
  source: z.string().min(1),
  sourceUrl: z.string().nullable(),
  referenceUrl: z.string().nullable(),
  dataAsOf: z.string().min(1),
  windowStart: z.string(),
  windowEnd: z.string(),
  fetchedAt: z.string().nullable(),
  fetchedAtScope: z.enum(["row", "dataset"]),
  calculation: z.object({
    formula: z.string(),
    method: z.string().optional(),
    inputs: z.record(z.unknown()),
  }),
  verificationStatus: z.enum([
    "verified",
    "partial",
    "conflict",
    "insufficient",
  ]),
});

export const QuantSignalSchema = z.object({
  metric: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  period: z.string().min(1),
  industryPercentile: z.number().min(0).max(100).optional(),
});

export const CandidatePacketSchema = z.object({
  candidateId: z.string().min(1),
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  market: z.enum(["TWSE", "TPEX"]),
  industry: z.string().min(1),
  asOf: z.string().min(1),
  quantScore: z.number(),
  quantSignals: z.array(QuantSignalSchema),
  hardConstraintsPassed: z.boolean(),
  riskFlags: z.array(RiskFlagSchema).optional(),
  upstreamRun: z
    .object({
      schemaVersion: z.literal("screening-output-v1"),
      runId: z.string().min(1),
      dataVersion: z.string().min(1),
      sourceSnapshot: z.string().nullable(),
      priceAsOf: z.string().min(1),
      revenueAsOf: z.string().min(1),
      financialAsOf: z.string().min(1),
    })
    .optional(),
  upstreamEvidence: z.array(UpstreamEvidenceSchema).optional(),
  dataSources: z
    .array(
      z.object({
        source: z.string().min(1),
        asOf: z.string().min(1),
      }),
    )
    .optional(),
});

export type RiskFlag = z.infer<typeof RiskFlagSchema>;
export type UpstreamEvidence = z.infer<typeof UpstreamEvidenceSchema>;
export type QuantSignal = z.infer<typeof QuantSignalSchema>;
export type CandidatePacket = z.infer<typeof CandidatePacketSchema>;
