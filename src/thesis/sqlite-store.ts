import { DatabaseSync } from "node:sqlite";
import type { ThesisEvent, ThesisVersion } from "./types.js";
import type { ThesisStore } from "./store.js";

function parseVersion(json: unknown): ThesisVersion {
  if (typeof json !== "string") {
    throw new Error("Invalid thesis version payload.");
  }

  return JSON.parse(json) as ThesisVersion;
}

function parseEvent(json: unknown): ThesisEvent {
  if (typeof json !== "string") {
    throw new Error("Invalid thesis event payload.");
  }

  return JSON.parse(json) as ThesisEvent;
}

export class SqliteThesisStore implements ThesisStore {
  private readonly db: DatabaseSync;

  constructor(path = "trading-radar.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS thesis_versions (
        thesis_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        ticker TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (thesis_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_thesis_versions_ticker
      ON thesis_versions (ticker, created_at);

      CREATE TABLE IF NOT EXISTS thesis_events (
        event_id TEXT PRIMARY KEY,
        thesis_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_thesis_events_thesis
      ON thesis_events (thesis_id, occurred_at);
    `);
  }

  async saveVersion(version: ThesisVersion): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO thesis_versions (
          thesis_id,
          version,
          ticker,
          status,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thesis_id, version) DO UPDATE SET
          ticker = excluded.ticker,
          status = excluded.status,
          created_at = excluded.created_at,
          payload_json = excluded.payload_json
      `)
      .run(
        version.thesisId,
        version.version,
        version.ticker,
        version.status,
        version.createdAt,
        JSON.stringify(version),
      );
  }

  async getLatest(thesisId: string): Promise<ThesisVersion | null> {
    const row = this.db
      .prepare(`
        SELECT payload_json
        FROM thesis_versions
        WHERE thesis_id = ?
        ORDER BY version DESC
        LIMIT 1
      `)
      .get(thesisId) as { payload_json?: unknown } | undefined;

    return row?.payload_json ? parseVersion(row.payload_json) : null;
  }

  async listVersions(thesisId: string): Promise<ThesisVersion[]> {
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM thesis_versions
        WHERE thesis_id = ?
        ORDER BY version ASC
      `)
      .all(thesisId) as Array<{ payload_json: unknown }>;

    return rows.map((row) => parseVersion(row.payload_json));
  }

  async appendEvent(event: ThesisEvent): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO thesis_events (
          event_id,
          thesis_id,
          ticker,
          occurred_at,
          event_type,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id) DO UPDATE SET
          thesis_id = excluded.thesis_id,
          ticker = excluded.ticker,
          occurred_at = excluded.occurred_at,
          event_type = excluded.event_type,
          payload_json = excluded.payload_json
      `)
      .run(
        event.eventId,
        event.thesisId,
        event.ticker,
        event.occurredAt,
        event.eventType,
        JSON.stringify(event),
      );
  }

  async listEvents(thesisId: string): Promise<ThesisEvent[]> {
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM thesis_events
        WHERE thesis_id = ?
        ORDER BY occurred_at ASC
      `)
      .all(thesisId) as Array<{ payload_json: unknown }>;

    return rows.map((row) => parseEvent(row.payload_json));
  }

  close(): void {
    this.db.close();
  }
}
