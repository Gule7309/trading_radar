import type { CandidatePacket } from "./candidate.js";

export type ResearchPhase =
  | "DISCOVERY"
  | "RESEARCH"
  | "VERIFY"
  | "SKEPTIC"
  | "FINALIZE"
  | "DONE"
  | "REJECTED";

export type ClaimStatus =
  | "PENDING"
  | "SUPPORTED"
  | "REFUTED"
  | "INSUFFICIENT"
  | "CONFLICTING";

export type StopReason =
  | "PUBLISHED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNRESOLVED_CONFLICT"
  | "BUDGET_EXHAUSTED"
  | "SOURCE_FAILURE"
  | "MODEL_FAILURE"
  | "NO_CORE_CLAIM"
  | "NO_RISK_IDENTIFIED"
  | "UNKNOWN";

export interface KnownFact {
  factId: string;
  text: string;
  sourceIds: string[];
}

export interface OpenQuestion {
  questionId: string;
  text: string;
  evidenceNeed: string;
  status: "OPEN" | "RESOLVED";
}

export type SourceMetadataValue = string | number | boolean | null;

export interface SourceDocument {
  sourceId: string;
  url: string;
  title: string;
  publisher: string;
  sourceType: "TWSE" | "TPEX" | "MOPS" | "COMPANY_IR" | "NEWS" | "OTHER";
  sourceTier: 1 | 2 | 3;
  publishedAt?: string;
  dataPeriod?: string;
  retrievedAt: string;
  ticker?: string;
  snippet: string;
  contentHash: string;
  metadata?: Record<string, SourceMetadataValue>;
  untrustedContent: true;
}

export interface Claim {
  claimId: string;
  text: string;
  category:
    | "FINANCIAL"
    | "EVENT"
    | "MANAGEMENT_GUIDANCE"
    | "INDUSTRY"
    | "RISK"
    | "CAUSAL"
    | "OTHER";
  importance: "CORE" | "SUPPORTING";
  status: ClaimStatus;
}

export interface EvidenceLink {
  evidenceId: string;
  claimId: string;
  sourceId: string;
  evidenceText: string;
  verificationResult: "SUPPORTED" | "REFUTED" | "INSUFFICIENT";
  verifierReason: string;
}

export interface RiskItem {
  riskId: string;
  title: string;
  explanation: string;
  sourceIds: string[];
}

export interface ConflictItem {
  conflictId: string;
  claimId: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  sourceIds: string[];
  resolved: boolean;
  note: string;
}

export type ResearchAction =
  | {
      type: "SEARCH_OFFICIAL";
      dataset: "MONTHLY_REVENUE" | "MATERIAL_DISCLOSURES";
      purpose: string;
      query: string;
      evidenceNeed: string;
    }
  | {
      type: "SEARCH_NEWS";
      purpose: string;
      query: string;
      from?: string;
      to?: string;
    }
  | {
      type: "FETCH_SOURCE";
      sourceId: string;
      purpose: string;
    }
  | {
      type: "VERIFY";
      claimIds: string[];
    }
  | {
      type: "RUN_SKEPTIC";
      thesisDraft: string;
    }
  | {
      type: "FINALIZE";
    }
  | {
      type: "REJECT";
      reason:
        | "INSUFFICIENT_EVIDENCE"
        | "UNRESOLVED_CONFLICT"
        | "BUDGET_EXHAUSTED"
        | "SOURCE_FAILURE";
    };

export interface ResearchBudget {
  stepsUsed: number;
  maxSteps: number;
  searchesUsed: number;
  maxSearches: number;
  skepticRounds: number;
  maxSkepticRounds: number;
  startedAt: string;
}

export interface ResearchTraceStep {
  step: number;
  action: ResearchAction["type"];
  actionDetail?: string;
  reasonCode: string;
  decisionSummary?: string;
  tool?: string;
  outcome: string;
  createdAt: string;
}

export interface ResearchDiagnostic {
  stage: "CONTROLLER" | "VERIFICATION" | "SKEPTIC" | "THESIS";
  message: string;
  createdAt: string;
}

export interface ResearchState {
  runId: string;
  candidate: CandidatePacket;
  phase: ResearchPhase;
  knownFacts: KnownFact[];
  openQuestions: OpenQuestion[];
  sources: SourceDocument[];
  claims: Claim[];
  evidence: EvidenceLink[];
  risks: RiskItem[];
  conflicts: ConflictItem[];
  budget: ResearchBudget;
  researchTrace: ResearchTraceStep[];
  diagnostics: ResearchDiagnostic[];
  lastAction?: ResearchAction;
  stopReason?: StopReason;
  invalidationConditions: string[];
}

export interface ResearchResult {
  runId: string;
  ticker: string;
  companyName: string;
  status: "PUBLISHABLE" | "REJECTED" | "PARTIAL";
  decision: "KEEP" | "REJECT";
  thesis?: string;
  keyReasons: string[];
  claims: Array<{
    claimId: string;
    text: string;
    status: ClaimStatus;
    sourceIds: string[];
  }>;
  risks: Array<{
    title: string;
    explanation: string;
    sourceIds: string[];
  }>;
  invalidationConditions: string[];
  sources: Array<{
    sourceId: string;
    title: string;
    url: string;
    publisher: string;
    publishedAt?: string;
    dataPeriod?: string;
    sourceTier: number;
  }>;
  verificationSummary: {
    coreClaimCoverage: number;
    primarySourceRatio: number;
    unresolvedConflicts: number;
  };
  researchTrace: ResearchTraceStep[];
  diagnostics: ResearchDiagnostic[];
  stopReason: StopReason;
  startedAt: string;
  completedAt: string;
}
