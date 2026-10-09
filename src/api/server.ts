import { loadEnvFile } from "node:process";
import { providersFromEnv } from "../runtime/provider-factory.js";
import { createResearchRuntime } from "../runtime/research-runtime.js";
import { SqliteResearchRunStore } from "../research/sqlite-store.js";
import { ResearchService } from "../research/service.js";
import { createResearchApi } from "./research-api.js";

try {
  loadEnvFile(".env");
} catch {
  // Environment variables may already be supplied externally.
}

const providers = providersFromEnv();
const runtime = createResearchRuntime(providers.llm, providers.search);
const store = new SqliteResearchRunStore(
  process.env.SQLITE_PATH ?? "trading-radar.sqlite",
);
const service = new ResearchService(runtime, store);
const server = createResearchApi(service, {
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
});

const port = Number(process.env.PORT ?? "8787");

server.listen(port, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      service: "trading-radar-b",
      listening: `http://127.0.0.1:${port}`,
      llmProvider: providers.llm.name,
      searchProvider: providers.search.name,
    }),
  );
});

const shutdown = () => {
  server.close(() => {
    store.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
