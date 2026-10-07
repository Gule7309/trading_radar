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
  sourceIds: z.array(z.string().min(1)).min(1),
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
        sourceIds: z.array(z.string().min(1)).min(1),
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
