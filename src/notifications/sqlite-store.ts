import { DatabaseSync } from "node:sqlite";
import type { NotificationStore } from "./store.js";
import type { NotificationItem } from "./types.js";

function parse(value: unknown): NotificationItem {
  if (typeof value !== "string") {
    throw new Error("Invalid notification payload.");
  }
  return JSON.parse(value) as NotificationItem;
}

export class SqliteNotificationStore implements NotificationStore {
  private readonly db: DatabaseSync;

  constructor(path = "trading-radar.sqlite") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS notifications (
        notification_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user
      ON notifications (user_id, created_at DESC);
    `);
  }

  async save(notification: NotificationItem): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO notifications (
          notification_id,
          user_id,
          type,
          created_at,
          read_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(notification_id) DO UPDATE SET
          user_id = excluded.user_id,
          type = excluded.type,
          created_at = excluded.created_at,
          read_at = excluded.read_at,
          payload_json = excluded.payload_json
      `)
      .run(
        notification.notificationId,
        notification.userId,
        notification.type,
        notification.createdAt,
        notification.readAt ?? null,
        JSON.stringify(notification),
      );
  }

  async list(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationItem[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    const rows = options.unreadOnly
      ? this.db
          .prepare(`
            SELECT payload_json
            FROM notifications
            WHERE user_id = ? AND read_at IS NULL
            ORDER BY created_at DESC
            LIMIT ?
          `)
          .all(userId, limit)
      : this.db
          .prepare(`
            SELECT payload_json
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `)
          .all(userId, limit);

    return (rows as Array<{ payload_json: unknown }>).map((row) =>
      parse(row.payload_json),
    );
  }

  async get(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null> {
    const row = this.db
      .prepare(`
        SELECT payload_json
        FROM notifications
        WHERE user_id = ? AND notification_id = ?
        LIMIT 1
      `)
      .get(userId, notificationId) as
      | { payload_json?: unknown }
      | undefined;

    return row?.payload_json ? parse(row.payload_json) : null;
  }

  async markRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): Promise<NotificationItem | null> {
    const current = await this.get(userId, notificationId);
    if (!current) return null;

    const next = { ...current, readAt };
    await this.save(next);
    return next;
  }

  close(): void {
    this.db.close();
  }
}
