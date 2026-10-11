import type { CandidatePacket } from "../domain/candidate.js";

export interface WatchlistItem {
  userId: string;
  ticker: string;
  companyName: string;
  thesisId: string;
  sourceResearchRunId: string;
  candidate: CandidatePacket;
  createdAt: string;
  updatedAt: string;
}
