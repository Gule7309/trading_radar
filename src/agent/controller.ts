import type { ResearchAction, ResearchState } from "../domain/research.js";

export interface ResearchController {
  decide(state: ResearchState): Promise<ResearchAction>;
}

export class MockResearchController implements ResearchController {
  async decide(state: ResearchState): Promise<ResearchAction> {
    if (state.sources.length === 0) {
      return {
        type: "SEARCH_OFFICIAL",
        dataset: "MONTHLY_REVENUE",
        purpose: "Validate the primary quant signal with a first-party source.",
        query: `${state.candidate.ticker} latest monthly revenue`,
        evidenceNeed: "Primary evidence for recent revenue performance.",
      };
    }

    if (!state.sources.some((source) => source.sourceType === "NEWS")) {
      return {
        type: "SEARCH_NEWS",
        purpose: "Look for downside evidence and recent operating risks.",
        query: `${state.candidate.companyName} margin risk latest news`,
      };
    }

    if (state.claims.length === 0) {
      return {
        type: "VERIFY",
        claimIds: [],
      };
    }

    return { type: "FINALIZE" };
  }
}
