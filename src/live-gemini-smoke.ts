import { loadEnvFile } from "node:process";
import { z } from "zod";
import { geminiProviderFromEnv } from "./infra/llm/gemini.js";
import { geminiSearchProviderFromEnv } from "./infra/search/gemini-google-search.js";

try {
  loadEnvFile(".env");
} catch {
  // Shell/CI variables are also supported.
}

const llm = geminiProviderFromEnv();
const search = geminiSearchProviderFromEnv();

let failed = false;

try {
  const response = await llm.structured<{
    ok: boolean;
    message: string;
  }>({
    task: "VERIFIER",
    system:
      "Return a minimal structured health-check response. Do not use external tools.",
    input: {
      instruction: "Set ok=true and message=gemini-ready.",
    },
    schema: z.object({
      ok: z.boolean(),
      message: z.string(),
    }),
  });

  console.log(
    JSON.stringify(
      {
        stage: "structured-output",
        ok: true,
        model: response.model,
        data: response.data,
        usage: response.usage,
        latencyMs: response.latencyMs,
      },
      null,
      2,
    ),
  );
} catch (error) {
  failed = true;
  console.error(
    JSON.stringify(
      {
        stage: "structured-output",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
}

try {
  const results = await search.search({
    query:
      "台積電 2330 最新重大資訊或營運消息，優先官方與可信財經來源",
    maxResults: 3,
  });

  console.log(
    JSON.stringify(
      {
        stage: "google-search-grounding",
        ok: results.length > 0,
        resultCount: results.length,
        results: results.map((result) => ({
          title: result.title,
          url: result.url,
          publisher: result.publisher,
          snippet: result.snippet.slice(0, 240),
        })),
      },
      null,
      2,
    ),
  );

  if (results.length === 0) failed = true;
} catch (error) {
  failed = true;
  console.error(
    JSON.stringify(
      {
        stage: "google-search-grounding",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
}

if (failed) {
  process.exitCode = 1;
}
