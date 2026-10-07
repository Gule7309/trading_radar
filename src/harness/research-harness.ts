import { randomUUID } from "node:crypto";
import type { CandidatePacket } from "../domain/candidate.js";
import type {
  Claim,
  ResearchAction,
  ResearchResult,
  ResearchState,
  StopReason,
} from "../domain/research.js";
import type {
  ControllerDecision,
  ResearchController,
} from "../agent/controller.js";
import type { ResearchToolRouter } from "../tools/tool-router.js";
import type { VerificationPipeline } from "../evidence/verification-pipeline.js";
import type { Skeptic } from "../agent/skeptic.js";
import type { ThesisCompiler } from "../agent/thesis-compiler.js";
import {
  DEFAULT_RESEARCH_BUDGET,
  actionWouldExceedBudget,
  isBudgetExceeded,
} from "./budgets.js";
import { evaluatePublicationGate } from "./publication-gate.js";
import { enforceControllerPolicy } from "./controller-policy.js";

export interface ResearchHarnessServices {
  verificationPipeline?: VerificationPipeline;
  skeptic?: Skeptic;
  thesisCompiler?: ThesisCompiler;
}

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
    evidenceDirty: false,
    diagnostics: [],
    invalidationConditions: [],
  };
}

function actionDetail(action: ResearchAction): string | undefined {
  if (action.type === "SEARCH_OFFICIAL") return action.dataset;
  if (action.type === "SEARCH_NEWS") return action.query;
  if (action.type === "FETCH_SOURCE") return action.sourceId;
  return undefined;
}

function addTrace(
  state: ResearchState,
  decision: ControllerDecision,
  outcome: string,
  tool?: string,
): void {
  state.researchTrace.push({
    step: state.budget.stepsUsed,
    action: decision.action.type,
    actionDetail: actionDetail(decision.action),
    reasonCode: decision.reasonCode,
    decisionSummary: decision.summary,
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

  const official = state.sources.find(
    (source) =>
      source.sourceTier === 1 &&
      typeof source.metadata?.yearOverYearPercent === "number",
  );
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

  state.claims.push(...claims);

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
  overrides?: {
    thesis?: string;
    keyReasons?: string[];
  },
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
        ? overrides?.thesis ??
          `${state.candidate.companyName} merits further research because its recent operating signal is supported by verified evidence while identified downside risks remain monitorable.`
        : undefined,
    keyReasons:
      overrides?.keyReasons ??
      state.claims
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
    diagnostics: state.diagnostics ?? [],
    stopReason,
    startedAt: state.budget.startedAt,
    completedAt: new Date().toISOString(),
  };
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown model service failure.";
}

function addDiagnostic(
  state: ResearchState,
  stage: "CONTROLLER" | "VERIFICATION" | "SKEPTIC" | "THESIS",
  error: unknown,
): void {
  (state.diagnostics ??= []).push({
    stage,
    message: describeError(error),
    createdAt: new Date().toISOString(),
  });
}

function modelFailureResult(
  state: ResearchState,
  decision: ControllerDecision,
  stage: "VERIFICATION" | "SKEPTIC" | "THESIS",
  error: unknown,
): ResearchResult {
  addDiagnostic(state, stage, error);
  addTrace(
    state,
    decision,
    describeError(error),
  );
  state.phase = "REJECTED";
  state.stopReason = "MODEL_FAILURE";
  return compileResult(state, "REJECTED", "REJECT", "MODEL_FAILURE");
}

export async function researchCandidate(
  candidate: CandidatePacket,
  controller: ResearchController,
  toolRouter: ResearchToolRouter,
  services: ResearchHarnessServices = {},
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

    let decision: ControllerDecision;

    try {
      decision = await controller.decide(state);
    } catch (error) {
      addDiagnostic(state, "CONTROLLER", error);
      state.phase = "REJECTED";
      state.stopReason = "MODEL_FAILURE";
      return compileResult(state, "REJECTED", "REJECT", "MODEL_FAILURE");
    }

    decision = enforceControllerPolicy(state, decision);

    const action = decision.action;

    if (actionWouldExceedBudget(state, action)) {
      state.phase = "REJECTED";
      state.stopReason = "BUDGET_EXHAUSTED";
      return compileResult(
        state,
        "REJECTED",
        "REJECT",
        "BUDGET_EXHAUSTED",
      );
    }

    state.lastAction = action;
    incrementBudget(state, action);

    if (
      action.type === "SEARCH_OFFICIAL" ||
      action.type === "SEARCH_NEWS" ||
      action.type === "FETCH_SOURCE"
    ) {
      const observation = await toolRouter.execute(action, {
        candidate: state.candidate,
        sources: state.sources,
      });

      const newSources = observation.sources ?? [];
      state.sources.push(...newSources);
      if (newSources.length > 0) {
        state.evidenceDirty = true;
      }
      state.knownFacts.push(...(observation.knownFacts ?? []));
      state.risks.push(...(observation.risks ?? []));

      addTrace(state, decision, observation.summary, action.type);

      if (observation.outcome === "ERROR") {
        state.openQuestions.push({
          questionId: `tool-failure-${state.budget.stepsUsed}`,
          text:
            `Tool action ${action.type} failed: ${observation.summary}`,
          evidenceNeed:
            observation.retryable === false
              ? "Use a different source or research path."
              : "Retry only if justified; otherwise use a different source or research path.",
          status: "OPEN",
        });

        if (isBudgetExceeded(state)) {
          state.phase = "REJECTED";
          state.stopReason = "SOURCE_FAILURE";
          return compileResult(
            state,
            "REJECTED",
            "REJECT",
            "SOURCE_FAILURE",
          );
        }

        state.phase = "RESEARCH";
        continue;
      }

      state.phase = "RESEARCH";
      continue;
    }

    if (action.type === "VERIFY") {
      try {
        if (services.verificationPipeline) {
          await services.verificationPipeline.run(state);
        } else {
          buildBaselineClaimsFromSources(state);
        }
      } catch (error) {
        return modelFailureResult(state, decision, "VERIFICATION", error);
      }

      state.evidenceDirty = false;
      addTrace(state, decision, "Verification completed.");
      state.phase = "VERIFY";
      continue;
    }

    if (action.type === "RUN_SKEPTIC") {
      if (!services.skeptic) {
        addTrace(
          state,
          decision,
          "Skeptic stage requested but no skeptic service is configured.",
        );
        state.phase = "SKEPTIC";
        continue;
      }

      try {
        const result = await services.skeptic.review(
          state,
          action.thesisDraft,
        );

        if (result.shouldSearch) {
          state.openQuestions.push({
            questionId: `skeptic-${state.budget.skepticRounds}`,
            text: result.falsificationQuestion,
            evidenceNeed: result.suggestedQuery,
            status: "OPEN",
          });
        }

        addTrace(
          state,
          decision,
          `Skeptic: ${result.weakness}`,
          "SKEPTIC",
        );
        state.phase = "SKEPTIC";
        continue;
      } catch (error) {
        return modelFailureResult(state, decision, "SKEPTIC", error);
      }
    }

    if (action.type === "REJECT") {
      state.phase = "REJECTED";
      state.stopReason = action.reason;
      addTrace(state, decision, action.reason);
      return compileResult(state, "REJECTED", "REJECT", action.reason);
    }

    if (action.type === "FINALIZE") {
      const gate = evaluatePublicationGate(state);

      if (gate.ok) {
        let overrides:
          | {
              thesis?: string;
              keyReasons?: string[];
            }
          | undefined;

        if (services.thesisCompiler) {
          try {
            const compilation = await services.thesisCompiler.compile(state);
            state.invalidationConditions =
              compilation.invalidationConditions;
            overrides = {
              thesis: compilation.thesis,
              keyReasons: compilation.keyReasons,
            };
          } catch (error) {
            return modelFailureResult(state, decision, "THESIS", error);
          }
        }

        state.phase = "DONE";
        state.stopReason = "PUBLISHED";
        addTrace(state, decision, "Publication gate passed.");
        return compileResult(
          state,
          "PUBLISHABLE",
          "KEEP",
          "PUBLISHED",
          overrides,
        );
      }

      addTrace(
        state,
        decision,
        `Publication gate failed: ${gate.reason}`,
      );

      if (
        (gate.reason === "CORE_CLAIM_DISCOVERY_ONLY" ||
          gate.reason === "FINANCIAL_CORE_WITHOUT_PRIMARY" ||
          gate.reason === "RISK_DISCOVERY_ONLY" ||
          gate.reason === "NO_RISK_IDENTIFIED") &&
        !isBudgetExceeded(state)
      ) {
        state.openQuestions.push({
          questionId: `publication-gap-${state.budget.stepsUsed}`,
          text: `Publication blocked by evidence quality: ${gate.reason}`,
          evidenceNeed:
            gate.reason === "FINANCIAL_CORE_WITHOUT_PRIMARY"
              ? "Find a Tier-1 official source for the financial core claim."
              : gate.reason === "NO_RISK_IDENTIFIED"
                ? "Find a current company-specific downside risk source, fetch it, and verify again."
                : "Fetch the underlying web source so discovery-only evidence becomes directly inspectable.",
          status: "OPEN",
        });
        state.phase = "RESEARCH";
        continue;
      }

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
