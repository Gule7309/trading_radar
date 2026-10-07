import { parseRocDate } from "./monthly-revenue.js";
import type { TaiwanMarket } from "./monthly-revenue.js";

export interface MaterialDisclosureRecord {
  market: TaiwanMarket;
  ticker: string;
  companyName: string;
  tableDate?: string;
  announcementDate?: string;
  announcementTime?: string;
  occurredAt?: string;
  subject: string;
  clause?: string;
  description: string;
}

const aliases = {
  ticker: ["公司代號", "CompanyCode", "SecuritiesCompanyCode"],
  companyName: ["公司名稱", "CompanyName"],
  tableDate: ["出表日期", "ReportDate"],
  announcementDate: ["發言日期", "AnnouncementDate", "SpeakDate"],
  announcementTime: ["發言時間", "AnnouncementTime", "SpeakTime"],
  occurredAt: ["事實發生日", "DateOfOccurrence", "OccurrenceDate"],
  subject: ["主旨 ", "主旨", "Subject"],
  clause: ["符合條款", "ApplicableClause", "Clause"],
  description: ["說明", "Description", "Explanation"],
} as const;

function valueByAliases(
  row: Record<string, unknown>,
  fields: readonly string[],
): unknown {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

export function normalizeAnnouncementTime(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const digits = String(value).replace(/\D/g, "").padStart(6, "0");
  if (digits.length !== 6) return undefined;

  const hour = Number(digits.slice(0, 2));
  const minute = Number(digits.slice(2, 4));
  const second = Number(digits.slice(4, 6));

  if (hour > 23 || minute > 59 || second > 59) return undefined;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0",
  )}:${String(second).padStart(2, "0")}`;
}

export function normalizeMaterialDisclosureRow(
  market: TaiwanMarket,
  row: Record<string, unknown>,
): MaterialDisclosureRecord | null {
  const ticker = valueByAliases(row, aliases.ticker);
  const companyName = valueByAliases(row, aliases.companyName);
  const subject = valueByAliases(row, aliases.subject);
  const description = valueByAliases(row, aliases.description);

  if (
    ticker === undefined ||
    companyName === undefined ||
    subject === undefined ||
    description === undefined
  ) {
    return null;
  }

  return {
    market,
    ticker: String(ticker).trim(),
    companyName: String(companyName).trim(),
    tableDate: parseRocDate(valueByAliases(row, aliases.tableDate)),
    announcementDate: parseRocDate(
      valueByAliases(row, aliases.announcementDate),
    ),
    announcementTime: normalizeAnnouncementTime(
      valueByAliases(row, aliases.announcementTime),
    ),
    occurredAt: parseRocDate(valueByAliases(row, aliases.occurredAt)),
    subject: String(subject).trim(),
    clause: valueByAliases(row, aliases.clause)?.toString().trim(),
    description: String(description).trim(),
  };
}
