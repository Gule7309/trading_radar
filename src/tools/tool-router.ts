import type { ResearchAction, SourceDocument } from "../domain/research.js";

export interface ToolObservation {
  outcome: "SUCCESS" | "EMPTY" | "ERROR";
  summary: string;
  sources?: SourceDocument[];
}

export interface ResearchToolRouter {
  execute(action: ResearchAction): Promise<ToolObservation>;
}

export class MockToolRouter implements ResearchToolRouter {
  async execute(action: ResearchAction): Promise<ToolObservation> {
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
            retrievedAt: new Date().toISOString(),
            ticker: "TEST",
            snippet: "Monthly revenue increased year over year.",
            contentHash: "mock-official-1",
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
            ticker: "TEST",
            snippet: "Gross margin came under pressure due to higher input costs.",
            contentHash: "mock-news-1",
            untrustedContent: true,
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
