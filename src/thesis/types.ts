import type { ClaimStatus } from "../domain/research.js";

export type ThesisStatus =
  | "ACTIVE"
  | "STRENGTHENED"
  | "UNCHANGED"
  | "WEAKENED"
  | "INVALIDATED";

export interface ThesisClaimSnapshot {
  claimId: string;
  text: string;
  status: ClaimStatus;
  sourceIds: string[];
  importance: "CORE" | "SUPPORTING";
}

export interface ThesisVersion {
  thesisId: string;
  ticker: string;
  version: number;
  thesisText: string;
  status: ThesisStatus;
  coreClaims: ThesisClaimSnapshot[];
  supportingClaims: ThesisClaimSnapshot[];
  risks: Array<{
    title: string;
    explanation: string;
    sourceIds: string[];
  }>;
  invalidationConditions: string[];
  createdAt: string;
  changeReason?: string;
}

export interface ThesisEvent {
  eventId: string;
  thesisId: string;
  ticker: string;
  occurredAt: string;
  eventType:
    | "NEW_RESEARCH_RESULT"
    | "MONTHLY_REVENUE"
    | "MATERIAL_DISCLOSURE"
    | "NEWS"
    | "MANUAL_RECHECK";
  summary: string;
  sourceIds: string[];
}
