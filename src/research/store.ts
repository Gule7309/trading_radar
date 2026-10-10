import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";

export interface StoredResearchRun {
  runId: string;
  ticker: string;
  candidate: CandidatePacket;
  result: ResearchResult;
  createdAt: string;
}

export interface ResearchRunStore {
  save(run: StoredResearchRun): Promise<void>;
  get(runId: string): Promise<StoredResearchRun | null>;
  listByTicker(ticker: string, limit?: number): Promise<StoredResearchRun[]>;
}

export class InMemoryResearchRunStore implements ResearchRunStore {
  private readonly runs = new Map<string, StoredResearchRun>();

  async save(run: StoredResearchRun): Promise<void> {
    this.runs.set(run.runId, structuredClone(run));
  }

  async get(runId: string): Promise<StoredResearchRun | null> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  async listByTicker(
    ticker: string,
    limit = 20,
  ): Promise<StoredResearchRun[]> {
    return Array.from(this.runs.values())
      .filter((run) => run.ticker === ticker)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }
}
