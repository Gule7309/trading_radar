import { readFile } from "node:fs/promises";
import type { CandidatePacket } from "../domain/candidate.js";
import {
  ScreeningOutputV1Schema,
  type ScreeningOutputV1,
} from "../domain/screening-output.js";
import type { ResearchResult } from "../domain/research.js";
import type { StoredResearchRun } from "../research/store.js";
import { BatchResearchService } from "../research/batch-service.js";
import { InMemoryThesisStore } from "../thesis/store.js";
import { ThesisService } from "../thesis/service.js";
import { ThesisResearchService } from "../thesis/research-service.js";
import { InMemoryPersonalizationStore } from "../personalization/store.js";
import { PersonalizationService } from "../personalization/service.js";
import type { UserProfile } from "../personalization/types.js";
import { InMemoryNotificationStore } from "../notifications/store.js";
import { NotificationService } from "../notifications/service.js";
import { InMemoryWatchlistStore } from "../watchlist/store.js";
import { WatchlistService } from "../watchlist/service.js";
import { InMemoryDeliveryRunStore } from "../delivery/store.js";
import type { ScreeningProvider } from "../delivery/screening-provider.js";
import { DailyDeliveryService } from "../delivery/service.js";
import {
  createResearchApi,
  type ResearchApiService,
} from "./research-api.js";

function mockResult(candidate: CandidatePacket): ResearchResult {
  const now = new Date().toISOString();
  const officialSourceId = `mock-official-${candidate.ticker}`;
  const riskSourceId = `mock-risk-${candidate.ticker}`;
  const scenario = candidate.dataSources
    ?.map((item) => item.source)
    .find((source) => source.startsWith("mock-scenario:"))
    ?.split(":")[1];
  const claimStatus =
    scenario === "invalidated"
      ? "REFUTED"
      : scenario === "weakened"
        ? "INSUFFICIENT"
        : scenario === "conflict"
          ? "CONFLICTING"
          : "SUPPORTED";
  const rejected = claimStatus !== "SUPPORTED";
  const coreSignal =
    candidate.quantSignals.find(
      (signal) => signal.metric === "revenue_yoy",
    ) ?? candidate.quantSignals[0];

  return {
    runId: `mock-${candidate.candidateId}-${Date.now()}`,
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    status: rejected ? "REJECTED" : "PUBLISHABLE",
    decision: rejected ? "REJECT" : "KEEP",
    thesis: rejected
      ? undefined
      : `[MOCK] ${candidate.companyName} has a supported quantitative signal and a monitorable downside risk. Replace this with a live B run before demo sign-off.`,
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
        status: claimStatus,
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
      unresolvedConflicts: claimStatus === "CONFLICTING" ? 1 : 0,
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
        decisionSummary:
          "Collect a mock downside source for UI development.",
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
    stopReason:
      claimStatus === "CONFLICTING"
        ? "UNRESOLVED_CONFLICT"
        : rejected
          ? "INSUFFICIENT_EVIDENCE"
          : "PUBLISHED",
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
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

function personalizedMockScreening(
  input: ScreeningOutputV1,
  profile: UserProfile,
): ScreeningOutputV1 {
  const weights = profile.softPreferences;

  const candidates = input.candidates
    .filter((candidate) => {
      if (
        profile.hardConstraints.excludedIndustries.includes(
          candidate.industry ?? "",
        )
      ) {
        return false;
      }

      if (
        profile.hardConstraints.excludeDisposition &&
        candidate.riskFlags.includes("disposition")
      ) {
        return false;
      }

      if (
        profile.hardConstraints.maxDebtRatio !== null &&
        candidate.metrics.debtRatio.value >
          profile.hardConstraints.maxDebtRatio
      ) {
        return false;
      }

      if (
        profile.hardConstraints.minLiquidity !== null &&
        candidate.metrics.avgTurnover20d.value <
          profile.hardConstraints.minLiquidity
      ) {
        return false;
      }

      return true;
    })
    .map((candidate) => {
      const growth = candidate.metrics.revenueYoY.percentile ?? 0;
      const profitability =
        candidate.metrics.operatingMargin.percentile ?? 0;
      const safety = candidate.metrics.debtRatio.percentile ?? 0;
      const total =
        weights.growth +
        weights.profitability +
        weights.safety;

      return {
        ...candidate,
        quantScore:
          total > 0
            ? (growth * weights.growth +
                profitability * weights.profitability +
                safety * weights.safety) /
              total
            : candidate.quantScore,
      };
    })
    .sort(
      (a, b) =>
        b.quantScore - a.quantScore ||
        a.stockId.localeCompare(b.stockId),
    )
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));

  return ScreeningOutputV1Schema.parse({
    ...input,
    run: {
      ...input.run,
      profile: {
        excludedIndustries:
          profile.hardConstraints.excludedIndustries,
        maxDebtRatio:
          profile.hardConstraints.maxDebtRatio,
        minLiquidity:
          profile.hardConstraints.minLiquidity,
        excludeDisposition:
          profile.hardConstraints.excludeDisposition,
        weights: profile.softPreferences,
      },
      counts: {
        ...input.run.counts,
        ranked: candidates.length,
      },
    },
    candidates,
  });
}

class MockScreeningProvider implements ScreeningProvider {
  private async fixture(): Promise<ScreeningOutputV1> {
    const fixtureUrl = new URL(
      "../../packages/taiwan_data/tests/fixtures/sample_screening_output.json",
      import.meta.url,
    );
    const raw = JSON.parse(
      await readFile(fixtureUrl, "utf8"),
    ) as unknown;
    return ScreeningOutputV1Schema.parse(raw);
  }

  async screen(profile: UserProfile): Promise<ScreeningOutputV1> {
    return personalizedMockScreening(
      await this.fixture(),
      profile,
    );
  }

  async inspectTicker(
    profile: UserProfile,
    ticker: string,
  ): Promise<ScreeningOutputV1> {
    const parsed = await this.fixture();
    const original = parsed.candidates.find(
      (item) => item.stockId === ticker,
    );
    if (!original) {
      throw new Error(
        `MOCK_TICKER_NOT_IN_FIXTURE:${ticker}`,
      );
    }

    const weights = profile.softPreferences;
    const total =
      weights.growth +
      weights.profitability +
      weights.safety;
    const candidate = {
      ...original,
      quantScore:
        total > 0
          ? ((original.metrics.revenueYoY.percentile ?? 0) *
                weights.growth +
              (original.metrics.operatingMargin.percentile ?? 0) *
                weights.profitability +
              (original.metrics.debtRatio.percentile ?? 0) *
                weights.safety) /
            total
          : original.quantScore,
      rank: 1,
    };

    const evidenceIds = new Set(
      Object.values(candidate.metrics).map(
        (metric) => metric.evidenceId,
      ),
    );

    return ScreeningOutputV1Schema.parse({
      ...parsed,
      run: {
        ...parsed.run,
        // Keep the screening-output-v1 run-id format while separating
        // the saved-stock fixture from the discovery run.
        runId: `20261010-${String(
          Math.abs(
            ticker
              .split("")
              .reduce(
                (sum, char) => sum + char.charCodeAt(0),
                0,
              ),
          ) + 900,
        )}`,
        profile: {
          ...parsed.run.profile,
          weights: profile.softPreferences,
          watchlistRecheck: true,
        },
        counts: {
          ...parsed.run.counts,
          ranked: 1,
        },
      },
      candidates: [candidate],
      evidence: parsed.evidence.filter((item) =>
        evidenceIds.has(item.id),
      ),
    });
  }
}

const research = new MockResearchService();
const batch = new BatchResearchService(research);

const thesisStore = new InMemoryThesisStore();
const thesisService = new ThesisService(thesisStore);
const theses = new ThesisResearchService(
  research,
  thesisService,
);

const personalizationStore =
  new InMemoryPersonalizationStore();
const personalization = new PersonalizationService(
  personalizationStore,
  research,
);

const notificationStore =
  new InMemoryNotificationStore();
const notifications = new NotificationService(
  notificationStore,
);

const watchlistStore = new InMemoryWatchlistStore();
const watchlist = new WatchlistService(
  watchlistStore,
  research,
  thesisService,
  theses,
  notifications,
);

const delivery = new DailyDeliveryService(
  new MockScreeningProvider(),
  personalization,
  batch,
  notifications,
  new InMemoryDeliveryRunStore(),
  watchlist,
);

const mockAdmin = {
  async status() {
    return {
      llmProvider: "mock",
      llmModel: "mock",
      searchProvider: "mock",
      searchModel: "mock",
      modelCredentialConfigured: false,
      taiwanDataConfigured: false,
      dailySchedulerEnabled: false,
      dailyResearchAfterHour: 17,
      registeredUsers:
        (await personalization.listProfiles()).length,
      latestDeliveryRuns: [],
    };
  },
  async modelCheck() {
    return {
      ok: true,
      provider: "mock",
      model: "mock",
      latencyMs: 0,
    };
  },
  async dataStatus() {
    return {
      configured: false,
      mock: true,
      tables: {},
      datasetStatus: [],
    };
  },
};

const port = Number(process.env.PORT ?? "8787");

const server = createResearchApi(research, {
  corsOrigin:
    process.env.CORS_ORIGIN ?? "http://localhost:5173",
  batch,
  theses,
  personalization,
  watchlist,
  notifications,
  delivery,
  admin: mockAdmin,
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      service: "trading-radar-b-mock",
      listening: `http://127.0.0.1:${port}`,
      mock: true,
      personalization: true,
      watchlist: true,
      notifications: true,
      proactiveDelivery: true,
      note:
        "No Gemini/OpenAI key is required. Research content is mock data; the Data PR #5 screening fixture is real-shaped.",
    }),
  );
});
