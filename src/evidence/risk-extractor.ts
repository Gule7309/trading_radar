import { createHash } from "node:crypto";
import type { ResearchState, RiskItem } from "../domain/research.js";
import type { LlmProvider } from "../infra/llm/provider.js";
import { RiskExtractionOutputSchema } from "../agent/model-schemas.js";

export interface RiskExtractor {
  extract(state: ResearchState): Promise<RiskItem[]>;
}

export class LlmRiskExtractor implements RiskExtractor {
  constructor(private readonly llm: LlmProvider) {}

  async extract(state: ResearchState): Promise<RiskItem[]> {
    const response = await this.llm.structured<unknown>({
      task: "RISK_EXTRACTION",
      system: [
        "Extract material downside risks that are explicitly grounded in the supplied sources.",
        "Do not invent generic investment risks.",
        "Each risk must cite one or more sourceIds that contain evidence for it.",
        "Prefer company-specific and current risks.",
        "Discovery-only Tier-3 search snippets are intentionally excluded from this task.",
        "Do not provide chain-of-thought.",
      ].join("\n"),
      input: {
        candidate: {
          ticker: state.candidate.ticker,
          companyName: state.candidate.companyName,
        },
        sources: state.sources
          .filter((source) => source.sourceTier <= 2)
          .map((source) => ({
          sourceId: source.sourceId,
          sourceTier: source.sourceTier,
          title: source.title,
          publishedAt: source.publishedAt,
            snippet: source.snippet,
          })),
      },
      schema: RiskExtractionOutputSchema,
    });

    const parsed = RiskExtractionOutputSchema.parse(response.data);

    return parsed.risks.map((risk) => ({
      riskId: `risk-${createHash("sha256")
        .update(`${risk.title}\n${risk.explanation}`)
        .digest("hex")
        .slice(0, 16)}`,
      ...risk,
    }));
  }
}
