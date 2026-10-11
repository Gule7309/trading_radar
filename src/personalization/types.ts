import { z } from "zod";

export const SoftPreferenceWeightsSchema = z.object({
  growth: z.number().min(0),
  profitability: z.number().min(0),
  safety: z.number().min(0),
});

export const HardConstraintsSchema = z.object({
  excludedIndustries: z.array(z.string()).default([]),
  maxDebtRatio: z.number().positive().nullable().default(null),
  minLiquidity: z.number().min(0).nullable().default(100_000_000),
  excludeDisposition: z.boolean().default(true),
});

export const UserProfileSchema = z.object({
  userId: z.string().min(1),
  investmentHorizon: z
    .enum(["SHORT", "MEDIUM", "LONG"])
    .default("MEDIUM"),
  riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  researchStyle: z
    .enum(["GROWTH", "BALANCED", "STABLE"])
    .default("BALANCED"),
  hardConstraints: HardConstraintsSchema,
  softPreferences: SoftPreferenceWeightsSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const UserProfileUpdateSchema = z.object({
  investmentHorizon: z.enum(["SHORT", "MEDIUM", "LONG"]).optional(),
  riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  researchStyle: z.enum(["GROWTH", "BALANCED", "STABLE"]).optional(),
  hardConstraints: HardConstraintsSchema.partial().optional(),
  softPreferences: SoftPreferenceWeightsSchema.partial().optional(),
});

export const FeedbackActionSchema = z.enum(["SAVE", "SKIP"]);

export const FeedbackReasonSchema = z.enum([
  "GROWTH",
  "FINANCIAL_STABILITY",
  "INDUSTRY_TREND",
  "ACCEPTABLE_RISK",
  "HIGH_VOLATILITY",
  "FINANCIAL_QUALITY",
  "UNFAMILIAR_INDUSTRY",
  "INSUFFICIENT_GROWTH",
  "VALUATION_CONCERN",
  "OTHER",
]);

const SAVE_REASONS = new Set([
  "GROWTH",
  "FINANCIAL_STABILITY",
  "INDUSTRY_TREND",
  "ACCEPTABLE_RISK",
  "OTHER",
]);

const SKIP_REASONS = new Set([
  "HIGH_VOLATILITY",
  "FINANCIAL_QUALITY",
  "UNFAMILIAR_INDUSTRY",
  "INSUFFICIENT_GROWTH",
  "VALUATION_CONCERN",
  "OTHER",
]);

export const FeedbackInputSchema = z
  .object({
    runId: z.string().min(1),
    action: FeedbackActionSchema,
    reasons: z.array(FeedbackReasonSchema).min(1).max(4),
    note: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const allowed =
      value.action === "SAVE" ? SAVE_REASONS : SKIP_REASONS;

    value.reasons.forEach((reason, index) => {
      if (!allowed.has(reason)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reasons", index],
          message: `${reason} is not valid for ${value.action} feedback.`,
        });
      }
    });
  });

export type SoftPreferenceWeights = z.infer<
  typeof SoftPreferenceWeightsSchema
>;
export type HardConstraints = z.infer<typeof HardConstraintsSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;
export type FeedbackAction = z.infer<typeof FeedbackActionSchema>;
export type FeedbackReason = z.infer<typeof FeedbackReasonSchema>;
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export interface UserFeedback {
  feedbackId: string;
  userId: string;
  runId: string;
  candidateId: string;
  ticker: string;
  action: FeedbackAction;
  reasons: FeedbackReason[];
  note?: string;
  createdAt: string;
}

export interface PreferenceChange {
  changeId: string;
  userId: string;
  feedbackId: string;
  before: SoftPreferenceWeights;
  after: SoftPreferenceWeights;
  delta: SoftPreferenceWeights;
  reason: string;
  createdAt: string;
}

export function normalizedWeights(
  value: SoftPreferenceWeights,
): SoftPreferenceWeights {
  const total = value.growth + value.profitability + value.safety;
  if (total <= 0) {
    return {
      growth: 1 / 3,
      profitability: 1 / 3,
      safety: 1 / 3,
    };
  }

  return {
    growth: value.growth / total,
    profitability: value.profitability / total,
    safety: value.safety / total,
  };
}

export function defaultSoftPreferences(
  style: UserProfile["researchStyle"] = "BALANCED",
): SoftPreferenceWeights {
  if (style === "GROWTH") {
    return normalizedWeights({
      growth: 0.5,
      profitability: 0.3,
      safety: 0.2,
    });
  }

  if (style === "STABLE") {
    return normalizedWeights({
      growth: 0.2,
      profitability: 0.3,
      safety: 0.5,
    });
  }

  return {
    growth: 1 / 3,
    profitability: 1 / 3,
    safety: 1 / 3,
  };
}

export function createDefaultUserProfile(
  userId: string,
  now = new Date().toISOString(),
): UserProfile {
  return UserProfileSchema.parse({
    userId,
    investmentHorizon: "MEDIUM",
    riskTolerance: "MEDIUM",
    researchStyle: "BALANCED",
    hardConstraints: {
      excludedIndustries: [],
      maxDebtRatio: null,
      minLiquidity: 100_000_000,
      excludeDisposition: true,
    },
    softPreferences: defaultSoftPreferences("BALANCED"),
    createdAt: now,
    updatedAt: now,
  });
}
