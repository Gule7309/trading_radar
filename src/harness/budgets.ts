import type {
  ResearchAction,
  ResearchBudget,
  ResearchState,
} from "../domain/research.js";

export const DEFAULT_RESEARCH_BUDGET: Omit<ResearchBudget, "startedAt"> = {
  stepsUsed: 0,
  maxSteps: 12,
  searchesUsed: 0,
  maxSearches: 5,
  skepticRounds: 0,
  maxSkepticRounds: 1,
};

export function isBudgetExceeded(state: ResearchState): boolean {
  return (
    state.budget.stepsUsed >= state.budget.maxSteps ||
    state.budget.searchesUsed > state.budget.maxSearches ||
    state.budget.skepticRounds > state.budget.maxSkepticRounds
  );
}

export function actionWouldExceedBudget(
  state: ResearchState,
  action: ResearchAction,
): boolean {
  if (state.budget.stepsUsed >= state.budget.maxSteps) return true;

  if (
    (action.type === "SEARCH_OFFICIAL" || action.type === "SEARCH_NEWS") &&
    state.budget.searchesUsed >= state.budget.maxSearches
  ) {
    return true;
  }

  if (
    action.type === "RUN_SKEPTIC" &&
    state.budget.skepticRounds >= state.budget.maxSkepticRounds
  ) {
    return true;
  }

  return false;
}
