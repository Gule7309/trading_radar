import { describe, expect, it } from "vitest";
import { verifyNumericClaim } from "../src/evidence/numeric-verifier.js";

describe("verifyNumericClaim", () => {
  it("supports matching values", () => {
    expect(
      verifyNumericClaim({
        claimed: 35.2,
        actual: 35.2,
      }).result,
    ).toBe("SUPPORTED");
  });

  it("refutes materially different values", () => {
    expect(
      verifyNumericClaim({
        claimed: 35.2,
        actual: 30,
      }).result,
    ).toBe("REFUTED");
  });
});
