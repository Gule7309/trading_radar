import { createHash } from "node:crypto";
import type { KnownFact, SourceDocument } from "../domain/research.js";
import type { SearchProvider } from "../infra/search/provider.js";
import {
  fetchLatestMonthlyRevenue,
  type OfficialDataNotFoundError,
} from "./official/monthly-revenue-client.js";
import { fetchLatestMaterialDisclosures } from "./official/material-disclosure-client.js";
import type { MonthlyRevenueRecord, TaiwanMarket } from "./official/monthly-revenue.js";
import type {
  ResearchToolRouter,
  ToolExecutionContext,
  ToolObservation,
} from "./tool-router.js";
import type { ResearchAction } from "../domain/research.js";

export type MonthlyRevenueFetcher = (
  market: TaiwanMarket,
  ticker: string,
) => Promise<{
  record: MonthlyRevenueRecord;
  source: SourceDocument;
  attempts: number;
  durationMs: number;
}>;

export type MaterialDisclosureFetcher = (
  market: TaiwanMarket,
  ticker: string,
) => ReturnType<typeof fetchLatestMaterialDisclosures>;

function buildMonthlyRevenueFact(
  record: MonthlyRevenueRecord,
  sourceId: string,
): KnownFact {
  const pieces = [
    record.period ? `period=${record.period}` : undefined,
    record.monthlyRevenueTwdThousands !== undefined
      ? `revenue=${record.monthlyRevenueTwdThousands}k TWD`
      : undefined,
    record.yearOverYearPercent !== undefined
      ? `YoY=${record.yearOverYearPercent}%`
      : undefined,
    record.monthOverMonthPercent !== undefined
      ? `MoM=${record.monthOverMonthPercent}%`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    factId: `fact-monthly-revenue-${record.ticker}-${record.period ?? "latest"}`,
    text: pieces.join("; "),
    sourceIds: [sourceId],
  };
}

function searchResultToSource(
  result: Awaited<ReturnType<SearchProvider["search"]>>[number],
  ticker: string,
): SourceDocument {
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify({
        title: result.title,
        url: result.url,
        publishedAt: result.publishedAt,
        snippet: result.snippet,
      }),
    )
    .digest("hex")
    .slice(0, 20);

  let publisher = result.publisher;

  if (!publisher) {
    try {
      publisher = new URL(result.url).hostname;
    } catch {
      publisher = "Unknown publisher";
    }
  }

  return {
    sourceId: `news-${contentHash}`,
    url: result.url,
    title: result.title,
    publisher,
    sourceType: "NEWS",
    sourceTier: 2,
    publishedAt: result.publishedAt,
    retrievedAt: new Date().toISOString(),
    ticker,
    snippet: result.snippet,
    contentHash,
    untrustedContent: true,
  };
}

export class DefaultToolRouter implements ResearchToolRouter {
  constructor(
    private readonly searchProvider: SearchProvider,
    private readonly monthlyRevenueFetcher: MonthlyRevenueFetcher =
      fetchLatestMonthlyRevenue,
    private readonly materialDisclosureFetcher: MaterialDisclosureFetcher =
      fetchLatestMaterialDisclosures,
  ) {}

  async execute(
    action: ResearchAction,
    context: ToolExecutionContext,
  ): Promise<ToolObservation> {
    if (action.type === "SEARCH_OFFICIAL") {
      if (action.dataset === "MONTHLY_REVENUE") {
        try {
          const result = await this.monthlyRevenueFetcher(
            context.candidate.market,
            context.candidate.ticker,
          );

          return {
            outcome: "SUCCESS",
            summary:
              `Fetched official monthly revenue for ${context.candidate.ticker} ` +
              `in ${result.attempts} attempt(s), ${result.durationMs} ms.`,
            sources: [result.source],
            knownFacts: [
              buildMonthlyRevenueFact(result.record, result.source.sourceId),
            ],
          };
        } catch (error) {
          const maybeNotFound = error as Partial<OfficialDataNotFoundError>;

          return {
            outcome: "ERROR",
            summary:
              maybeNotFound.name === "OfficialDataNotFoundError"
                ? `Official monthly revenue row not found for ${context.candidate.ticker}.`
                : error instanceof Error
                  ? error.message
                  : "Unknown official data error.",
          };
        }
      }

      if (action.dataset === "MATERIAL_DISCLOSURES") {
        try {
          const result = await this.materialDisclosureFetcher(
            context.candidate.market,
            context.candidate.ticker,
          );

          return {
            outcome: "SUCCESS",
            summary:
              `Fetched ${result.records.length} material disclosure(s) for ` +
              `${context.candidate.ticker} in ${result.attempts} attempt(s), ` +
              `${result.durationMs} ms.`,
            sources: result.sources,
            knownFacts: result.records.map((record, index) => ({
              factId: `fact-disclosure-${record.ticker}-${index + 1}`,
              text: [
                record.announcementDate,
                record.subject,
                record.clause,
              ]
                .filter(Boolean)
                .join(" | "),
              sourceIds: result.sources[index]
                ? [result.sources[index]!.sourceId]
                : [],
            })),
          };
        } catch (error) {
          return {
            outcome: "ERROR",
            summary:
              error instanceof Error
                ? error.message
                : "Unknown material disclosure error.",
          };
        }
      }
    }

    if (action.type === "SEARCH_NEWS") {
      try {
        const results = await this.searchProvider.search({
          query: action.query,
          from: action.from,
          to: action.to,
          maxResults: 5,
        });

        if (results.length === 0) {
          return {
            outcome: "EMPTY",
            summary: "News search completed with no results.",
          };
        }

        return {
          outcome: "SUCCESS",
          summary: `News search returned ${results.length} result(s).`,
          sources: results.map((result) =>
            searchResultToSource(result, context.candidate.ticker),
          ),
        };
      } catch (error) {
        return {
          outcome: "ERROR",
          summary:
            error instanceof Error ? error.message : "Unknown news search error.",
        };
      }
    }

    return {
      outcome: "EMPTY",
      summary: `Tool action ${action.type} is not implemented by DefaultToolRouter.`,
    };
  }
}
