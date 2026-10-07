import { describe, expect, it } from "vitest";
import { MVP_EVAL_SCENARIOS } from "../src/eval/cases/catalog.js";

describe("MVP eval scenario catalog", () => {
  it("contains ten unique scenarios", () => {
    const ids = MVP_EVAL_SCENARIOS.map((scenario) => scenario.id);

    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it("documents at least two observable behaviors per scenario", () => {
    for (const scenario of MVP_EVAL_SCENARIOS) {
      expect(scenario.mustDemonstrate.length).toBeGreaterThanOrEqual(2);
      expect(scenario.expectedTerminalBehavior.length).toBeGreaterThan(0);
    }
  });
});
