import { DatabaseSync } from "node:sqlite";
import type {
  PreferenceChange,
  UserFeedback,
  UserProfile,
} from "./types.js";
import type { PersonalizationStore } from "./store.js";

function parse<T>(value: unknown): T {
  if (typeof value !== "string") {
    throw new Error("Invalid personalization payload.");
  }
  return JSON.parse(value) as T;
}

export class SqlitePersonalizationStore
  implements PersonalizationStore
{
  private readonly db: DatabaseSync;

  constructor(path = "trading-radar.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_feedback (
        feedback_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_user_feedback_user
      ON user_feedback (user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS preference_changes (
        change_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_preference_changes_user
      ON preference_changes (user_id, created_at DESC);
    `);
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const row = this.db
      .prepare(`
        SELECT payload_json
        FROM user_profiles
        WHERE user_id = ?
        LIMIT 1
      `)
      .get(userId) as { payload_json?: unknown } | undefined;

    return row?.payload_json
      ? parse<UserProfile>(row.payload_json)
      : null;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO user_profiles (user_id, updated_at, payload_json)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          updated_at = excluded.updated_at,
          payload_json = excluded.payload_json
      `)
      .run(
        profile.userId,
        profile.updatedAt,
        JSON.stringify(profile),
      );
  }

  async listProfiles(): Promise<UserProfile[]> {
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM user_profiles
        ORDER BY updated_at DESC
      `)
      .all() as Array<{ payload_json: unknown }>;

    return rows.map((row) => parse<UserProfile>(row.payload_json));
  }

  async appendFeedback(feedback: UserFeedback): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO user_feedback (
          feedback_id,
          user_id,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?)
      `)
      .run(
        feedback.feedbackId,
        feedback.userId,
        feedback.createdAt,
        JSON.stringify(feedback),
      );
  }

  async listFeedback(
    userId: string,
    limit = 100,
  ): Promise<UserFeedback[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM user_feedback
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(userId, safeLimit) as Array<{ payload_json: unknown }>;

    return rows.map((row) => parse<UserFeedback>(row.payload_json));
  }

  async appendPreferenceChange(
    change: PreferenceChange,
  ): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO preference_changes (
          change_id,
          user_id,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?)
      `)
      .run(
        change.changeId,
        change.userId,
        change.createdAt,
        JSON.stringify(change),
      );
  }

  async listPreferenceChanges(
    userId: string,
    limit = 100,
  ): Promise<PreferenceChange[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM preference_changes
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(userId, safeLimit) as Array<{ payload_json: unknown }>;

    return rows.map((row) =>
      parse<PreferenceChange>(row.payload_json),
    );
  }

  close(): void {
    this.db.close();
  }
}
