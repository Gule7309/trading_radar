import type { ResearchBudget, ResearchState } from "../domain/research.js";

export const DEFAULT_RESEARCH_BUDGET: Omit<ResearchBudget, "startedAt"> = {
  stepsUsed: 0,
  maxSteps: 8,
  searchesUsed: 0,
  maxSearches: 4,
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
