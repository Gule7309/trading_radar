import type { NotificationItem } from "./types.js";

export interface NotificationStore {
  save(notification: NotificationItem): Promise<void>;
  list(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<NotificationItem[]>;
  get(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null>;
  markRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): Promise<NotificationItem | null>;
}

export class InMemoryNotificationStore implements NotificationStore {
  private readonly items = new Map<string, NotificationItem>();

  async save(notification: NotificationItem): Promise<void> {
    this.items.set(
      notification.notificationId,
      structuredClone(notification),
    );
  }

  async list(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationItem[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    return Array.from(this.items.values())
      .filter(
        (item) =>
          item.userId === userId &&
          (!options.unreadOnly || !item.readAt),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }

  async get(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null> {
    const item = this.items.get(notificationId);
    return item?.userId === userId ? structuredClone(item) : null;
  }

  async markRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): Promise<NotificationItem | null> {
    const item = this.items.get(notificationId);
    if (!item || item.userId !== userId) return null;

    const next = { ...item, readAt };
    this.items.set(notificationId, next);
    return structuredClone(next);
  }
}
