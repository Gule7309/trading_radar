import { loadEnvFile } from "node:process";
import { providersFromEnv } from "../runtime/provider-factory.js";
import { createResearchRuntime } from "../runtime/research-runtime.js";
import { SqliteResearchRunStore } from "../research/sqlite-store.js";
import { ResearchService } from "../research/service.js";
import { SqliteThesisStore } from "../thesis/sqlite-store.js";
import { ThesisService } from "../thesis/service.js";
import { ThesisResearchService } from "../thesis/research-service.js";
import { createResearchApi } from "./research-api.js";

try {
  loadEnvFile(".env");
} catch {
  // Environment variables may already be supplied externally.
}

const providers = providersFromEnv();
const runtime = createResearchRuntime(providers.llm, providers.search);
const sqlitePath = process.env.SQLITE_PATH ?? "trading-radar.sqlite";

const researchStore = new SqliteResearchRunStore(sqlitePath);
const research = new ResearchService(runtime, researchStore);

const thesisStore = new SqliteThesisStore(sqlitePath);
const thesisService = new ThesisService(thesisStore);
const theses = new ThesisResearchService(research, thesisService);

const server = createResearchApi(research, {
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  theses,
});

const port = Number(process.env.PORT ?? "8787");

server.listen(port, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      service: "trading-radar-b",
      listening: `http://127.0.0.1:${port}`,
      llmProvider: providers.llm.name,
      searchProvider: providers.search.name,
      thesisTracking: true,
    }),
  );
});

const shutdown = () => {
  server.close(() => {
    researchStore.close();
    thesisStore.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
