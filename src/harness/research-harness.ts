import { randomUUID } from "node:crypto";
import type { CandidatePacket } from "../domain/candidate.js";
import type {
  Claim,
  ResearchAction,
  ResearchResult,
  ResearchState,
  StopReason,
} from "../domain/research.js";
import type { ResearchController } from "../agent/controller.js";
import type { ResearchToolRouter } from "../tools/tool-router.js";
import { DEFAULT_RESEARCH_BUDGET, isBudgetExceeded } from "./budgets.js";
import { evaluatePublicationGate } from "./publication-gate.js";

function initializeResearchState(candidate: CandidatePacket): ResearchState {
  return {
    runId: randomUUID(),
    candidate,
    phase: "DISCOVERY",
    knownFacts: [],
    openQuestions: [],
    sources: [],
    claims: [],
    evidence: [],
    risks: [],
    conflicts: [],
    budget: {
      ...DEFAULT_RESEARCH_BUDGET,
      startedAt: new Date().toISOString(),
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

function addTrace(
  state: ResearchState,
  action: ResearchAction,
  outcome: string,
  reasonCode: string,
  tool?: string,
): void {
  state.researchTrace.push({
    step: state.budget.stepsUsed,
    action: action.type,
    reasonCode,
    tool,
    outcome,
    createdAt: new Date().toISOString(),
  });
}

function incrementBudget(state: ResearchState, action: ResearchAction): void {
  state.budget.stepsUsed += 1;

  if (action.type === "SEARCH_OFFICIAL" || action.type === "SEARCH_NEWS") {
    state.budget.searchesUsed += 1;
  }

  if (action.type === "RUN_SKEPTIC") {
    state.budget.skepticRounds += 1;
  }
}

function buildBaselineClaimsFromSources(state: ResearchState): void {
  if (state.claims.length > 0) return;

  const official = state.sources.find((source) => source.sourceTier === 1);
  const claims: Claim[] = [];

  if (official) {
    const yoy = official.metadata?.yearOverYearPercent;
    const period = official.dataPeriod;

    claims.push({
      claimId: "claim-core-1",
      text:
        typeof yoy === "number"
          ? `${period ?? "Latest period"} monthly revenue YoY was ${yoy}%.`
          : "Recent revenue performance is supported by an official disclosure.",
      category: "FINANCIAL",
      importance: "CORE",
      status: "SUPPORTED",
    });

    state.evidence.push({
      evidenceId: "evidence-core-1",
      claimId: "claim-core-1",
      sourceId: official.sourceId,
      evidenceText: official.snippet,
      verificationResult: "SUPPORTED",
      verifierReason:
        "Baseline deterministic mapping from a normalized Tier-1 official source.",
    });
  }

  state.invalidationConditions = [
    "A new official disclosure materially reverses the recent revenue trend.",
    "A verified risk materially contradicts the core growth assumption.",
  ];
}

function computeVerificationSummary(state: ResearchState) {
  const coreClaims = state.claims.filter((claim) => claim.importance === "CORE");
  const supportedCore = coreClaims.filter(
    (claim) => claim.status === "SUPPORTED",
  );

  const evidenceSourceIds = new Set(state.evidence.map((item) => item.sourceId));
  const evidenceSources = state.sources.filter((source) =>
    evidenceSourceIds.has(source.sourceId),
  );
  const primarySources = evidenceSources.filter(
    (source) => source.sourceTier === 1,
  );

  return {
    coreClaimCoverage:
      coreClaims.length === 0 ? 0 : supportedCore.length / coreClaims.length,
    primarySourceRatio:
      evidenceSources.length === 0
        ? 0
        : primarySources.length / evidenceSources.length,
    unresolvedConflicts: state.conflicts.filter((conflict) => !conflict.resolved)
      .length,
  };
}

function compileResult(
  state: ResearchState,
  status: ResearchResult["status"],
  decision: ResearchResult["decision"],
  stopReason: StopReason,
): ResearchResult {
  const sourceIdsByClaim = new Map<string, string[]>();

  for (const item of state.evidence) {
    const current = sourceIdsByClaim.get(item.claimId) ?? [];
    current.push(item.sourceId);
    sourceIdsByClaim.set(item.claimId, current);
  }

  return {
    runId: state.runId,
    ticker: state.candidate.ticker,
    companyName: state.candidate.companyName,
    status,
    decision,
    thesis:
      status === "PUBLISHABLE"
        ? `${state.candidate.companyName} merits further research because its recent operating signal is supported by verified evidence while identified downside risks remain monitorable.`
        : undefined,
    keyReasons: state.claims
      .filter((claim) => claim.status === "SUPPORTED")
      .map((claim) => claim.text),
    claims: state.claims.map((claim) => ({
      claimId: claim.claimId,
      text: claim.text,
      status: claim.status,
      sourceIds: sourceIdsByClaim.get(claim.claimId) ?? [],
    })),
    risks: state.risks.map((risk) => ({
      title: risk.title,
      explanation: risk.explanation,
      sourceIds: risk.sourceIds,
    })),
    invalidationConditions: state.invalidationConditions,
    sources: state.sources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      dataPeriod: source.dataPeriod,
      sourceTier: source.sourceTier,
    })),
    verificationSummary: computeVerificationSummary(state),
    researchTrace: state.researchTrace,
    stopReason,
    startedAt: state.budget.startedAt,
    completedAt: new Date().toISOString(),
  };
}

export async function researchCandidate(
  candidate: CandidatePacket,
  controller: ResearchController,
  toolRouter: ResearchToolRouter,
): Promise<ResearchResult> {
  const state = initializeResearchState(candidate);

  while (state.phase !== "DONE" && state.phase !== "REJECTED") {
    if (isBudgetExceeded(state)) {
      state.phase = "REJECTED";
      state.stopReason = "BUDGET_EXHAUSTED";
      return compileResult(
        state,
        "REJECTED",
        "REJECT",
        "BUDGET_EXHAUSTED",
      );
    }

    const action = await controller.decide(state);
    state.lastAction = action;
    incrementBudget(state, action);

    if (
      action.type === "SEARCH_OFFICIAL" ||
      action.type === "SEARCH_NEWS" ||
      action.type === "FETCH_SOURCE"
    ) {
      const observation = await toolRouter.execute(action, {
        candidate: state.candidate,
      });

      state.sources.push(...(observation.sources ?? []));
      state.knownFacts.push(...(observation.knownFacts ?? []));
      state.risks.push(...(observation.risks ?? []));

      addTrace(
        state,
        action,
        observation.summary,
        observation.outcome,
        action.type,
      );

      if (observation.outcome === "ERROR") {
        state.phase = "REJECTED";
        state.stopReason = "SOURCE_FAILURE";
        return compileResult(state, "REJECTED", "REJECT", "SOURCE_FAILURE");
      }

      state.phase = "RESEARCH";
      continue;
    }

    if (action.type === "VERIFY") {
      buildBaselineClaimsFromSources(state);
      addTrace(
        state,
        action,
        "Baseline verification completed.",
        "VERIFICATION_COMPLETE",
      );
      state.phase = "VERIFY";
      continue;
    }

    if (action.type === "RUN_SKEPTIC") {
      addTrace(
        state,
        action,
        "Skeptic stage is scaffolded but not implemented in P0.",
        "SKEPTIC_SKIPPED",
      );
      state.phase = "SKEPTIC";
      continue;
    }

    if (action.type === "REJECT") {
      state.phase = "REJECTED";
      state.stopReason = action.reason;
      addTrace(state, action, action.reason, "CONTROLLER_REJECT");
      return compileResult(state, "REJECTED", "REJECT", action.reason);
    }

    if (action.type === "FINALIZE") {
      const gate = evaluatePublicationGate(state);

      if (gate.ok) {
        state.phase = "DONE";
        state.stopReason = "PUBLISHED";
        addTrace(state, action, "Publication gate passed.", "PUBLISHED");
        return compileResult(state, "PUBLISHABLE", "KEEP", "PUBLISHED");
      }

      addTrace(
        state,
        action,
        `Publication gate failed: ${gate.reason}`,
        gate.reason,
      );

      state.phase = "REJECTED";
      state.stopReason =
        gate.reason === "NO_CORE_CLAIM"
          ? "NO_CORE_CLAIM"
          : gate.reason === "NO_RISK_IDENTIFIED"
            ? "NO_RISK_IDENTIFIED"
            : gate.reason === "HIGH_CONFLICT"
              ? "UNRESOLVED_CONFLICT"
              : "INSUFFICIENT_EVIDENCE";

      return compileResult(state, "REJECTED", "REJECT", state.stopReason);
    }
  }

  return compileResult(state, "REJECTED", "REJECT", "UNKNOWN");
}
