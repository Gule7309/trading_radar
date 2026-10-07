import { z } from "zod";

export const ClaimCategorySchema = z.enum([
  "FINANCIAL",
  "EVENT",
  "MANAGEMENT_GUIDANCE",
  "INDUSTRY",
  "RISK",
  "CAUSAL",
  "OTHER",
]);

export const ClaimImportanceSchema = z.enum(["CORE", "SUPPORTING"]);

export const ExtractedClaimSchema = z.object({
  text: z.string().min(1),
  category: ClaimCategorySchema,
  importance: ClaimImportanceSchema,
  sourceIds: z.array(z.string().min(1)).min(1).max(3),
});

export const ClaimExtractionOutputSchema = z.object({
  claims: z.array(ExtractedClaimSchema).max(8),
});

export const TextualVerificationOutputSchema = z.object({
  result: z.enum(["SUPPORTED", "REFUTED", "INSUFFICIENT"]),
  reason: z.string().min(1),
  evidenceSpan: z.string().optional(),
});

export const RiskExtractionOutputSchema = z.object({
  risks: z
    .array(
      z.object({
        title: z.string().min(1),
        explanation: z.string().min(1),
        sourceIds: z.array(z.string().min(1)).min(1).max(3),
      }),
    )
    .max(6),
});

export const SkepticOutputSchema = z.object({
  shouldSearch: z.boolean(),
  weakness: z.string().min(1),
  falsificationQuestion: z.string().min(1),
  suggestedQuery: z.string().min(1),
});

export const ThesisOutputSchema = z.object({
  thesis: z.string().min(1),
  keyReasons: z.array(z.string().min(1)).max(5),
  invalidationConditions: z.array(z.string().min(1)).min(1).max(5),
});

export const ResearchActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SEARCH_OFFICIAL"),
    dataset: z.enum(["MONTHLY_REVENUE", "MATERIAL_DISCLOSURES"]),
    purpose: z.string().min(1),
    query: z.string().min(1),
    evidenceNeed: z.string().min(1),
  }),
  z.object({
    type: z.literal("SEARCH_NEWS"),
    purpose: z.string().min(1),
    query: z.string().min(1),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.object({
    type: z.literal("FETCH_SOURCE"),
    sourceId: z.string().min(1),
    purpose: z.string().min(1),
  }),
  z.object({
    type: z.literal("VERIFY"),
    claimIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("RUN_SKEPTIC"),
    thesisDraft: z.string().min(1),
  }),
  z.object({
    type: z.literal("FINALIZE"),
  }),
  z.object({
    type: z.literal("REJECT"),
    reason: z.enum([
      "INSUFFICIENT_EVIDENCE",
      "UNRESOLVED_CONFLICT",
      "SOURCE_FAILURE",
    ]),
  }),
]);

export const ControllerDecisionSchema = z.object({
  reasonCode: z.string().min(1).max(80),
  summary: z.string().min(1).max(280),
  action: ResearchActionSchema,
});
