import type { DailyDeliveryRun } from "./types.js";

export interface DeliveryRunStore {
  save(run: DailyDeliveryRun): Promise<void>;
  getSuccessful(
    userId: string,
    localDate: string,
  ): Promise<DailyDeliveryRun | null>;
  list(userId: string, limit?: number): Promise<DailyDeliveryRun[]>;
}

export class InMemoryDeliveryRunStore implements DeliveryRunStore {
  private readonly runs = new Map<string, DailyDeliveryRun>();

  async save(run: DailyDeliveryRun): Promise<void> {
    this.runs.set(run.deliveryRunId, structuredClone(run));
  }

  async getSuccessful(
    userId: string,
    localDate: string,
  ): Promise<DailyDeliveryRun | null> {
    const match = Array.from(this.runs.values())
      .filter(
        (run) =>
          run.userId === userId &&
          run.localDate === localDate &&
          run.status === "SUCCESS",
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

    return match ? structuredClone(match) : null;
  }

  async list(
    userId: string,
    limit = 100,
  ): Promise<DailyDeliveryRun[]> {
    return Array.from(this.runs.values())
      .filter((run) => run.userId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
      .map((run) => structuredClone(run));
  }
}
