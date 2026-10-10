import { DatabaseSync } from "node:sqlite";
import type {
  ResearchRunStore,
  StoredResearchRun,
} from "./store.js";

function parseRun(value: unknown): StoredResearchRun {
  if (typeof value !== "string") {
    throw new Error("Invalid research run payload.");
  }

  return JSON.parse(value) as StoredResearchRun;
}

export class SqliteResearchRunStore implements ResearchRunStore {
  private readonly db: DatabaseSync;

  constructor(path = "trading-radar.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS research_runs (
        run_id TEXT PRIMARY KEY,
        ticker TEXT NOT NULL,
        status TEXT NOT NULL,
        stop_reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_research_runs_ticker
      ON research_runs (ticker, created_at DESC);
    `);
  }

  async save(run: StoredResearchRun): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO research_runs (
          run_id,
          ticker,
          status,
          stop_reason,
          created_at,
          completed_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          ticker = excluded.ticker,
          status = excluded.status,
          stop_reason = excluded.stop_reason,
          created_at = excluded.created_at,
          completed_at = excluded.completed_at,
          payload_json = excluded.payload_json
      `)
      .run(
        run.runId,
        run.ticker,
        run.result.status,
        run.result.stopReason,
        run.createdAt,
        run.result.completedAt,
        JSON.stringify(run),
      );
  }

  async get(runId: string): Promise<StoredResearchRun | null> {
    const row = this.db
      .prepare(`
        SELECT payload_json
        FROM research_runs
        WHERE run_id = ?
        LIMIT 1
      `)
      .get(runId) as { payload_json?: unknown } | undefined;

    return row?.payload_json ? parseRun(row.payload_json) : null;
  }

  async listByTicker(
    ticker: string,
    limit = 20,
  ): Promise<StoredResearchRun[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM research_runs
        WHERE ticker = ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(ticker, safeLimit) as Array<{ payload_json: unknown }>;

    return rows.map((row) => parseRun(row.payload_json));
  }

  close(): void {
    this.db.close();
  }
}
