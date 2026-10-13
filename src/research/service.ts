import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";
import { researchCandidate } from "../harness/research-harness.js";
import type { ResearchRuntime } from "../runtime/research-runtime.js";
import type { ResearchRunStore } from "./store.js";

export class ResearchService {
  constructor(
    private readonly runtime: ResearchRuntime,
    private readonly store: ResearchRunStore,
  ) {}

  async run(candidate: CandidatePacket): Promise<ResearchResult> {
    const startedAtMs = Date.now();
    const before = this.runtime.telemetry.snapshot();

    const result = await researchCandidate(
      candidate,
      this.runtime.controller,
      this.runtime.toolRouter,
      this.runtime.services,
    );

    const after = this.runtime.telemetry.snapshot();
    const beforeCost = before.estimatedCostUsd ?? 0;
    const afterCost = after.estimatedCostUsd ?? 0;
    const hasCost =
      before.estimatedCostUsd !== undefined ||
      after.estimatedCostUsd !== undefined;

    result.metrics = {
      llmCalls: after.calls - before.calls,
      inputTokens: after.inputTokens - before.inputTokens,
      outputTokens: after.outputTokens - before.outputTokens,
      llmLatencyMs: after.latencyMs - before.latencyMs,
      estimatedCostUsd: hasCost ? afterCost - beforeCost : undefined,
      totalLatencyMs: Date.now() - startedAtMs,
    };

    await this.store.save({
      runId: result.runId,
      ticker: result.ticker,
      candidate,
      result,
      createdAt: result.startedAt,
    });

    return result;
  }

  async get(runId: string) {
    return this.store.get(runId);
  }

  async listByTicker(ticker: string, limit?: number) {
    return this.store.listByTicker(ticker, limit);
  }
}
