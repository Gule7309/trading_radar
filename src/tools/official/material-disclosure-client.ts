import { createHash } from "node:crypto";
import type { SourceDocument } from "../../domain/research.js";
import { fetchJson } from "../../infra/http.js";
import {
  normalizeMaterialDisclosureRow,
  type MaterialDisclosureRecord,
} from "./material-disclosure.js";
import type { TaiwanMarket } from "./monthly-revenue.js";

export const MATERIAL_DISCLOSURE_ENDPOINTS: Record<TaiwanMarket, string> = {
  TWSE: "https://openapi.twse.com.tw/v1/opendata/t187ap04_L",
  TPEX: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O",
};

export async function fetchLatestMaterialDisclosures(
  market: TaiwanMarket,
  ticker: string,
): Promise<{
  records: MaterialDisclosureRecord[];
  sources: SourceDocument[];
  attempts: number;
  durationMs: number;
}> {
  const url = MATERIAL_DISCLOSURE_ENDPOINTS[market];
  const response = await fetchJson<Array<Record<string, unknown>>>(url, {
    timeoutMs: 15_000,
    retries: 2,
  });

  const records = response.data
    .map((row) => normalizeMaterialDisclosureRow(market, row))
    .filter((row): row is MaterialDisclosureRecord => row !== null)
    .filter((row) => row.ticker === ticker);

  const sources = records.map((record) => {
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          market,
          ticker,
          announcementDate: record.announcementDate,
          announcementTime: record.announcementTime,
          subject: record.subject,
          description: record.description,
        }),
      )
      .digest("hex")
      .slice(0, 20);

    const publishedAt =
      record.announcementDate && record.announcementTime
        ? `${record.announcementDate}T${record.announcementTime}+08:00`
        : record.announcementDate;

    return {
      sourceId: `disclosure-${contentHash}`,
      url,
      title: record.subject,
      publisher:
        market === "TWSE" ? "Taiwan Stock Exchange" : "Taipei Exchange",
      sourceType: market,
      sourceTier: 1 as const,
      publishedAt,
      retrievedAt: response.retrievedAt,
      ticker: record.ticker,
      snippet: record.description,
      contentHash,
      metadata: {
        occurrenceDate: record.occurredAt ?? null,
        clause: record.clause ?? null,
        tableDate: record.tableDate ?? null,
      },
      untrustedContent: true as const,
    } satisfies SourceDocument;
  });

  return {
    records,
    sources,
    attempts: response.attempts,
    durationMs: response.durationMs,
  };
}
