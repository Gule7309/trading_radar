import { createHash } from "node:crypto";
import type {
  Claim,
  EvidenceLink,
  ResearchState,
} from "../domain/research.js";
import { detectVerificationConflict } from "./conflict-detector.js";
import {
  stableClaimId,
  type ClaimExtractor,
} from "./claim-extractor.js";
import type { TextualVerifier } from "./textual-verifier.js";
import type { RiskExtractor } from "./risk-extractor.js";

export interface VerificationPipeline {
  run(state: ResearchState): Promise<void>;
}

function stableEvidenceId(
  claimId: string,
  sourceId: string,
  result: string,
): string {
  return `evidence-${createHash("sha256")
    .update(`${claimId}\n${sourceId}\n${result}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function aggregateClaimStatus(
  evidence: EvidenceLink[],
): Claim["status"] {
  const hasSupported = evidence.some(
    (item) => item.verificationResult === "SUPPORTED",
  );
  const hasRefuted = evidence.some(
    (item) => item.verificationResult === "REFUTED",
  );

  if (hasSupported && hasRefuted) return "CONFLICTING";
  if (hasSupported) return "SUPPORTED";
  if (hasRefuted) return "REFUTED";
  return "INSUFFICIENT";
}

export class DefaultVerificationPipeline implements VerificationPipeline {
  constructor(
    private readonly claimExtractor: ClaimExtractor,
    private readonly textualVerifier: TextualVerifier,
    private readonly riskExtractor: RiskExtractor,
  ) {}

  async run(state: ResearchState): Promise<void> {
    const extractedClaims = await this.claimExtractor.extract(state);
    const sourceById = new Map(
      state.sources.map((source) => [source.sourceId, source]),
    );

    state.claims = [];
    state.evidence = [];
    state.conflicts = [];

    for (const extracted of extractedClaims) {
      const claim: Claim = {
        claimId: stableClaimId(extracted.text),
        text: extracted.text,
        category: extracted.category,
        importance: extracted.importance,
        status: "PENDING",
      };

      const claimEvidence: EvidenceLink[] = [];

      for (const sourceId of extracted.sourceIds) {
        const source = sourceById.get(sourceId);
        if (!source) continue;

        const verification = await this.textualVerifier.verify(claim, source);
        const evidence: EvidenceLink = {
          evidenceId: stableEvidenceId(
            claim.claimId,
            source.sourceId,
            verification.result,
          ),
          claimId: claim.claimId,
          sourceId: source.sourceId,
          evidenceText:
            verification.evidenceSpan?.trim() ||
            source.snippet.slice(0, 800),
          verificationResult: verification.result,
          verifierReason: verification.reason,
        };

        claimEvidence.push(evidence);
        state.evidence.push(evidence);
      }

      claim.status = aggregateClaimStatus(claimEvidence);
      state.claims.push(claim);

      const conflict = detectVerificationConflict(claim, claimEvidence);
      if (conflict) {
        state.conflicts.push(conflict);
      }
    }

    const validSourceIds = new Set(state.sources.map((source) => source.sourceId));
    const extractedRisks = await this.riskExtractor.extract(state);

    state.risks = extractedRisks
      .map((risk) => ({
        ...risk,
        sourceIds: risk.sourceIds.filter((sourceId) =>
          validSourceIds.has(sourceId),
        ),
      }))
      .filter((risk) => risk.sourceIds.length > 0);
  }
}
