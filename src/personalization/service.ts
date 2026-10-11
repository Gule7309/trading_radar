import { randomUUID } from "node:crypto";
import type { StoredResearchRun } from "../research/store.js";
import type { ResearchService } from "../research/service.js";
import type { PersonalizationStore } from "./store.js";
import {
  createDefaultUserProfile,
  defaultSoftPreferences,
  normalizedWeights,
  type FeedbackInput,
  type FeedbackReason,
  type PreferenceChange,
  type SoftPreferenceWeights,
  type UserFeedback,
  type UserProfile,
  type UserProfileUpdate,
  UserProfileSchema,
} from "./types.js";

const STEP = 0.05;

function add(
  weights: SoftPreferenceWeights,
  key: keyof SoftPreferenceWeights,
  amount: number,
): void {
  weights[key] += amount;
}

function adjustedWeights(
  before: SoftPreferenceWeights,
  reasons: FeedbackReason[],
): { after: SoftPreferenceWeights; appliedReasons: string[] } {
  const next = { ...before };
  const appliedReasons: string[] = [];

  for (const reason of reasons) {
    if (reason === "GROWTH" || reason === "INSUFFICIENT_GROWTH") {
      add(next, "growth", STEP);
      appliedReasons.push(`${reason} -> growth +${STEP}`);
      continue;
    }

    if (reason === "FINANCIAL_STABILITY") {
      add(next, "safety", STEP);
      add(next, "profitability", STEP / 2);
      appliedReasons.push(
        `${reason} -> safety +${STEP}, profitability +${STEP / 2}`,
      );
      continue;
    }

    if (reason === "FINANCIAL_QUALITY") {
      add(next, "profitability", STEP);
      add(next, "safety", STEP / 2);
      appliedReasons.push(
        `${reason} -> profitability +${STEP}, safety +${STEP / 2}`,
      );
      continue;
    }

    if (reason === "HIGH_VOLATILITY") {
      add(next, "safety", STEP);
      appliedReasons.push(`${reason} -> safety +${STEP}`);
      continue;
    }

    if (reason === "INDUSTRY_TREND") {
      add(next, "growth", STEP / 2);
      appliedReasons.push(`${reason} -> growth +${STEP / 2}`);
      continue;
    }

    if (reason === "ACCEPTABLE_RISK") {
      add(next, "growth", STEP / 2);
      appliedReasons.push(`${reason} -> growth +${STEP / 2}`);
    }
  }

  return {
    after: normalizedWeights(next),
    appliedReasons,
  };
}

function delta(
  before: SoftPreferenceWeights,
  after: SoftPreferenceWeights,
): SoftPreferenceWeights {
  return {
    growth: after.growth - before.growth,
    profitability: after.profitability - before.profitability,
    safety: after.safety - before.safety,
  };
}

function weightsChanged(
  before: SoftPreferenceWeights,
  after: SoftPreferenceWeights,
): boolean {
  return (
    Math.abs(before.growth - after.growth) > 1e-12 ||
    Math.abs(before.profitability - after.profitability) > 1e-12 ||
    Math.abs(before.safety - after.safety) > 1e-12
  );
}

export class PersonalizationService {
  constructor(
    private readonly store: PersonalizationStore,
    private readonly research?: Pick<ResearchService, "get">,
  ) {}

  async getOrCreateProfile(userId: string): Promise<UserProfile> {
    const existing = await this.store.getProfile(userId);
    if (existing) return existing;

    const profile = createDefaultUserProfile(userId);
    await this.store.saveProfile(profile);
    return profile;
  }

  async updateProfile(
    userId: string,
    input: UserProfileUpdate,
  ): Promise<UserProfile> {
    const current = await this.getOrCreateProfile(userId);
    const now = new Date().toISOString();

    const mergedHardConstraints = {
      ...current.hardConstraints,
      ...(input.hardConstraints ?? {}),
    };
    const mergedSoftPreferences =
      input.softPreferences
        ? {
            ...current.softPreferences,
            ...input.softPreferences,
          }
        : input.researchStyle &&
            input.researchStyle !== current.researchStyle
          ? defaultSoftPreferences(input.researchStyle)
          : current.softPreferences;

    const next = UserProfileSchema.parse({
      ...current,
      ...input,
      userId,
      hardConstraints: mergedHardConstraints,
      softPreferences: normalizedWeights(mergedSoftPreferences),
      createdAt: current.createdAt,
      updatedAt: now,
    });

    if (
      weightsChanged(
        current.softPreferences,
        next.softPreferences,
      )
    ) {
      await this.store.appendPreferenceChange({
        changeId: randomUUID(),
        userId,
        source: "MANUAL",
        before: current.softPreferences,
        after: next.softPreferences,
        delta: delta(
          current.softPreferences,
          next.softPreferences,
        ),
        reason: input.researchStyle
          ? `Manual research-style update to ${input.researchStyle}.`
          : "Manual soft-preference update.",
        createdAt: now,
      });
    }

    await this.store.saveProfile(next);
    return next;
  }

  async resetSoftPreferences(
    userId: string,
  ): Promise<UserProfile> {
    const current = await this.getOrCreateProfile(userId);
    const now = new Date().toISOString();
    const after = defaultSoftPreferences(
      current.researchStyle,
    );
    const next = UserProfileSchema.parse({
      ...current,
      softPreferences: after,
      updatedAt: now,
    });

    if (weightsChanged(current.softPreferences, after)) {
      await this.store.appendPreferenceChange({
        changeId: randomUUID(),
        userId,
        source: "RESET",
        before: current.softPreferences,
        after,
        delta: delta(current.softPreferences, after),
        reason:
          "User reset soft preferences to the current research-style default.",
        createdAt: now,
      });
    }

    await this.store.saveProfile(next);
    return next;
  }

  async recordFeedback(
    userId: string,
    input: FeedbackInput,
  ): Promise<{
    feedback: UserFeedback;
    preferenceChange: PreferenceChange;
    profile: UserProfile;
    researchRun: StoredResearchRun | null;
  }> {
    const run = this.research
      ? await this.research.get(input.runId)
      : null;

    if (this.research && !run) {
      throw new Error("RESEARCH_RUN_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const current = await this.getOrCreateProfile(userId);
    const feedbackId = randomUUID();

    const feedback: UserFeedback = {
      feedbackId,
      userId,
      runId: input.runId,
      candidateId: run?.candidate.candidateId ?? input.runId,
      ticker: run?.ticker ?? "unknown",
      action: input.action,
      reasons: input.reasons,
      note: input.note,
      createdAt: now,
    };

    const { after, appliedReasons } = adjustedWeights(
      current.softPreferences,
      input.reasons,
    );

    const profile = UserProfileSchema.parse({
      ...current,
      softPreferences: after,
      updatedAt: now,
    });

    const preferenceChange: PreferenceChange = {
      changeId: randomUUID(),
      userId,
      source: "FEEDBACK",
      feedbackId,
      before: current.softPreferences,
      after,
      delta: delta(current.softPreferences, after),
      reason:
        appliedReasons.length > 0
          ? appliedReasons.join("; ")
          : "Feedback recorded; current three-factor model has no automatic weight mapping for these reasons.",
      createdAt: now,
    };

    await this.store.appendFeedback(feedback);
    await this.store.appendPreferenceChange(preferenceChange);
    await this.store.saveProfile(profile);

    return {
      feedback,
      preferenceChange,
      profile,
      researchRun: run,
    };
  }

  async listFeedback(userId: string, limit?: number) {
    return this.store.listFeedback(userId, limit);
  }

  async listPreferenceChanges(userId: string, limit?: number) {
    return this.store.listPreferenceChanges(userId, limit);
  }

  async listProfiles() {
    return this.store.listProfiles();
  }

  async getScreeningProfile(userId: string) {
    const profile = await this.getOrCreateProfile(userId);

    return {
      excludedIndustries: profile.hardConstraints.excludedIndustries,
      maxDebtRatio: profile.hardConstraints.maxDebtRatio,
      minLiquidity: profile.hardConstraints.minLiquidity,
      excludeDisposition: profile.hardConstraints.excludeDisposition,
      weights: profile.softPreferences,
    };
  }
}
