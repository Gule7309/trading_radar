export type LlmTask =
  | "CONTROLLER"
  | "CLAIM_EXTRACTION"
  | "RISK_EXTRACTION"
  | "VERIFIER"
  | "SKEPTIC"
  | "THESIS";

export interface StructuredLlmRequest<TSchema = unknown> {
  task: LlmTask;
  system: string;
  input: unknown;
  schema: TSchema;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface StructuredLlmResponse<T> {
  data: T;
  model: string;
  usage?: LlmUsage;
  latencyMs?: number;
}

export interface LlmProvider {
  readonly name: string;

  structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>>;
}

export class UnconfiguredLlmProvider implements LlmProvider {
  readonly name = "unconfigured";

  async structured<T>(): Promise<StructuredLlmResponse<T>> {
    throw new Error(
      "No LLM provider is configured. Choose a model/provider before enabling " +
        "controller, claim extraction, textual verification, skeptic, or thesis synthesis.",
    );
  }
}
