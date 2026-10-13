export interface EvalCase<TOutput> {
  id: string;
  description: string;
  run: () => Promise<TOutput>;
  grade: (output: TOutput) => Promise<EvalGrade> | EvalGrade;
}

export interface EvalGrade {
  passed: boolean;
  metrics: Record<string, number>;
  failureType?: string;
  note?: string;
}

export interface EvalTrial<TOutput> {
  caseId: string;
  trial: number;
  output: TOutput;
  grade: EvalGrade;
  latencyMs: number;
}

export interface EvalSummary {
  caseId: string;
  trials: number;
  passedTrials: number;
  passRate: number;
  passAll: boolean;
  meanLatencyMs: number;
  metricMeans: Record<string, number>;
  failureTypes: Record<string, number>;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function runEvalCase<TOutput>(
  evalCase: EvalCase<TOutput>,
  trials = 3,
): Promise<{
  trials: EvalTrial<TOutput>[];
  summary: EvalSummary;
}> {
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error("trials must be a positive integer");
  }

  const results: EvalTrial<TOutput>[] = [];

  for (let trial = 1; trial <= trials; trial += 1) {
    const startedAt = Date.now();
    const output = await evalCase.run();
    const latencyMs = Date.now() - startedAt;
    const grade = await evalCase.grade(output);

    results.push({
      caseId: evalCase.id,
      trial,
      output,
      grade,
      latencyMs,
    });
  }

  const metricNames = Array.from(
    new Set(results.flatMap((result) => Object.keys(result.grade.metrics))),
  );

  const failureTypes: Record<string, number> = {};
  for (const result of results) {
    if (result.grade.failureType) {
      failureTypes[result.grade.failureType] =
        (failureTypes[result.grade.failureType] ?? 0) + 1;
    }
  }

  const passedTrials = results.filter((result) => result.grade.passed).length;

  return {
    trials: results,
    summary: {
      caseId: evalCase.id,
      trials,
      passedTrials,
      passRate: passedTrials / trials,
      passAll: passedTrials === trials,
      meanLatencyMs: mean(results.map((result) => result.latencyMs)),
      metricMeans: Object.fromEntries(
        metricNames.map((metricName) => [
          metricName,
          mean(
            results
              .map((result) => result.grade.metrics[metricName])
              .filter((value): value is number => value !== undefined),
          ),
        ]),
      ),
      failureTypes,
    },
  };
}
