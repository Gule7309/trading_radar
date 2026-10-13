import { describe, expect, it } from "vitest";
import { runEvalCase } from "../src/eval/harness.js";

describe("eval harness", () => {
  it("reports repeat-run pass rate and mean metrics", async () => {
    let count = 0;

    const result = await runEvalCase(
      {
        id: "E01",
        description: "fixture",
        async run() {
          count += 1;
          return { ok: count !== 2 };
        },
        grade(output) {
          return {
            passed: output.ok,
            metrics: { score: output.ok ? 1 : 0 },
            failureType: output.ok ? undefined : "FIXTURE_FAILURE",
          };
        },
      },
      3,
    );

    expect(result.summary.passedTrials).toBe(2);
    expect(result.summary.passRate).toBeCloseTo(2 / 3);
    expect(result.summary.passAll).toBe(false);
    expect(result.summary.failureTypes.FIXTURE_FAILURE).toBe(1);
  });
});
