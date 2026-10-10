import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";
import type { ResearchService } from "./service.js";
import {
  rankPublishableResearch,
  type RankedResearchResult,
  type RankingWeights,
} from "./ranking.js";

export interface BatchResearchOptions {
  topK?: number;
  researchLimit?: number;
  concurrency?: number;
  rankingWeights?: RankingWeights;
}

export interface BatchResearchResult {
  researched: number;
  rejectedOrSkipped: Array<{
    candidateId: string;
    ticker: string;
    status: ResearchResult["status"] | "SKIPPED";
    stopReason?: string;
  }>;
  top: RankedResearchResult[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );

  return results;
}

export class BatchResearchService {
  constructor(private readonly research: ResearchService) {}

  async run(
    candidates: CandidatePacket[],
    options: BatchResearchOptions = {},
  ): Promise<BatchResearchResult> {
    const topK = Math.max(1, Math.min(options.topK ?? 5, 20));
    const researchLimit = Math.max(
      topK,
      Math.min(options.researchLimit ?? 10, 30),
    );
    const concurrency = Math.max(
      1,
      Math.min(options.concurrency ?? 2, 4),
    );

    const eligible = candidates
      .filter((candidate) => candidate.hardConstraintsPassed)
      .sort(
        (a, b) =>
          b.quantScore - a.quantScore ||
          a.ticker.localeCompare(b.ticker),
      );

    const selected = eligible.slice(0, researchLimit);
    const skipped = eligible.slice(researchLimit);

    const completed = await mapWithConcurrency(
      selected,
      concurrency,
      async (candidate) => ({
        candidate,
        result: await this.research.run(candidate),
      }),
    );

    return {
      researched: completed.length,
      rejectedOrSkipped: [
        ...completed
          .filter(({ result }) => result.status !== "PUBLISHABLE")
          .map(({ candidate, result }) => ({
            candidateId: candidate.candidateId,
            ticker: candidate.ticker,
            status: result.status,
            stopReason: result.stopReason,
          })),
        ...candidates
          .filter((candidate) => !candidate.hardConstraintsPassed)
          .map((candidate) => ({
            candidateId: candidate.candidateId,
            ticker: candidate.ticker,
            status: "SKIPPED" as const,
            stopReason: "HARD_CONSTRAINT_FAILED",
          })),
        ...skipped.map((candidate) => ({
          candidateId: candidate.candidateId,
          ticker: candidate.ticker,
          status: "SKIPPED" as const,
          stopReason: "RESEARCH_LIMIT",
        })),
      ],
      top: rankPublishableResearch(
        completed,
        topK,
        options.rankingWeights,
      ),
    };
  }
}
