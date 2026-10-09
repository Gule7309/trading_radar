import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchService } from "../research/service.js";
import type { ThesisService } from "./service.js";
import type { ThesisEvent, ThesisVersion } from "./types.js";

export interface ThesisResearchResult {
  researchRunId: string;
  thesis: ThesisVersion;
}

export class ThesisResearchService {
  constructor(
    private readonly research: ResearchService,
    private readonly theses: ThesisService,
  ) {}

  async create(
    candidate: CandidatePacket,
    thesisId?: string,
  ): Promise<ThesisResearchResult> {
    const result = await this.research.run(candidate);

    if (result.status !== "PUBLISHABLE" || !result.thesis) {
      throw new Error(
        `Cannot create thesis from research result ${result.runId}: ${result.stopReason}`,
      );
    }

    const thesis = await this.theses.createFromResearch(result, thesisId);

    return {
      researchRunId: result.runId,
      thesis,
    };
  }

  async recheck(
    thesisId: string,
    candidate: CandidatePacket,
    eventType: ThesisEvent["eventType"] = "MANUAL_RECHECK",
  ): Promise<ThesisResearchResult> {
    const result = await this.research.run(candidate);

    const thesis = await this.theses.recheckFromResearch(
      thesisId,
      result,
      {
        occurredAt: result.completedAt,
        eventType,
        summary:
          result.status === "PUBLISHABLE"
            ? "Thesis rechecked against a new publishable research run."
            : `Research recheck ended with ${result.stopReason}; thesis state was updated conservatively.`,
        sourceIds: result.sources.map((source) => source.sourceId),
      },
    );

    return {
      researchRunId: result.runId,
      thesis,
    };
  }
}
