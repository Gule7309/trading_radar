import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchService } from "../research/service.js";
import type { ThesisEvent } from "../thesis/types.js";
import type { ThesisService } from "../thesis/service.js";
import type { ThesisResearchService } from "../thesis/research-service.js";
import type { NotificationService } from "../notifications/service.js";
import type { WatchlistStore } from "./store.js";
import type { WatchlistItem } from "./types.js";

export class WatchlistService {
  constructor(
    private readonly store: WatchlistStore,
    private readonly research: Pick<ResearchService, "get">,
    private readonly theses: Pick<ThesisService, "createFromResearch">,
    private readonly thesisResearch: Pick<ThesisResearchService, "recheck">,
    private readonly notifications?: NotificationService,
  ) {}

  async saveFromResearchRun(
    userId: string,
    runId: string,
  ): Promise<WatchlistItem> {
    const existingRun = await this.research.get(runId);
    if (!existingRun) {
      throw new Error("RESEARCH_RUN_NOT_FOUND");
    }

    if (
      existingRun.result.status !== "PUBLISHABLE" ||
      !existingRun.result.thesis
    ) {
      throw new Error("WATCHLIST_REQUIRES_PUBLISHABLE_RESEARCH");
    }

    const existing = await this.store.get(
      userId,
      existingRun.ticker,
    );
    if (existing) return existing;

    const thesis = await this.theses.createFromResearch(
      existingRun.result,
    );
    const now = new Date().toISOString();

    const item: WatchlistItem = {
      userId,
      ticker: existingRun.ticker,
      companyName: existingRun.candidate.companyName,
      thesisId: thesis.thesisId,
      sourceResearchRunId: runId,
      candidate: existingRun.candidate,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.save(item);
    return item;
  }

  async recheck(
    userId: string,
    ticker: string,
    candidate: CandidatePacket,
    eventType: ThesisEvent["eventType"] = "MANUAL_RECHECK",
  ) {
    const item = await this.store.get(userId, ticker);
    if (!item) {
      throw new Error("WATCHLIST_ITEM_NOT_FOUND");
    }

    if (candidate.ticker !== ticker) {
      throw new Error("WATCHLIST_TICKER_MISMATCH");
    }

    const result = await this.thesisResearch.recheck(
      item.thesisId,
      candidate,
      eventType,
    );

    const run = await this.research.get(result.researchRunId);
    if (run && this.notifications) {
      await this.notifications.thesisChanged({
        userId,
        thesis: result.thesis,
        researchRunId: result.researchRunId,
      });
      await this.notifications.evidenceConflict({
        userId,
        result: run.result,
        thesisId: item.thesisId,
      });
    }

    const next: WatchlistItem = {
      ...item,
      candidate,
      sourceResearchRunId: result.researchRunId,
      updatedAt: new Date().toISOString(),
    };
    await this.store.save(next);

    return {
      ...result,
      watchlistItem: next,
    };
  }

  async get(userId: string, ticker: string) {
    return this.store.get(userId, ticker);
  }

  async list(userId: string) {
    return this.store.list(userId);
  }

  async remove(userId: string, ticker: string) {
    return this.store.remove(userId, ticker);
  }
}
