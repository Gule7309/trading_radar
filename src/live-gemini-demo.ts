import { loadEnvFile } from "node:process";
import { CandidatePacketSchema } from "./domain/candidate.js";
import { LlmResearchController } from "./agent/llm-controller.js";
import { DefaultToolRouter } from "./tools/default-tool-router.js";
import {
  geminiProviderFromEnv,
} from "./infra/llm/gemini.js";
import {
  geminiSearchProviderFromEnv,
} from "./infra/search/gemini-google-search.js";
import { LlmClaimExtractor } from "./evidence/claim-extractor.js";
import { LlmTextualVerifier } from "./evidence/textual-verifier.js";
import { LlmRiskExtractor } from "./evidence/risk-extractor.js";
import {
  DefaultVerificationPipeline,
} from "./evidence/verification-pipeline.js";
import { LlmSkeptic } from "./agent/skeptic.js";
import { LlmThesisCompiler } from "./agent/thesis-compiler.js";
import { researchCandidate } from "./harness/research-harness.js";

try {
  loadEnvFile(".env");
} catch {
  // Environment variables may already be supplied by the shell or CI.
}

const [ticker = "2330", companyName = "台積電", marketArg = "TWSE", industry = "半導體業"] =
  process.argv.slice(2);

const market = marketArg.toUpperCase();
if (market !== "TWSE" && market !== "TPEX") {
  throw new Error("Market must be TWSE or TPEX.");
}

const llm = geminiProviderFromEnv();
const search = geminiSearchProviderFromEnv();

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

const result = await researchCandidate(
  candidate,
  new LlmResearchController(llm),
  new DefaultToolRouter(search),
  {
    verificationPipeline: new DefaultVerificationPipeline(
      new LlmClaimExtractor(llm),
      new LlmTextualVerifier(llm),
      new LlmRiskExtractor(llm),
    ),
    skeptic: new LlmSkeptic(llm),
    thesisCompiler: new LlmThesisCompiler(llm),
  },
);

console.log(JSON.stringify(result, null, 2));
