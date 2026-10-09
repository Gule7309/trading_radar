import type { LlmProvider } from "../infra/llm/provider.js";
import type { SearchProvider } from "../infra/search/provider.js";
import { LlmResearchController } from "../agent/llm-controller.js";
import { DefaultToolRouter } from "../tools/default-tool-router.js";
import { LlmClaimExtractor } from "../evidence/claim-extractor.js";
import { LlmTextualVerifier } from "../evidence/textual-verifier.js";
import { LlmRiskExtractor } from "../evidence/risk-extractor.js";
import { DefaultVerificationPipeline } from "../evidence/verification-pipeline.js";
import { LlmSkeptic } from "../agent/skeptic.js";
import { LlmThesisCompiler } from "../agent/thesis-compiler.js";
import type { ResearchController } from "../agent/controller.js";
import type { ResearchToolRouter } from "../tools/tool-router.js";
import type { ResearchHarnessServices } from "../harness/research-harness.js";

export interface ResearchRuntime {
  controller: ResearchController;
  toolRouter: ResearchToolRouter;
  services: ResearchHarnessServices;
}

export function createResearchRuntime(
  llm: LlmProvider,
  search: SearchProvider,
): ResearchRuntime {
  return {
    controller: new LlmResearchController(llm),
    toolRouter: new DefaultToolRouter(search),
    services: {
      verificationPipeline: new DefaultVerificationPipeline(
        new LlmClaimExtractor(llm),
        new LlmTextualVerifier(llm),
        new LlmRiskExtractor(llm),
      ),
      skeptic: new LlmSkeptic(llm),
      thesisCompiler: new LlmThesisCompiler(llm),
    },
  };
}
