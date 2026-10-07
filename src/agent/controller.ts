import type { ResearchAction, ResearchState } from "../domain/research.js";

export interface ControllerDecision {
  reasonCode: string;
  summary: string;
  action: ResearchAction;
}

export interface ResearchController {
  decide(state: ResearchState): Promise<ControllerDecision>;
}

export class MockResearchController implements ResearchController {
  async decide(state: ResearchState): Promise<ControllerDecision> {
    const hasMonthlyRevenue = state.sources.some(
      (source) =>
        source.sourceTier === 1 &&
        typeof source.metadata?.yearOverYearPercent === "number",
    );

    if (!hasMonthlyRevenue) {
      return {
        reasonCode: "NEED_PRIMARY_REVENUE_EVIDENCE",
        summary: "Fetch the latest official monthly revenue snapshot.",
        action: {
          type: "SEARCH_OFFICIAL",
          dataset: "MONTHLY_REVENUE",
          purpose: "Validate the primary quant signal with a first-party source.",
          query: `${state.candidate.ticker} latest monthly revenue`,
          evidenceNeed: "Primary evidence for recent revenue performance.",
        },
      };
    }

    const hasMaterialDisclosureSearch = state.researchTrace.some(
      (step) =>
        step.action === "SEARCH_OFFICIAL" &&
        step.actionDetail === "MATERIAL_DISCLOSURES",
    );

    if (!hasMaterialDisclosureSearch) {
      return {
        reasonCode: "CHECK_RECENT_COMPANY_EVENTS",
        summary: "Check first-party disclosures for thesis-changing events.",
        action: {
          type: "SEARCH_OFFICIAL",
          dataset: "MATERIAL_DISCLOSURES",
          purpose:
            "Check recent first-party company disclosures for events that may alter the thesis.",
          query: `${state.candidate.ticker} latest material disclosures`,
          evidenceNeed:
            "Recent company-specific events, guidance, one-off factors, or risk signals.",
        },
      };
    }

    if (!state.sources.some((source) => source.sourceType === "NEWS")) {
      return {
        reasonCode: "NEED_DOWNSIDE_CONTEXT",
        summary: "Search recent news for downside evidence and operating risks.",
        action: {
          type: "SEARCH_NEWS",
          purpose: "Look for downside evidence and recent operating risks.",
          query: `${state.candidate.companyName} margin risk latest news`,
        },
      };
    }

    if (state.claims.length === 0) {
      return {
        reasonCode: "READY_TO_VERIFY",
        summary: "Enough source material is available for claim verification.",
        action: {
          type: "VERIFY",
          claimIds: [],
        },
      };
    }

    return {
      reasonCode: "READY_TO_FINALIZE",
      summary: "Verified claims and risks are ready for the publication gate.",
      action: { type: "FINALIZE" },
    };
  }
}
