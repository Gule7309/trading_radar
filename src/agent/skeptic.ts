import type { ResearchState } from "../domain/research.js";
import type { LlmProvider } from "../infra/llm/provider.js";
import { SkepticOutputSchema } from "./model-schemas.js";

export interface SkepticResult {
  shouldSearch: boolean;
  weakness: string;
  falsificationQuestion: string;
  suggestedQuery: string;
}

export interface Skeptic {
  review(state: ResearchState, thesisDraft: string): Promise<SkepticResult>;
}

export class LlmSkeptic implements Skeptic {
  constructor(private readonly llm: LlmProvider) {}

  async review(
    state: ResearchState,
    thesisDraft: string,
  ): Promise<SkepticResult> {
    const response = await this.llm.structured<unknown>({
      task: "SKEPTIC",
      system: [
        "Act as a falsification reviewer, not a second stock picker.",
        "Identify the single most decision-relevant weakness in the draft thesis.",
        "Ask one targeted question whose answer could materially weaken or invalidate it.",
        "Recommend a focused search query only when additional evidence is needed.",
        "Do not provide chain-of-thought.",
      ].join("\n"),
      input: {
        candidate: {
          ticker: state.candidate.ticker,
          companyName: state.candidate.companyName,
        },
        thesisDraft,
        claims: state.claims,
        risks: state.risks,
        conflicts: state.conflicts,
      },
      schema: SkepticOutputSchema,
    });

    return SkepticOutputSchema.parse(response.data);
  }
}

export function shouldRunSkeptic(state: ResearchState): boolean {
  const hasCoreConflict = state.conflicts.some(
    (conflict) => conflict.severity === "HIGH" && !conflict.resolved,
  );
  const hasForwardLookingOrCausalCoreClaim = state.claims.some(
    (claim) =>
      claim.importance === "CORE" &&
      (claim.category === "CAUSAL" ||
        claim.category === "MANAGEMENT_GUIDANCE"),
  );
  const coreEvidenceSourceIds = new Set(
    state.evidence
      .filter((evidence) =>
        state.claims.some(
          (claim) =>
            claim.claimId === evidence.claimId && claim.importance === "CORE",
        ),
      )
      .map((evidence) => evidence.sourceId),
  );
  const coreSources = state.sources.filter((source) =>
    coreEvidenceSourceIds.has(source.sourceId),
  );
  const noPrimaryCoreEvidence =
    coreSources.length > 0 &&
    coreSources.every((source) => source.sourceTier !== 1);

  return (
    state.budget.skepticRounds < state.budget.maxSkepticRounds &&
    (hasCoreConflict ||
      hasForwardLookingOrCausalCoreClaim ||
      noPrimaryCoreEvidence ||
      state.risks.length === 0)
  );
}
