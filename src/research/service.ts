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
    const result = await researchCandidate(
      candidate,
      this.runtime.controller,
      this.runtime.toolRouter,
      this.runtime.services,
    );

    const telemetry = this.runtime.telemetry.snapshot();
    result.metrics = {
      llmCalls: telemetry.calls,
      inputTokens: telemetry.inputTokens,
      outputTokens: telemetry.outputTokens,
      llmLatencyMs: telemetry.latencyMs,
      estimatedCostUsd: telemetry.estimatedCostUsd,
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
