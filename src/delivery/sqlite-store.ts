import { DatabaseSync } from "node:sqlite";
import type { DeliveryRunStore } from "./store.js";
import type { DailyDeliveryRun } from "./types.js";

function parse(value: unknown): DailyDeliveryRun {
  if (typeof value !== "string") {
    throw new Error("Invalid delivery run payload.");
  }
  return JSON.parse(value) as DailyDeliveryRun;
}

export class SqliteDeliveryRunStore implements DeliveryRunStore {
  private readonly db: DatabaseSync;

  constructor(path = "trading-radar.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS daily_delivery_runs (
        delivery_run_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_daily_delivery_user_date
      ON daily_delivery_runs (user_id, local_date, started_at DESC);
    `);
  }

  async save(run: DailyDeliveryRun): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO daily_delivery_runs (
          delivery_run_id,
          user_id,
          local_date,
          status,
          started_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(delivery_run_id) DO UPDATE SET
          user_id = excluded.user_id,
          local_date = excluded.local_date,
          status = excluded.status,
          started_at = excluded.started_at,
          payload_json = excluded.payload_json
      `)
      .run(
        run.deliveryRunId,
        run.userId,
        run.localDate,
        run.status,
        run.startedAt,
        JSON.stringify(run),
      );
  }

  async getSuccessful(
    userId: string,
    localDate: string,
  ): Promise<DailyDeliveryRun | null> {
    const row = this.db
      .prepare(`
        SELECT payload_json
        FROM daily_delivery_runs
        WHERE user_id = ?
          AND local_date = ?
          AND status = 'SUCCESS'
        ORDER BY started_at DESC
        LIMIT 1
      `)
      .get(userId, localDate) as
      | { payload_json?: unknown }
      | undefined;

    return row?.payload_json ? parse(row.payload_json) : null;
  }

  async list(
    userId: string,
    limit = 100,
  ): Promise<DailyDeliveryRun[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM daily_delivery_runs
        WHERE user_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `)
      .all(userId, safeLimit) as Array<{ payload_json: unknown }>;

    return rows.map((row) => parse(row.payload_json));
  }

  close(): void {
    this.db.close();
  }
}
