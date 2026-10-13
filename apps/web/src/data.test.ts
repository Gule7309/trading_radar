import { describe, expect, it } from "vitest";
import {
  hardMatches,
  metric,
  parseScreening,
  percent,
  safeUrl,
  sample,
  label,
  isNewerData,
  isPlaceholderSource,
} from "./data";
import { HardSchema } from "./contracts";

describe("screening contract and evidence display", () => {
  it("compares data timestamps across time zones and rejects unparseable dates", () => {
    expect(
      isNewerData("2026-10-10T08:00:00+08:00", "2026-10-10T00:00:00Z"),
    ).toBe(false);
    expect(
      isNewerData("2026-10-10T01:00:00Z", "2026-10-10T08:00:00+08:00"),
    ).toBe(true);
    expect(isNewerData("unknown", "2026-10-10")).toBe(false);
  });
  it("validates the real A fixture and distinguishes eight records from screening statistics", () => {
    expect(sample.candidates).toHaveLength(8);
    expect(sample.run.counts.ranked).toBe(428);
    expect(new Set(sample.candidates.map((c) => c.market))).toEqual(
      new Set(["TWSE", "TPEX"]),
    );
    expect(sample.run.priceAsOf).toBe("2026-10-08");
    for (const c of sample.candidates)
      for (const m of Object.values(c.metrics))
        expect(
          sample.evidence.find(
            (e) =>
              e.id.toLowerCase() === m.evidenceId.toLowerCase() &&
              e.stockId === c.stockId,
          ),
        ).toBeDefined();
  });
  it("rejects invalid dates and missing candidate fields without repairing input", () => {
    const invalid = structuredClone(sample);
    invalid.run.priceAsOf = "2026-99-99";
    expect(() => parseScreening(invalid)).toThrow("契約");
    expect(() =>
      parseScreening({ schemaVersion: "screening-output-v1" }),
    ).toThrow();
  });
  it("blocks stale hard constraints including missing profile metadata", () => {
    const hard = HardSchema.parse(sample.run.profile);
    expect(hardMatches(sample, hard)).toBe(true);
    expect(hardMatches(sample, { ...hard, maxDebtRatio: 30 })).toBe(false);
    expect(hardMatches(sample, { ...hard, excludeDisposition: false })).toBe(
      false,
    );
    expect(
      hardMatches({ ...sample, run: { ...sample.run, profile: {} } }, hard),
    ).toBe(false);
  });
  it("does not multiply percentage-point inputs or invent a null percentile", () => {
    expect(metric(344.4, "revenueYoY")).toBe("344.4%");
    expect(metric(100_000_000, "avgTurnover20d")).toBe("1 億元");
    expect(percent(0.85)).toBe("85%");
    expect(percent(null)).toBe("未提供");
    expect(metric(-20.1, "operatingMargin")).toBe("-20.1%");
  });
  it("distinguishes placeholder sources from official evidence URLs", () => {
    expect(isPlaceholderSource("https://example.invalid/mock-official")).toBe(
      true,
    );
    expect(isPlaceholderSource("https://mopsov.twse.com.tw/nas/t21/")).toBe(
      false,
    );
    expect(
      isPlaceholderSource("https://example.com/?next=example.invalid"),
    ).toBe(false);
    expect(isPlaceholderSource("javascript:alert(1)")).toBe(false);
  });
  it("allows only http(s) source links and reveals unknown statuses", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,test")).toBeUndefined();
    expect(safeUrl("https://example.com/")).toBe("https://example.com/");
    expect(label("NEW_UNKNOWN")).toBe("未識別：NEW_UNKNOWN");
  });
});
