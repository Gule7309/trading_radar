import type { LlmProvider } from "../infra/llm/provider.js";
import type { SearchProvider } from "../infra/search/provider.js";
import { geminiProviderFromEnv } from "../infra/llm/gemini.js";
import { geminiSearchProviderFromEnv } from "../infra/search/gemini-google-search.js";

export interface ProviderBundle {
  llm: LlmProvider;
  search: SearchProvider;
}

export function providersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProviderBundle {
  const llmProvider = (env.LLM_PROVIDER ?? "gemini").toLowerCase();
  const searchProvider = (
    env.SEARCH_PROVIDER ?? "gemini-google-search"
  ).toLowerCase();

  if (llmProvider !== "gemini") {
    throw new Error(
      `Unsupported LLM_PROVIDER=${llmProvider}. ` +
        "The runtime is provider-neutral; add an adapter before selecting it.",
    );
  }

  if (searchProvider !== "gemini-google-search") {
    throw new Error(
      `Unsupported SEARCH_PROVIDER=${searchProvider}. ` +
        "Add a SearchProvider adapter before selecting it.",
    );
  }

  return {
    llm: geminiProviderFromEnv(env),
    search: geminiSearchProviderFromEnv(env),
  };
}
