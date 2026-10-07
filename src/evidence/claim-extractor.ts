import { createHash } from "node:crypto";
import type { ResearchState } from "../domain/research.js";
import type { LlmProvider } from "../infra/llm/provider.js";
import {
  ClaimExtractionOutputSchema,
  type ExtractedClaimSchema,
} from "../agent/model-schemas.js";
import type { z } from "zod";

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export interface ClaimExtractor {
  extract(state: ResearchState): Promise<ExtractedClaim[]>;
}

export class LlmClaimExtractor implements ClaimExtractor {
  constructor(private readonly llm: LlmProvider) {}

  async extract(state: ResearchState): Promise<ExtractedClaim[]> {
    const sourcePayload = state.sources.map((source) => ({
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

    return parsed.claims.map((claim) => ({
      ...claim,
      text: claim.text.trim(),
    }));
  }
}

export function stableClaimId(text: string): string {
  return `claim-${createHash("sha256")
    .update(text.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16)}`;
}
