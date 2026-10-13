import { describe, expect, it } from "vitest";
import { providersFromEnv } from "../src/runtime/provider-factory.js";

describe("providersFromEnv", () => {
  it("creates Gemini adapters for the current development runtime", () => {
    const providers = providersFromEnv({
      LLM_PROVIDER: "gemini",
      SEARCH_PROVIDER: "gemini-google-search",
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-3.8-flash",
    });

    expect(providers.llm.name).toBe("gemini");
    expect(providers.search.name).toBe("gemini-google-search");
  });

  it("fails explicitly rather than silently binding an unknown future provider", () => {
    expect(() =>
      providersFromEnv({
        LLM_PROVIDER: "openai",
        SEARCH_PROVIDER: "gemini-google-search",
        GEMINI_API_KEY: "test-key",
      }),
    ).toThrow(/Unsupported LLM_PROVIDER=openai/);
  });
});
