import type {
  LlmProvider,
  LlmTask,
  StructuredLlmRequest,
  StructuredLlmResponse,
} from "./provider.js";

export interface LlmTelemetrySnapshot {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd?: number;
  callsByTask: Partial<Record<LlmTask, number>>;
}

export class MeteredLlmProvider implements LlmProvider {
  readonly name: string;

  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private latencyMs = 0;
  private estimatedCostUsd = 0;
  private hasCost = false;
  private readonly callsByTask: Partial<Record<LlmTask, number>> = {};

  constructor(private readonly inner: LlmProvider) {
    this.name = inner.name;
  }

  async structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>> {
    const startedAt = Date.now();

    try {
      const response = await this.inner.structured<T>(request);
      const observedLatency = response.latencyMs ?? Date.now() - startedAt;

      this.calls += 1;
      this.callsByTask[request.task] =
        (this.callsByTask[request.task] ?? 0) + 1;
      this.inputTokens += response.usage?.inputTokens ?? 0;
      this.outputTokens += response.usage?.outputTokens ?? 0;
      this.latencyMs += observedLatency;

      if (response.usage?.estimatedCostUsd !== undefined) {
        this.hasCost = true;
        this.estimatedCostUsd += response.usage.estimatedCostUsd;
      }

      return response;
    } catch (error) {
      this.calls += 1;
      this.callsByTask[request.task] =
        (this.callsByTask[request.task] ?? 0) + 1;
      this.latencyMs += Date.now() - startedAt;
      throw error;
    }
  }

  snapshot(): LlmTelemetrySnapshot {
    return {
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      latencyMs: this.latencyMs,
      estimatedCostUsd: this.hasCost
        ? this.estimatedCostUsd
        : undefined,
      callsByTask: { ...this.callsByTask },
    };
  }
}
