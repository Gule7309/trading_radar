import type { ResearchState } from "../domain/research.js";
import type { LlmProvider } from "../infra/llm/provider.js";
import { ThesisOutputSchema } from "./model-schemas.js";

export interface ThesisCompilation {
  thesis: string;
  keyReasons: string[];
  invalidationConditions: string[];
}

export interface ThesisCompiler {
  compile(state: ResearchState): Promise<ThesisCompilation>;
}

export class LlmThesisCompiler implements ThesisCompiler {
  constructor(private readonly llm: LlmProvider) {}

  async compile(state: ResearchState): Promise<ThesisCompilation> {
    const supportedClaims = state.claims.filter(
      (claim) => claim.status === "SUPPORTED",
    );

    const response = await this.llm.structured<unknown>({
      task: "THESIS",
      system: [
        "Compile a concise investment research thesis using only SUPPORTED claims and grounded risks.",
        "Do not predict guaranteed returns or make trading instructions.",
        "Every thesis reason must be traceable to the supplied supported claims.",
        "Produce concrete invalidation conditions that could be monitored later.",
        "Do not provide chain-of-thought.",
      ].join("\n"),
      input: {
        candidate: {
          ticker: state.candidate.ticker,
          companyName: state.candidate.companyName,
          quantSignals: state.candidate.quantSignals,
        },
        supportedClaims,
        risks: state.risks,
      },
      schema: ThesisOutputSchema,
    });

    return ThesisOutputSchema.parse(response.data);
  }
}
