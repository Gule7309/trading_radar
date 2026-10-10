import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";
import type {
  BatchResearchOptions,
  BatchResearchResult,
} from "../research/batch-service.js";
import type { StoredResearchRun } from "../research/store.js";
import type {
  ThesisEvent,
  ThesisVersion,
} from "../thesis/types.js";
import {
  createResearchApi,
  type BatchResearchApiService,
  type ResearchApiService,
  type ThesisApiService,
} from "./research-api.js";

function mockResult(candidate: CandidatePacket): ResearchResult {
  const now = new Date().toISOString();
  const officialSourceId = `mock-official-${candidate.ticker}`;
  const riskSourceId = `mock-risk-${candidate.ticker}`;
  const coreSignal =
    candidate.quantSignals.find((signal) => signal.metric === "revenue_yoy") ??
    candidate.quantSignals[0];

  return {
    runId: `mock-${candidate.candidateId}`,
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    status: "PUBLISHABLE",
    decision: "KEEP",
    thesis:
      `[MOCK] ${candidate.companyName} has a supported quantitative signal and a monitorable downside risk. Replace this with a live B run before demo sign-off.`,
    keyReasons: [
      coreSignal
        ? `[MOCK] ${coreSignal.metric} = ${String(coreSignal.value)} for ${coreSignal.period}.`
        : "[MOCK] Candidate passed the upstream screening contract.",
    ],
    claims: [
      {
        claimId: `mock-claim-${candidate.ticker}`,
        text: coreSignal
          ? `[MOCK] ${coreSignal.metric} is supported by upstream quantitative evidence.`
          : "[MOCK] Upstream quantitative evidence is available.",
        status: "SUPPORTED",
        category: "FINANCIAL",
        importance: "CORE",
        sourceIds: [officialSourceId],
      },
    ],
    risks: [
      {
        title:
          candidate.riskFlags?.length
            ? `[MOCK] Upstream risk flag: ${candidate.riskFlags.join(", ")}`
            : "[MOCK] Margin / execution risk",
        explanation:
          "Mock risk content for frontend development only. Live research must replace this text.",
        sourceIds: [riskSourceId],
        addressesRiskFlags: candidate.riskFlags ?? [],
      },
    ],
    invalidationConditions: [
      "[MOCK] A later verified disclosure materially reverses the core signal.",
    ],
    sources: [
      {
        sourceId: officialSourceId,
        title: "[MOCK] Official quantitative evidence",
        url: "https://example.invalid/mock-official",
        publisher: "MOCK",
        sourceType: "MOPS",
        dataPeriod: coreSignal?.period,
        sourceTier: 1,
      },
      {
        sourceId: riskSourceId,
        title: "[MOCK] Current downside evidence",
        url: "https://example.invalid/mock-risk",
        publisher: "MOCK",
        sourceType: "NEWS",
        publishedAt: candidate.asOf,
        sourceTier: 2,
      },
    ],
    verificationSummary: {
      coreClaimCoverage: 1,
      primarySourceRatio: 0.5,
      unresolvedConflicts: 0,
      freshness: "CURRENT",
    },
    researchTrace: [
      {
        step: 1,
        action: "VERIFY",
        reasonCode: "MOCK_UPSTREAM_EVIDENCE",
        decisionSummary: "Reuse upstream quantitative evidence.",
        outcome: "Mock verification completed.",
        createdAt: now,
      },
      {
        step: 2,
        action: "SEARCH_NEWS",
        actionDetail: "mock downside evidence",
        reasonCode: "MOCK_RISK",
        decisionSummary: "Collect a mock downside source for UI development.",
        tool: "SEARCH_NEWS",
        outcome: "Mock risk source created.",
        createdAt: now,
      },
      {
        step: 3,
        action: "FINALIZE",
        reasonCode: "MOCK_FINALIZE",
        decisionSummary: "Pass mock publication gate.",
        outcome: "Mock result published.",
        createdAt: now,
      },
    ],
    diagnostics: [],
    metrics: {
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      llmLatencyMs: 0,
      totalLatencyMs: 25,
    },
    stopReason: "PUBLISHED",
    startedAt: now,
    completedAt: now,
  };
}

class MockResearchService implements ResearchApiService {
  private readonly runs = new Map<string, StoredResearchRun>();

  async run(candidate: CandidatePacket): Promise<ResearchResult> {
    const result = mockResult(candidate);
    this.runs.set(result.runId, {
      runId: result.runId,
      ticker: result.ticker,
      candidate,
      result,
      createdAt: result.startedAt,
    });
    return result;
  }

  async get(runId: string): Promise<StoredResearchRun | null> {
    return this.runs.get(runId) ?? null;
  }

  async listByTicker(
    ticker: string,
    limit = 20,
  ): Promise<StoredResearchRun[]> {
    return Array.from(this.runs.values())
      .filter((run) => run.ticker === ticker)
      .slice(0, limit);
  }
}

class MockBatchService implements BatchResearchApiService {
  constructor(private readonly research: MockResearchService) {}

  async run(
    candidates: CandidatePacket[],
    options: BatchResearchOptions = {},
  ): Promise<BatchResearchResult> {
    const topK = Math.max(1, Math.min(options.topK ?? 5, 20));
    const completed = await Promise.all(
      candidates
        .filter((candidate) => candidate.hardConstraintsPassed)
        .map(async (candidate) => ({
          candidate,
          result: await this.research.run(candidate),
        })),
    );

    const top = completed
      .sort(
        (a, b) =>
          b.candidate.quantScore - a.candidate.quantScore ||
          a.candidate.ticker.localeCompare(b.candidate.ticker),
      )
      .slice(0, topK)
      .map(({ candidate, result }, index) => ({
        rank: index + 1,
        candidateId: candidate.candidateId,
        ticker: candidate.ticker,
        score: candidate.quantScore,
        quantScore: candidate.quantScore,
        evidenceQuality: 1,
        result,
      }));

    return {
      researched: completed.length,
      rejectedOrSkipped: candidates
        .filter((candidate) => !candidate.hardConstraintsPassed)
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          ticker: candidate.ticker,
          status: "SKIPPED" as const,
          stopReason: "HARD_CONSTRAINT_FAILED",
        })),
      top,
    };
  }
}

class MockThesisService implements ThesisApiService {
  private readonly versions = new Map<string, ThesisVersion[]>();
  private readonly events = new Map<string, ThesisEvent[]>();

  async create(
    candidate: CandidatePacket,
    thesisId = `mock-thesis-${candidate.ticker}`,
  ) {
    const thesis: ThesisVersion = {
      thesisId,
      ticker: candidate.ticker,
      version: 1,
      thesisText: `[MOCK] Saved thesis for ${candidate.companyName}.`,
      status: "ACTIVE",
      coreClaims: [],
      supportingClaims: [],
      risks: [],
      invalidationConditions: [
        "[MOCK] Recheck when new material evidence arrives.",
      ],
      createdAt: new Date().toISOString(),
    };
    this.versions.set(thesisId, [thesis]);
    this.events.set(thesisId, []);

    return {
      researchRunId: `mock-${candidate.candidateId}`,
      thesis,
    };
  }

  async recheck(
    thesisId: string,
    candidate: CandidatePacket,
    eventType: ThesisEvent["eventType"] = "MANUAL_RECHECK",
  ) {
    const previous = await this.getLatest(thesisId);
    if (!previous) {
      throw new Error("MOCK_THESIS_NOT_FOUND");
    }

    const thesis: ThesisVersion = {
      ...previous,
      version: previous.version + 1,
      status: "UNCHANGED",
      createdAt: new Date().toISOString(),
      changeReason: "[MOCK] No material verified change.",
    };
    const versions = this.versions.get(thesisId) ?? [];
    versions.push(thesis);
    this.versions.set(thesisId, versions);

    const event: ThesisEvent = {
      eventId: `mock-event-${thesis.version}`,
      thesisId,
      ticker: candidate.ticker,
      occurredAt: thesis.createdAt,
      eventType,
      summary: "[MOCK] Thesis recheck completed.",
      sourceIds: [],
    };
    const events = this.events.get(thesisId) ?? [];
    events.push(event);
    this.events.set(thesisId, events);

    return {
      researchRunId: `mock-recheck-${candidate.candidateId}`,
      thesis,
    };
  }

  async getLatest(thesisId: string): Promise<ThesisVersion | null> {
    const versions = this.versions.get(thesisId) ?? [];
    return versions.at(-1) ?? null;
  }

  async listVersions(thesisId: string): Promise<ThesisVersion[]> {
    return this.versions.get(thesisId) ?? [];
  }

  async listEvents(thesisId: string): Promise<ThesisEvent[]> {
    return this.events.get(thesisId) ?? [];
  }
}

const research = new MockResearchService();
const batch = new MockBatchService(research);
const theses = new MockThesisService();
const port = Number(process.env.PORT ?? "8787");

const server = createResearchApi(research, {
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  batch,
  theses,
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      service: "trading-radar-b-mock",
      listening: `http://127.0.0.1:${port}`,
      mock: true,
      note: "No Gemini/OpenAI key is required. All research content is mock data.",
    }),
  );
});
