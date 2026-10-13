export interface NumericVerificationInput {
  claimed: number;
  actual: number;
  absoluteTolerance?: number;
  relativeTolerance?: number;
}

export interface NumericVerificationResult {
  result: "SUPPORTED" | "REFUTED";
  difference: number;
  allowedDifference: number;
}

export function verifyNumericClaim(
  input: NumericVerificationInput,
): NumericVerificationResult {
  const absoluteTolerance = input.absoluteTolerance ?? 1e-9;
  const relativeTolerance = input.relativeTolerance ?? 1e-6;

  const difference = Math.abs(input.claimed - input.actual);
  const scale = Math.max(Math.abs(input.actual), 1);
  const allowedDifference = Math.max(
    absoluteTolerance,
    relativeTolerance * scale,
  );

  return {
    result: difference <= allowedDifference ? "SUPPORTED" : "REFUTED",
    difference,
    allowedDifference,
  };
}
