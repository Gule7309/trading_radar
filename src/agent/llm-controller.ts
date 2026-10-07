import type { LlmProvider } from "../infra/llm/provider.js";
import type { ResearchState } from "../domain/research.js";
import type {
  ControllerDecision,
  ResearchController,
} from "./controller.js";
import { ControllerDecisionSchema } from "./model-schemas.js";

function projectState(state: ResearchState) {
  return {
    candidate: {
      ticker: state.candidate.ticker,
      companyName: state.candidate.companyName,
      market: state.candidate.market,
      industry: state.candidate.industry,
      asOf: state.candidate.asOf,
      quantSignals: state.candidate.quantSignals,
    },
    phase: state.phase,
    knownFacts: state.knownFacts.slice(-12),
    openQuestions: state.openQuestions.filter(
      (question) => question.status === "OPEN",
    ),
    sources: state.sources.map((source) => ({
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      sourceTier: source.sourceTier,
      title: source.title,
      publishedAt: source.publishedAt,
      dataPeriod: source.dataPeriod,
      snippet: source.snippet.slice(0, 500),
    })),
    claims: state.claims,
    risks: state.risks,
    conflicts: state.conflicts,
    budgetRemaining: {
      steps: state.budget.maxSteps - state.budget.stepsUsed,
      searches: state.budget.maxSearches - state.budget.searchesUsed,
      skepticRounds:
        state.budget.maxSkepticRounds - state.budget.skepticRounds,
    },
    recentTrace: state.researchTrace.slice(-4),
  };
}

export class LlmResearchController implements ResearchController {
  constructor(private readonly llm: LlmProvider) {}

  async decide(state: ResearchState): Promise<ControllerDecision> {
    const response = await this.llm.structured<unknown>({
      task: "CONTROLLER",
      system: [
        "You are the controller of an evidence-seeking Taiwan equity research agent.",
        "Choose exactly one next action from the provided schema.",
        "Your goal is not to recommend a trade; it is to gather enough evidence to form or reject a research thesis.",
        "Prefer Tier-1 official sources for factual financial claims.",
        "Do not repeat a failed or completed search already visible in recentTrace unless retrying is explicitly justified.",
        "When a tool fails, prefer a different acceptable source or research path; never fabricate the missing observation.",
        "Use SEARCH_NEWS for current context or downside evidence after checking relevant official data.",
        "Google Search result snippets are discovery-only (sourceTier=3). Before using a web result as evidence for a core claim or published risk, FETCH_SOURCE to retrieve the underlying page.",
        "Use VERIFY only after core evidence sources are either official Tier-1 sources or fetched Tier-2 pages.",
        "Use FINALIZE only when claims have been verified and at least one grounded risk exists.",
        "Use REJECT when a core conclusion cannot be verified within the remaining budget.",
        "Do not expose chain-of-thought. reasonCode and summary must be short operational labels.",
      ].join("\n"),
      input: projectState(state),
      schema: ControllerDecisionSchema,
    });

    return ControllerDecisionSchema.parse(response.data);
  }
}
