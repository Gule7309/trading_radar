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

export interface LlmPricing {
  inputCostPerMillionUsd?: number;
  outputCostPerMillionUsd?: number;
}

function validPrice(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : undefined;
}

export function llmPricingFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmPricing {
  return {
    inputCostPerMillionUsd: validPrice(
      env.LLM_INPUT_COST_PER_1M_USD,
    ),
    outputCostPerMillionUsd: validPrice(
      env.LLM_OUTPUT_COST_PER_1M_USD,
    ),
  };
}

function estimateUsageCost(
  inputTokens: number,
  outputTokens: number,
  pricing: LlmPricing,
): number | undefined {
  if (
    pricing.inputCostPerMillionUsd === undefined &&
    pricing.outputCostPerMillionUsd === undefined
  ) {
    return undefined;
  }

  return (
    (inputTokens / 1_000_000) *
      (pricing.inputCostPerMillionUsd ?? 0) +
    (outputTokens / 1_000_000) *
      (pricing.outputCostPerMillionUsd ?? 0)
  );
}

export class MeteredLlmProvider implements LlmProvider {
  readonly name: string;

  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private latencyMs = 0;
  private estimatedCostUsd = 0;
  private hasCost = false;
  private readonly callsByTask: Partial<
    Record<LlmTask, number>
  > = {};

  constructor(
    private readonly inner: LlmProvider,
    private readonly pricing: LlmPricing = {},
  ) {
    this.name = inner.name;
  }

  async structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>> {
    const startedAt = Date.now();

    try {
      const response =
        await this.inner.structured<T>(request);
      const observedLatency =
        response.latencyMs ??
        Date.now() - startedAt;
      const inputTokens =
        response.usage?.inputTokens ?? 0;
      const outputTokens =
        response.usage?.outputTokens ?? 0;

      this.calls += 1;
      this.callsByTask[request.task] =
        (this.callsByTask[request.task] ?? 0) + 1;
      this.inputTokens += inputTokens;
      this.outputTokens += outputTokens;
      this.latencyMs += observedLatency;

      const cost =
        response.usage?.estimatedCostUsd ??
        estimateUsageCost(
          inputTokens,
          outputTokens,
          this.pricing,
        );

      if (cost !== undefined) {
        this.hasCost = true;
        this.estimatedCostUsd += cost;
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
