import { z } from "zod";

// Public API DTOs are intentionally independent of the backend worktree.
export const WeightsSchema = z.object({
  growth: z.number(),
  profitability: z.number(),
  safety: z.number(),
});
export type Weights = z.infer<typeof WeightsSchema>;
export const HardSchema = z.object({
  excludedIndustries: z.array(z.string()),
  maxDebtRatio: z.number().nullable(),
  minLiquidity: z.number().nullable(),
  excludeDisposition: z.boolean(),
});
export type HardConstraints = z.infer<typeof HardSchema>;
export const ProfileSchema = z.object({
  userId: z.string(),
  investmentHorizon: z.enum(["SHORT", "MEDIUM", "LONG"]),
  riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]),
  researchStyle: z.enum(["GROWTH", "BALANCED", "STABLE"]),
  hardConstraints: HardSchema,
  softPreferences: WeightsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;
export const SourceSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  url: z.string(),
  publisher: z.string(),
  sourceType: z.string().optional(),
  sourceTier: z.number(),
  publishedAt: z.string().optional(),
  dataPeriod: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;
const ClaimSchema = z.object({
  claimId: z.string(),
  text: z.string(),
  status: z.string(),
  category: z.string().optional(),
  importance: z.string().optional(),
  sourceIds: z.array(z.string()),
});
const RiskSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  sourceIds: z.array(z.string()),
  addressesRiskFlags: z.array(z.string()).optional(),
});
export const ResultSchema = z.object({
  runId: z.string(),
  ticker: z.string(),
  companyName: z.string(),
  status: z.string(),
  decision: z.string(),
  thesis: z.string().optional(),
  keyReasons: z.array(z.string()),
  claims: z.array(ClaimSchema),
  risks: z.array(RiskSchema),
  invalidationConditions: z.array(z.string()),
  sources: z.array(SourceSchema),
  verificationSummary: z.object({
    coreClaimCoverage: z.number(),
    primarySourceRatio: z.number(),
    unresolvedConflicts: z.number(),
    freshness: z.string().optional(),
  }),
  researchTrace: z.array(
    z.object({
      step: z.number(),
      action: z.string(),
      actionDetail: z.string().optional(),
      reasonCode: z.string(),
      decisionSummary: z.string().optional(),
      tool: z.string().optional(),
      outcome: z.string(),
      createdAt: z.string(),
    }),
  ),
  diagnostics: z
    .array(
      z.object({
        stage: z.string(),
        message: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
  metrics: z
    .object({
      llmCalls: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      llmLatencyMs: z.number(),
      estimatedCostUsd: z.number().optional(),
      totalLatencyMs: z.number(),
    })
    .optional(),
  stopReason: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
});
export type ResearchResult = z.infer<typeof ResultSchema>;
export const BatchSchema = z.object({
  screeningRunId: z.string(),
  dataVersion: z.string(),
  sourceSnapshot: z.string().nullable(),
  personalization: z
    .object({ userId: z.string(), softPreferences: WeightsSchema })
    .optional(),
  researched: z.number(),
  rejectedOrSkipped: z.array(
    z.object({
      candidateId: z.string(),
      ticker: z.string(),
      status: z.string(),
      stopReason: z.string().optional(),
    }),
  ),
  top: z.array(
    z.object({
      rank: z.number(),
      candidateId: z.string(),
      ticker: z.string(),
      score: z.number(),
      quantScore: z.number(),
      evidenceQuality: z.number(),
      result: ResultSchema.refine(
        (result) => result.status === "PUBLISHABLE",
        "Top-K 必須是後端判定可發布的研究",
      ),
    }),
  ),
});
export type Batch = z.infer<typeof BatchSchema>;
// daily-research returns the core batch, without the screening route's envelope.
export const BatchCoreSchema = BatchSchema.omit({
  screeningRunId: true,
  dataVersion: true,
  sourceSnapshot: true,
  personalization: true,
});
export const PacketSchema = z
  .object({
    candidateId: z.string(),
    ticker: z.string(),
    companyName: z.string(),
    market: z.enum(["TWSE", "TPEX"]),
    industry: z.string(),
    asOf: z.string(),
    quantScore: z.number(),
    quantSignals: z.array(
      z.object({
        metric: z.string(),
        value: z.union([z.string(), z.number()]),
        period: z.string(),
        industryPercentile: z.number().optional(),
      }),
    ),
    hardConstraintsPassed: z.boolean(),
    riskFlags: z.array(z.string()).optional(),
    dataSources: z
      .array(z.object({ source: z.string(), asOf: z.string() }))
      .optional(),
  })
  .passthrough();
export type CandidatePacket = z.infer<typeof PacketSchema>;
export const StoredRunSchema = z.object({
  runId: z.string(),
  ticker: z.string(),
  candidate: PacketSchema,
  result: ResultSchema,
  createdAt: z.string(),
});
export type StoredRun = z.infer<typeof StoredRunSchema>;
export const ChangeSchema = z.object({
  changeId: z.string(),
  userId: z.string(),
  source: z.string(),
  feedbackId: z.string().optional(),
  before: WeightsSchema,
  after: WeightsSchema,
  delta: WeightsSchema,
  reason: z.string(),
  createdAt: z.string(),
});
export type Change = z.infer<typeof ChangeSchema>;
export const FeedbackSchema = z.object({
  feedbackId: z.string(),
  userId: z.string(),
  runId: z.string(),
  candidateId: z.string(),
  ticker: z.string(),
  action: z.string(),
  reasons: z.array(z.string()),
  note: z.string().optional(),
  createdAt: z.string(),
});
export const WatchSchema = z.object({
  userId: z.string(),
  ticker: z.string(),
  companyName: z.string(),
  thesisId: z.string(),
  sourceResearchRunId: z.string(),
  candidate: PacketSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WatchItem = z.infer<typeof WatchSchema>;
export const ThesisSchema = z.object({
  thesisId: z.string(),
  ticker: z.string(),
  version: z.number(),
  thesisText: z.string(),
  status: z.string(),
  coreClaims: z.array(ClaimSchema),
  supportingClaims: z.array(ClaimSchema),
  risks: z.array(RiskSchema),
  invalidationConditions: z.array(z.string()),
  createdAt: z.string(),
  changeReason: z.string().optional(),
});
export type Thesis = z.infer<typeof ThesisSchema>;
export const EventSchema = z.object({
  eventId: z.string(),
  thesisId: z.string(),
  ticker: z.string(),
  occurredAt: z.string(),
  eventType: z.string(),
  summary: z.string(),
  sourceIds: z.array(z.string()),
});
export const NotificationSchema = z
  .object({
    notificationId: z.string(),
    userId: z.string(),
    type: z.string(),
    title: z.string(),
    message: z.string(),
    ticker: z.string().optional(),
    thesisId: z.string().optional(),
    researchRunId: z.string().optional(),
    screeningRunId: z.string().optional(),
    createdAt: z.string(),
    readAt: z.string().optional(),
  })
  .passthrough();
export type Notice = z.infer<typeof NotificationSchema>;
export const DeliverySchema = z.object({
  deliveryRunId: z.string(),
  userId: z.string(),
  localDate: z.string(),
  status: z.string(),
  screeningRunId: z.string().optional(),
  priceAsOf: z.string().optional(),
  researchCount: z.number().optional(),
  publishedCount: z.number().optional(),
  watchlistRechecked: z.number().optional(),
  watchlistRecheckFailed: z.number().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});
export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  thesisTracking: z.boolean().optional(),
  batchResearch: z.boolean().optional(),
  personalization: z.boolean().optional(),
  watchlist: z.boolean().optional(),
  notifications: z.boolean().optional(),
  proactiveDelivery: z.boolean().optional(),
  admin: z.boolean().optional(),
});
export const AdminSchema = z.object({
  llmProvider: z.string(),
  llmModel: z.string().optional(),
  searchProvider: z.string(),
  searchModel: z.string().optional(),
  modelCredentialConfigured: z.boolean(),
  taiwanDataConfigured: z.boolean(),
  dailySchedulerEnabled: z.boolean(),
  dailyResearchAfterHour: z.number(),
  registeredUsers: z.number(),
  latestDeliveryRuns: z.array(
    z.object({
      userId: z.string(),
      status: z.string(),
      localDate: z.string(),
      completedAt: z.string().optional(),
    }),
  ),
});

export interface Metric {
  value: number;
  percentile: number | null;
  evidenceId: string;
}
export interface QuantCandidate {
  stockId: string;
  stockName: string;
  market: string;
  industry: string | null;
  percentileScope: string;
  metrics: Record<string, Metric>;
  riskFlags: string[];
  quantScore: number;
  rank: number;
}
export interface QuantEvidence {
  id: string;
  stockId: string;
  metric: string;
  claim: string;
  value: number;
  unit: string;
  dataset: string;
  source: string;
  sourceUrl: string | null;
  referenceUrl: string | null;
  dataAsOf: string;
  windowStart: string;
  windowEnd: string;
  fetchedAt: string | null;
  fetchedAtScope: string;
  calculation: {
    formula: string;
    method?: string;
    inputs: Record<string, unknown>;
  };
  verificationStatus: string;
}
export interface ScreeningOutput {
  schemaVersion: string;
  run: {
    runId: string;
    runAt: string;
    asOfDate: string;
    priceAsOf: string;
    revenueAsOf: string;
    financialAsOf: string;
    dataVersion: string;
    sourceSnapshot: string | null;
    profile: Record<string, unknown>;
    counts: { universe: number; baseEligible: number; ranked: number };
    [key: string]: unknown;
  };
  candidates: QuantCandidate[];
  evidence: QuantEvidence[];
  excluded: {
    total: number;
    byStage: Record<string, number>;
    byReason: Record<string, number>;
  };
}
export interface Snapshot {
  id: string;
  scope: string;
  createdAt: string;
  input: ScreeningOutput;
  result: Batch;
  weights: Weights;
  profileUpdatedAt: string;
}
