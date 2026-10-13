import type {
  PreferenceChange,
  UserFeedback,
  UserProfile,
} from "./types.js";

export interface PersonalizationStore {
  getProfile(userId: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  listProfiles(): Promise<UserProfile[]>;
  appendFeedback(feedback: UserFeedback): Promise<void>;
  listFeedback(userId: string, limit?: number): Promise<UserFeedback[]>;
  appendPreferenceChange(change: PreferenceChange): Promise<void>;
  listPreferenceChanges(
    userId: string,
    limit?: number,
  ): Promise<PreferenceChange[]>;
}

export class InMemoryPersonalizationStore
  implements PersonalizationStore
{
  private readonly profiles = new Map<string, UserProfile>();
  private readonly feedback: UserFeedback[] = [];
  private readonly changes: PreferenceChange[] = [];

  async getProfile(userId: string): Promise<UserProfile | null> {
    const profile = this.profiles.get(userId);
    return profile ? structuredClone(profile) : null;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    this.profiles.set(profile.userId, structuredClone(profile));
  }

  async listProfiles(): Promise<UserProfile[]> {
    return Array.from(this.profiles.values()).map((profile) =>
      structuredClone(profile),
    );
  }

  async appendFeedback(feedback: UserFeedback): Promise<void> {
    this.feedback.push(structuredClone(feedback));
  }

  async listFeedback(
    userId: string,
    limit = 100,
  ): Promise<UserFeedback[]> {
    return this.feedback
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async appendPreferenceChange(
    change: PreferenceChange,
  ): Promise<void> {
    this.changes.push(structuredClone(change));
  }

  async listPreferenceChanges(
    userId: string,
    limit = 100,
  ): Promise<PreferenceChange[]> {
    return this.changes
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }
}
