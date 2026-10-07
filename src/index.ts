import { CandidatePacketSchema } from "./domain/candidate.js";
import { MockResearchController } from "./agent/controller.js";
import { researchCandidate } from "./harness/research-harness.js";
import { MockToolRouter } from "./tools/tool-router.js";

const candidate = CandidatePacketSchema.parse({
  candidateId: "demo-2330",
  ticker: "2330",
  companyName: "Demo Semiconductor",
  market: "TWSE",
  industry: "Semiconductors",
  asOf: "2026-10-07",
  quantScore: 0.88,
  quantSignals: [
    {
      metric: "revenue_yoy",
      value: 0.35,
      period: "2026-09",
      industryPercentile: 90,
    },
  ],
  hardConstraintsPassed: true,
  dataSources: [
    {
      source: "mock-quant",
      asOf: "2026-10-07",
    },
  ],
});

const result = await researchCandidate(
  candidate,
  new MockResearchController(),
  new MockToolRouter(),
);

console.log(JSON.stringify(result, null, 2));
