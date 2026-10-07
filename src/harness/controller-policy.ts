import type { ResearchState } from "../domain/research.js";
import type { ControllerDecision } from "../agent/controller.js";
import { shouldRunSkeptic } from "../agent/skeptic.js";

function verificationReady(state: ResearchState): boolean {
  return state.sources.some((source) => source.sourceTier <= 2);
}

function forceVerify(reason: string): ControllerDecision {
  return {
    reasonCode: "POLICY_FORCE_VERIFY",
    summary: reason,
    action: {
      type: "VERIFY",
      claimIds: [],
    },
  };
}

export function enforceControllerPolicy(
  state: ResearchState,
  decision: ControllerDecision,
): ControllerDecision {
  const action = decision.action;
  const remainingSteps = state.budget.maxSteps - state.budget.stepsUsed;
  const hasPrimarySource = state.sources.some(
    (source) => source.sourceTier === 1,
  );
  const hasFetchedSecondarySource = state.sources.some(
    (source) => source.sourceTier === 2,
  );

  if (
    state.claims.length === 0 &&
    hasPrimarySource &&
    hasFetchedSecondarySource &&
    action.type !== "VERIFY"
  ) {
    return forceVerify(
      "Primary evidence and a directly fetched secondary source are available; verify before spending budget on more research.",
    );
  }

  if (
    state.claims.length === 0 &&
    verificationReady(state) &&
    remainingSteps <= 4 &&
    action.type !== "VERIFY"
  ) {
    return forceVerify(
      "Reserve the remaining research budget for claim verification before any optional action.",
    );
  }

  if (action.type === "RUN_SKEPTIC") {
    if (state.claims.length === 0) {
      if (verificationReady(state)) {
        return forceVerify(
          "Skeptic review requires verified claims; verify the collected evidence first.",
        );
      }

      return decision;
    }

    if (!shouldRunSkeptic(state)) {
      return {
        reasonCode: "POLICY_SKIP_UNNEEDED_SKEPTIC",
        summary:
          "No configured skeptic trigger is active; continue to the deterministic publication gate.",
        action: { type: "FINALIZE" },
      };
    }
  }

  if (
    action.type === "FINALIZE" &&
    state.claims.length === 0 &&
    verificationReady(state)
  ) {
    return forceVerify(
      "Publication cannot be attempted before collected evidence is converted into verified claims.",
    );
  }

  return decision;
}
