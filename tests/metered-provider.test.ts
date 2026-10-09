import { describe, expect, it } from "vitest";
import type {
  LlmProvider,
  StructuredLlmRequest,
  StructuredLlmResponse,
} from "../src/infra/llm/provider.js";
import { MeteredLlmProvider } from "../src/infra/llm/metered-provider.js";

class FixtureProvider implements LlmProvider {
  readonly name = "fixture";

  async structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>> {
    return {
      data: { ok: true } as T,
      model: "fixture-model",
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        estimatedCostUsd: 0.001,
      },
      latencyMs: 25,
    };
  }
}

describe("MeteredLlmProvider", () => {
  it("aggregates provider-neutral usage by task", async () => {
    const provider = new MeteredLlmProvider(new FixtureProvider());

    await provider.structured({
      task: "VERIFIER",
      system: "test",
      input: {},
      schema: {},
    });

    await provider.structured({
      task: "THESIS",
      system: "test",
      input: {},
      schema: {},
    });

    expect(provider.snapshot()).toMatchObject({
      calls: 2,
      inputTokens: 20,
      outputTokens: 8,
      latencyMs: 50,
      estimatedCostUsd: 0.002,
      callsByTask: {
        VERIFIER: 1,
        THESIS: 1,
      },
    });
  });
});
