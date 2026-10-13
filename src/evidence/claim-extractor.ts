import { createHash } from "node:crypto";
import type { ResearchState } from "../domain/research.js";
import type { LlmProvider } from "../infra/llm/provider.js";
import {
  ClaimExtractionOutputSchema,
  ExtractedClaimSchema,
} from "../agent/model-schemas.js";
import type { z } from "zod";

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export interface ClaimExtractor {
  extract(state: ResearchState): Promise<ExtractedClaim[]>;
}

export function normalizeExtractedClaimImportance(
  claim: ExtractedClaim,
  sourceTiers: Map<string, number>,
): ExtractedClaim {
  const hasPrimary = claim.sourceIds.some(
    (sourceId) => sourceTiers.get(sourceId) === 1,
  );

  // A numerical fact repeated by a directly fetched article is useful context,
  // but it must not become a publication-blocking financial CORE claim unless
  // the extractor can point to a Tier-1 source for that same proposition.
  if (
    claim.category === "FINANCIAL" &&
    claim.importance === "CORE" &&
    !hasPrimary
  ) {
    return {
      ...claim,
      importance: "SUPPORTING",
    };
  }

  return claim;
}

export class LlmClaimExtractor implements ClaimExtractor {
  constructor(private readonly llm: LlmProvider) {}

  async extract(state: ResearchState): Promise<ExtractedClaim[]> {
    const sourcePayload = state.sources
      .filter((source) => source.sourceTier <= 2)
      .map((source) => ({
        sourceId: source.sourceId,
        sourceTier: source.sourceTier,
        sourceType: source.sourceType,
        title: source.title,
        publishedAt: source.publishedAt,
        dataPeriod: source.dataPeriod,
        snippet: source.snippet,
      }));

    const response = await this.llm.structured<unknown>({
      task: "CLAIM_EXTRACTION",
      system: [
        "Extract atomic, independently verifiable claims from the supplied research sources.",
        "Do not add facts that are not present in the sources.",
        "One claim should contain one proposition only.",
        "Keep company, period, metric, and attribution explicit.",
        "Attach only sourceIds that directly support the proposed claim.",
        "Discovery-only Tier-3 search snippets are intentionally excluded from this task.",
        "CORE means necessary to the final thesis or its invalidation; do not mark every interesting fact as CORE.",
        "A FINANCIAL claim may be CORE only when at least one directly supporting sourceId is Tier-1.",
        "A financial fact supported only by Tier-2 sources must be SUPPORTING.",
        "Forward-looking company targets or attributed outlook statements belong to MANAGEMENT_GUIDANCE rather than FINANCIAL.",
        "Do not provide chain-of-thought.",
      ].join("\n"),
      input: {
        candidate: {
          ticker: state.candidate.ticker,
          companyName: state.candidate.companyName,
        },
        sources: sourcePayload,
      },
      schema: ClaimExtractionOutputSchema,
    });

    const parsed = ClaimExtractionOutputSchema.parse(response.data);
    const sourceTiers = new Map(
      sourcePayload.map((source) => [
        source.sourceId,
        source.sourceTier,
      ]),
    );

    return parsed.claims.map((claim) =>
      normalizeExtractedClaimImportance(
        {
          ...claim,
          text: claim.text.trim(),
        },
        sourceTiers,
      ),
    );
  }
}

export function stableClaimId(text: string): string {
  return `claim-${createHash("sha256")
    .update(text.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16)}`;
}
