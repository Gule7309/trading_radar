import { DatabaseSync } from "node:sqlite";
import type { WatchlistStore } from "./store.js";
import type { WatchlistItem } from "./types.js";

function parse(value: unknown): WatchlistItem {
  if (typeof value !== "string") {
    throw new Error("Invalid watchlist payload.");
  }
  return JSON.parse(value) as WatchlistItem;
}

export class SqliteWatchlistStore implements WatchlistStore {
  private readonly db: DatabaseSync;

  constructor(path = "trading-radar.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS watchlist (
        user_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        thesis_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (user_id, ticker)
      );

      CREATE INDEX IF NOT EXISTS idx_watchlist_user
      ON watchlist (user_id, updated_at DESC);
    `);
  }

  async save(item: WatchlistItem): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO watchlist (
          user_id,
          ticker,
          thesis_id,
          updated_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, ticker) DO UPDATE SET
          thesis_id = excluded.thesis_id,
          updated_at = excluded.updated_at,
          payload_json = excluded.payload_json
      `)
      .run(
        item.userId,
        item.ticker,
        item.thesisId,
        item.updatedAt,
        JSON.stringify(item),
      );
  }

  async get(
    userId: string,
    ticker: string,
  ): Promise<WatchlistItem | null> {
    const row = this.db
      .prepare(`
        SELECT payload_json
        FROM watchlist
        WHERE user_id = ? AND ticker = ?
        LIMIT 1
      `)
      .get(userId, ticker) as
      | { payload_json?: unknown }
      | undefined;

    return row?.payload_json ? parse(row.payload_json) : null;
  }

  async list(userId: string): Promise<WatchlistItem[]> {
    const rows = this.db
      .prepare(`
        SELECT payload_json
        FROM watchlist
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `)
      .all(userId) as Array<{ payload_json: unknown }>;

    return rows.map((row) => parse(row.payload_json));
  }

  async remove(userId: string, ticker: string): Promise<boolean> {
    const result = this.db
      .prepare(`
        DELETE FROM watchlist
        WHERE user_id = ? AND ticker = ?
      `)
      .run(userId, ticker);

    return Number(result.changes) > 0;
  }

  close(): void {
    this.db.close();
  }
}
