import { createHash } from "node:crypto";
import { fetchJson } from "../../infra/http.js";
import type { SourceDocument } from "../../domain/research.js";
import {
  normalizeMonthlyRevenueRow,
  type MonthlyRevenueRecord,
  type TaiwanMarket,
} from "./monthly-revenue.js";

export const MONTHLY_REVENUE_ENDPOINTS: Record<TaiwanMarket, string> = {
  TWSE: "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
  TPEX: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O",
};

export class OfficialDataNotFoundError extends Error {
  constructor(
    public readonly market: TaiwanMarket,
    public readonly ticker: string,
  ) {
    super(`No ${market} monthly revenue row found for ticker ${ticker}`);
    this.name = "OfficialDataNotFoundError";
  }
}

export async function fetchLatestMonthlyRevenue(
  market: TaiwanMarket,
  ticker: string,
): Promise<{
  record: MonthlyRevenueRecord;
  source: SourceDocument;
  attempts: number;
  durationMs: number;
}> {
  const url = MONTHLY_REVENUE_ENDPOINTS[market];

  const response = await fetchJson<Array<Record<string, unknown>>>(url, {
    timeoutMs: 15_000,
    retries: 2,
  });

  const normalized = response.data
    .map((row) => normalizeMonthlyRevenueRow(market, row))
    .filter((row): row is MonthlyRevenueRecord => row !== null);

  const record = normalized.find((row) => row.ticker === ticker);

  if (!record) {
    throw new OfficialDataNotFoundError(market, ticker);
  }

  const sourceId = createHash("sha256")
    .update(
      JSON.stringify({
        market,
        ticker: record.ticker,
        period: record.period,
        revenue: record.monthlyRevenueTwdThousands,
        yoy: record.yearOverYearPercent,
        url,
      }),
    )
    .digest("hex")
    .slice(0, 20);

  const snippetParts = [
    record.period ? `資料年月 ${record.period}` : undefined,
    record.monthlyRevenueTwdThousands !== undefined
      ? `當月營收 ${record.monthlyRevenueTwdThousands} 千元`
      : undefined,
    record.yearOverYearPercent !== undefined
      ? `YoY ${record.yearOverYearPercent}%`
      : undefined,
    record.monthOverMonthPercent !== undefined
      ? `MoM ${record.monthOverMonthPercent}%`
      : undefined,
    record.note ? `備註：${record.note}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const source: SourceDocument = {
    sourceId: `official-${sourceId}`,
    url,
    title: `${record.companyName} 月營收官方快照`,
    publisher: market === "TWSE" ? "Taiwan Stock Exchange" : "Taipei Exchange",
    sourceType: market,
    sourceTier: 1,
    publishedAt: record.tableDate,
    retrievedAt: response.retrievedAt,
    ticker: record.ticker,
    snippet: snippetParts.join("；"),
    contentHash: sourceId,
    untrustedContent: true,
  };

  return {
    record,
    source,
    attempts: response.attempts,
    durationMs: response.durationMs,
  };
}
