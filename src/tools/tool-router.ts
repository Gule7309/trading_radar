import type { CandidatePacket } from "../domain/candidate.js";
import type {
  KnownFact,
  ResearchAction,
  RiskItem,
  SourceDocument,
} from "../domain/research.js";

export interface ToolExecutionContext {
  candidate: CandidatePacket;
  sources?: SourceDocument[];
}

export interface ToolObservation {
  outcome: "SUCCESS" | "EMPTY" | "ERROR";
  summary: string;
  failureCode?: string;
  retryable?: boolean;
  sources?: SourceDocument[];
  knownFacts?: KnownFact[];
  risks?: RiskItem[];
}

export interface ResearchToolRouter {
  execute(
    action: ResearchAction,
    context: ToolExecutionContext,
  ): Promise<ToolObservation>;
}

export class MockToolRouter implements ResearchToolRouter {
  async execute(
    action: ResearchAction,
    context: ToolExecutionContext,
  ): Promise<ToolObservation> {
    if (action.type === "SEARCH_OFFICIAL") {
      return {
        outcome: "SUCCESS",
        summary: "Mock official source found a revenue growth disclosure.",
        sources: [
          {
            sourceId: "src-official-1",
            url: "https://example.com/official",
            title: "Mock Official Disclosure",
            publisher: "TWSE",
            sourceType: "TWSE",
            sourceTier: 1,
            publishedAt: "2026-10-01",
            dataPeriod: "2026-09",
            retrievedAt: new Date().toISOString(),
            ticker: context.candidate.ticker,
            snippet: "Monthly revenue increased year over year.",
            contentHash: "mock-official-1",
            metadata: {
              yearOverYearPercent: 35,
              monthlyRevenueTwdThousands: 1000000,
            },
            untrustedContent: true,
          },
        ],
      };
    }

    if (action.type === "SEARCH_NEWS") {
      return {
        outcome: "SUCCESS",
        summary: "Mock news source found a margin pressure risk.",
        sources: [
          {
            sourceId: "src-news-1",
            url: "https://example.com/news",
            title: "Mock News Article",
            publisher: "Example Finance",
            sourceType: "NEWS",
            sourceTier: 2,
            publishedAt: "2026-10-02",
            retrievedAt: new Date().toISOString(),
            ticker: context.candidate.ticker,
            snippet: "Gross margin came under pressure due to higher input costs.",
            contentHash: "mock-news-1",
            untrustedContent: true,
          },
        ],
        risks: [
          {
            riskId: "risk-1",
            title: "Margin pressure",
            explanation: "Recent secondary reporting indicates margin pressure.",
            sourceIds: ["src-news-1"],
          },
        ],
      };
    }

    return {
      outcome: "EMPTY",
      summary: `Mock router has no observation for ${action.type}.`,
    };
  }
}
