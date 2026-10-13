export type TaiwanMarket = "TWSE" | "TPEX";

export interface MonthlyRevenueRecord {
  market: TaiwanMarket;
  ticker: string;
  companyName: string;
  industry?: string;
  period?: string;
  tableDate?: string;
  monthlyRevenueTwdThousands?: number;
  previousMonthRevenueTwdThousands?: number;
  previousYearMonthRevenueTwdThousands?: number;
  monthOverMonthPercent?: number;
  yearOverYearPercent?: number;
  cumulativeRevenueTwdThousands?: number;
  cumulativeYearOverYearPercent?: number;
  note?: string;
}

const aliases = {
  ticker: ["公司代號", "公司代码", "CompanyCode", "SecuritiesCompanyCode"],
  companyName: ["公司名稱", "公司名称", "CompanyName"],
  industry: ["產業別", "產業別名稱", "Industry"],
  period: ["資料年月", "DataYearMonth", "YearMonth"],
  tableDate: ["出表日期", "ReportDate", "Date"],
  monthlyRevenue: [
    "營業收入-當月營收",
    "當月營收",
    "CurrentMonthRevenue",
    "RevenueCurrentMonth",
  ],
  previousMonthRevenue: [
    "營業收入-上月營收",
    "上月營收",
    "LastMonthRevenue",
    "RevenuePreviousMonth",
  ],
  previousYearMonthRevenue: [
    "營業收入-去年當月營收",
    "去年當月營收",
    "LastYearMonthRevenue",
    "RevenueSameMonthLastYear",
  ],
  momPercent: [
    "營業收入-上月比較增減(%)",
    "上月比較增減(%)",
    "MoM",
  ],
  yoyPercent: [
    "營業收入-去年同月增減(%)",
    "去年同月增減(%)",
    "YoY",
  ],
  cumulativeRevenue: [
    "累計營業收入-當月累計營收",
    "當月累計營收",
    "CumulativeRevenue",
  ],
  cumulativeYoyPercent: [
    "累計營業收入-前期比較增減(%)",
    "前期比較增減(%)",
    "CumulativeYoY",
  ],
  note: ["備註", "备注", "Note"],
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

export function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;

  const cleaned = String(value)
    .trim()
    .replaceAll(",", "")
    .replaceAll("%", "");

  if (!cleaned || cleaned === "-" || cleaned === "--") return undefined;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseRocYearMonth(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 6) return undefined;

  const rocYearDigits = digits.length - 2;
  const rocYear = Number(digits.slice(0, rocYearDigits));
  const month = Number(digits.slice(rocYearDigits));

  if (!Number.isInteger(rocYear) || month < 1 || month > 12) return undefined;

  return `${rocYear + 1911}-${String(month).padStart(2, "0")}`;
}

export function parseRocDate(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;

  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 8) return undefined;

  const rocYearDigits = digits.length - 4;
  const rocYear = Number(digits.slice(0, rocYearDigits));
  const month = Number(digits.slice(rocYearDigits, rocYearDigits + 2));
  const day = Number(digits.slice(rocYearDigits + 2));

  if (
    !Number.isInteger(rocYear) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return undefined;
  }

  return `${rocYear + 1911}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
}

export function normalizeMonthlyRevenueRow(
  market: TaiwanMarket,
  row: Record<string, unknown>,
): MonthlyRevenueRecord | null {
  const tickerValue = valueByAliases(row, aliases.ticker);
  const companyNameValue = valueByAliases(row, aliases.companyName);

  if (tickerValue === undefined || companyNameValue === undefined) {
    return null;
  }

  return {
    market,
    ticker: String(tickerValue).trim(),
    companyName: String(companyNameValue).trim(),
    industry: valueByAliases(row, aliases.industry)?.toString().trim(),
    period: parseRocYearMonth(valueByAliases(row, aliases.period)),
    tableDate: parseRocDate(valueByAliases(row, aliases.tableDate)),
    monthlyRevenueTwdThousands: parseOptionalNumber(
      valueByAliases(row, aliases.monthlyRevenue),
    ),
    previousMonthRevenueTwdThousands: parseOptionalNumber(
      valueByAliases(row, aliases.previousMonthRevenue),
    ),
    previousYearMonthRevenueTwdThousands: parseOptionalNumber(
      valueByAliases(row, aliases.previousYearMonthRevenue),
    ),
    monthOverMonthPercent: parseOptionalNumber(
      valueByAliases(row, aliases.momPercent),
    ),
    yearOverYearPercent: parseOptionalNumber(
      valueByAliases(row, aliases.yoyPercent),
    ),
    cumulativeRevenueTwdThousands: parseOptionalNumber(
      valueByAliases(row, aliases.cumulativeRevenue),
    ),
    cumulativeYearOverYearPercent: parseOptionalNumber(
      valueByAliases(row, aliases.cumulativeYoyPercent),
    ),
    note: valueByAliases(row, aliases.note)?.toString().trim(),
  };
}
