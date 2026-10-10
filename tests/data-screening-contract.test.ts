import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ScreeningOutputV1Schema,
  screeningOutputToCandidatePackets,
} from "../src/domain/screening-output.js";

const fixtureUrl = new URL(
  "../packages/taiwan_data/tests/fixtures/sample_screening_output.json",
  import.meta.url,
);

describe("Data PR #5 -> B contract compatibility", () => {
  it("parses the real screening-output-v1 fixture and preserves all candidate evidence", () => {
    const raw = JSON.parse(readFileSync(fixtureUrl, "utf8")) as unknown;
    const screening = ScreeningOutputV1Schema.parse(raw);
    const candidates = screeningOutputToCandidatePackets(screening);

    expect(candidates).toHaveLength(screening.candidates.length);
    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      expect(candidate.hardConstraintsPassed).toBe(true);
      expect(candidate.upstreamRun?.runId).toBe(screening.run.runId);
      expect(candidate.upstreamRun?.dataVersion).toBe(
        screening.run.dataVersion,
      );
      expect(candidate.quantSignals).toHaveLength(4);
      expect(candidate.upstreamEvidence).toHaveLength(4);
      expect(
        candidate.upstreamEvidence?.every(
          (evidence) => evidence.verificationStatus === "verified",
        ),
      ).toBe(true);
    }

    const first = candidates[0]!;
    const dataFirst = screening.candidates[0]!;

    expect(first.ticker).toBe(dataFirst.stockId);
    expect(first.companyName).toBe(dataFirst.stockName);
    expect(first.quantScore).toBe(dataFirst.quantScore);

    const revenueSignal = first.quantSignals.find(
      (signal) => signal.metric === "revenue_yoy",
    );
    expect(revenueSignal?.industryPercentile).toBeCloseTo(
      (dataFirst.metrics.revenueYoY.percentile ?? 0) * 100,
      8,
    );
  });
});
