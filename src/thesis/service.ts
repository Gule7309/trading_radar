import { randomUUID } from "node:crypto";
import type { ResearchResult } from "../domain/research.js";
import type { ThesisStore } from "./store.js";
import { createInitialThesis, recheckThesis } from "./tracker.js";
import type { ThesisEvent, ThesisVersion } from "./types.js";

export class ThesisService {
  constructor(private readonly store: ThesisStore) {}

  async createFromResearch(
    result: ResearchResult,
    thesisId?: string,
  ): Promise<ThesisVersion> {
    const version = createInitialThesis(result, thesisId);
    await this.store.saveVersion(version);

    await this.store.appendEvent({
      eventId: randomUUID(),
      thesisId: version.thesisId,
      ticker: version.ticker,
      occurredAt: version.createdAt,
      eventType: "NEW_RESEARCH_RESULT",
      summary: "Initial verified thesis created from a publishable research result.",
      sourceIds: result.sources.map((source) => source.sourceId),
    });

    return version;
  }

  async getLatest(thesisId: string) {
    return this.store.getLatest(thesisId);
  }

  async listVersions(thesisId: string) {
    return this.store.listVersions(thesisId);
  }

  async listEvents(thesisId: string) {
    return this.store.listEvents(thesisId);
  }

  async recheckFromResearch(
    thesisId: string,
    result: ResearchResult,
    event?: Omit<ThesisEvent, "eventId" | "thesisId" | "ticker">,
  ): Promise<ThesisVersion> {
    const previous = await this.store.getLatest(thesisId);

    if (!previous) {
      throw new Error("Cannot recheck a thesis that does not exist.");
    }

    const next = recheckThesis(previous, result);
    await this.store.saveVersion(next);

    await this.store.appendEvent({
      eventId: randomUUID(),
      thesisId,
      ticker: next.ticker,
      occurredAt: event?.occurredAt ?? next.createdAt,
      eventType: event?.eventType ?? "MANUAL_RECHECK",
      summary:
        event?.summary ??
        next.changeReason ??
        "Thesis rechecked against a new research result.",
      sourceIds:
        event?.sourceIds ?? result.sources.map((source) => source.sourceId),
    });

    return next;
  }
}
