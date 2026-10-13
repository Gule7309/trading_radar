import { describe, expect, it } from "vitest";
import {
  normalizeMonthlyRevenueRow,
  parseOptionalNumber,
  parseRocDate,
  parseRocYearMonth,
} from "../src/tools/official/monthly-revenue.js";

describe("monthly revenue normalization", () => {
  it("parses ROC year-month and dates", () => {
    expect(parseRocYearMonth("11506")).toBe("2026-06");
    expect(parseRocDate("1150715")).toBe("2026-07-15");
  });

  it("parses comma and percent formatted numbers", () => {
    expect(parseOptionalNumber("1,234,567")).toBe(1234567);
    expect(parseOptionalNumber("35.2%")).toBe(35.2);
  });

  it("normalizes a TWSE monthly revenue row", () => {
    const record = normalizeMonthlyRevenueRow("TWSE", {
      公司代號: "2330",
      公司名稱: "測試公司",
      產業別: "半導體業",
      資料年月: "11506",
      出表日期: "1150715",
      "營業收入-當月營收": "1,234,567",
      "營業收入-去年同月增減(%)": "35.2",
      "營業收入-上月比較增減(%)": "2.1",
    });

    expect(record).toMatchObject({
      market: "TWSE",
      ticker: "2330",
      companyName: "測試公司",
      period: "2026-06",
      tableDate: "2026-07-15",
      monthlyRevenueTwdThousands: 1234567,
      yearOverYearPercent: 35.2,
      monthOverMonthPercent: 2.1,
    });
  });
});
