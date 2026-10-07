import type { ResearchAction, ResearchState } from "../domain/research.js";

export interface ResearchController {
  decide(state: ResearchState): Promise<ResearchAction>;
}

export class MockResearchController implements ResearchController {
  async decide(state: ResearchState): Promise<ResearchAction> {
    const hasMonthlyRevenue = state.sources.some(
      (source) =>
        source.sourceTier === 1 &&
        typeof source.metadata?.yearOverYearPercent === "number",
    );

    if (!hasMonthlyRevenue) {
      return {
        type: "SEARCH_OFFICIAL",
        dataset: "MONTHLY_REVENUE",
        purpose: "Validate the primary quant signal with a first-party source.",
        query: `${state.candidate.ticker} latest monthly revenue`,
        evidenceNeed: "Primary evidence for recent revenue performance.",
      };
    }

    const hasMaterialDisclosureSearch = state.researchTrace.some(
      (step) =>
        step.action === "SEARCH_OFFICIAL" &&
        step.actionDetail === "MATERIAL_DISCLOSURES",
    );

    if (!hasMaterialDisclosureSearch) {
      return {
        type: "SEARCH_OFFICIAL",
        dataset: "MATERIAL_DISCLOSURES",
        purpose:
          "Check recent first-party company disclosures for events that may alter the thesis.",
        query: `${state.candidate.ticker} latest material disclosures`,
        evidenceNeed:
          "Recent company-specific events, guidance, one-off factors, or risk signals.",
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
