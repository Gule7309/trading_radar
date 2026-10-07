import { describe, expect, it } from "vitest";
import type {
  LlmProvider,
  StructuredLlmRequest,
  StructuredLlmResponse,
} from "../src/infra/llm/provider.js";
import { LlmTextualVerifier } from "../src/evidence/textual-verifier.js";
import { LlmSkeptic } from "../src/agent/skeptic.js";
import { LlmThesisCompiler } from "../src/agent/thesis-compiler.js";
import type { ResearchState } from "../src/domain/research.js";

class FakeLlmProvider implements LlmProvider {
  readonly name = "fake";

  async structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>> {
    let data: unknown;

    if (request.task === "VERIFIER") {
      data = {
        result: "SUPPORTED",
        reason: "The source explicitly states the same metric.",
        evidenceSpan: "YoY 35%",
      };
    } else if (request.task === "SKEPTIC") {
      data = {
        shouldSearch: true,
        weakness: "Growth may be one-off.",
        falsificationQuestion: "Was the growth caused by a one-time event?",
        suggestedQuery: "company one-time revenue disclosure",
      };
    } else if (request.task === "THESIS") {
      data = {
        thesis: "Verified revenue growth is worth monitoring.",
        keyReasons: ["Official revenue growth evidence"],
        invalidationConditions: ["Revenue YoY turns negative."],
      };
    } else {
      data = { claims: [] };
    }

    return {
      data: data as T,
      model: "fake-model",
    };
  }
}

function baseState(): ResearchState {
  return {
    runId: "run-1",
    candidate: {
      candidateId: "c1",
      ticker: "2330",
      companyName: "Fixture Company",
      market: "TWSE",
      industry: "Semiconductors",
      asOf: "2026-10-07",
      quantScore: 0.9,
      quantSignals: [],
      hardConstraintsPassed: true,
    },
    phase: "VERIFY",
    knownFacts: [],
    openQuestions: [],
    sources: [],
    claims: [
      {
        claimId: "c1",
        text: "Revenue YoY was 35%.",
        category: "FINANCIAL",
        importance: "CORE",
        status: "SUPPORTED",
      },
    ],
    evidence: [],
    risks: [
      {
        riskId: "r1",
        title: "Margin pressure",
        explanation: "Margins may decline.",
        sourceIds: ["s1"],
      },
    ],
    conflicts: [],
    budget: {
      stepsUsed: 1,
      maxSteps: 8,
      searchesUsed: 1,
      maxSearches: 4,
      skepticRounds: 0,
      maxSkepticRounds: 1,
      startedAt: "2026-10-07T00:00:00Z",
    },
    researchTrace: [],
    invalidationConditions: [],
  };
}

describe("structured model services", () => {
  it("verifies a claim against an isolated source excerpt", async () => {
    const verifier = new LlmTextualVerifier(new FakeLlmProvider());

    const result = await verifier.verify(baseState().claims[0]!, {
      sourceId: "s1",
      url: "https://example.com",
      title: "Official",
      publisher: "TWSE",
      sourceType: "TWSE",
      sourceTier: 1,
      retrievedAt: "2026-10-07T00:00:00Z",
      snippet: "YoY 35%",
      contentHash: "x",
      untrustedContent: true,
    });

    expect(result.result).toBe("SUPPORTED");
  });

  it("returns a falsification question", async () => {
    const skeptic = new LlmSkeptic(new FakeLlmProvider());
    const result = await skeptic.review(baseState(), "Growth thesis");

    expect(result.shouldSearch).toBe(true);
    expect(result.falsificationQuestion).toContain("one-time");
  });

  it("compiles a thesis from supported state", async () => {
    const compiler = new LlmThesisCompiler(new FakeLlmProvider());
    const result = await compiler.compile(baseState());

    expect(result.thesis).toContain("revenue growth");
    expect(result.invalidationConditions.length).toBeGreaterThan(0);
  });
});
