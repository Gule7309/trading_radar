import { loadEnvFile } from "node:process";
import { CandidatePacketSchema } from "./domain/candidate.js";
import { providersFromEnv } from "./runtime/provider-factory.js";
import { createResearchRuntime } from "./runtime/research-runtime.js";
import { InMemoryResearchRunStore } from "./research/store.js";
import { ResearchService } from "./research/service.js";

try {
  loadEnvFile(".env");
} catch {
  // Environment variables may already be supplied by the shell or CI.
}

const [
  ticker = "2330",
  companyName = "台積電",
  marketArg = "TWSE",
  industry = "半導體業",
] = process.argv.slice(2);

const market = marketArg.toUpperCase();
if (market !== "TWSE" && market !== "TPEX") {
  throw new Error("Market must be TWSE or TPEX.");
}

const providers = providersFromEnv();
const runtime = createResearchRuntime(providers.llm, providers.search);
const service = new ResearchService(
  runtime,
  new InMemoryResearchRunStore(),
);

const candidate = CandidatePacketSchema.parse({
  candidateId: `live-${ticker}`,
  ticker,
  companyName,
  market,
  industry,
  asOf: new Date().toISOString().slice(0, 10),
  quantScore: 0,
  quantSignals: [],
  hardConstraintsPassed: true,
  dataSources: [
    {
      source: "manual-live-demo",
      asOf: new Date().toISOString().slice(0, 10),
    },
  ],
});

const result = await service.run(candidate);

console.log(JSON.stringify(result, null, 2));
