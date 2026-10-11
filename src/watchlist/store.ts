import type { WatchlistItem } from "./types.js";

export interface WatchlistStore {
  save(item: WatchlistItem): Promise<void>;
  get(userId: string, ticker: string): Promise<WatchlistItem | null>;
  list(userId: string): Promise<WatchlistItem[]>;
  remove(userId: string, ticker: string): Promise<boolean>;
}

export class InMemoryWatchlistStore implements WatchlistStore {
  private readonly items = new Map<string, WatchlistItem>();

  private key(userId: string, ticker: string): string {
    return `${userId}:${ticker}`;
  }

  async save(item: WatchlistItem): Promise<void> {
    this.items.set(this.key(item.userId, item.ticker), structuredClone(item));
  }

  async get(userId: string, ticker: string): Promise<WatchlistItem | null> {
    const item = this.items.get(this.key(userId, ticker));
    return item ? structuredClone(item) : null;
  }

  async list(userId: string): Promise<WatchlistItem[]> {
    return Array.from(this.items.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => structuredClone(item));
  }

  async remove(userId: string, ticker: string): Promise<boolean> {
    return this.items.delete(this.key(userId, ticker));
  }
}
