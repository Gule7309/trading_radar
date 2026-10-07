import { describe, expect, it } from "vitest";
import { detectVerificationConflict } from "../src/evidence/conflict-detector.js";

describe("detectVerificationConflict", () => {
  it("flags a core claim when supported and refuted evidence coexist", () => {
    const conflict = detectVerificationConflict(
      {
        claimId: "c1",
        text: "Revenue YoY is positive.",
        category: "FINANCIAL",
        importance: "CORE",
        status: "PENDING",
      },
      [
        {
          evidenceId: "e1",
          claimId: "c1",
          sourceId: "s1",
          evidenceText: "positive",
          verificationResult: "SUPPORTED",
          verifierReason: "supports",
        },
        {
          evidenceId: "e2",
          claimId: "c1",
          sourceId: "s2",
          evidenceText: "negative",
          verificationResult: "REFUTED",
          verifierReason: "refutes",
        },
      ],
    );

    expect(conflict?.severity).toBe("HIGH");
    expect(conflict?.resolved).toBe(false);
  });
});
