import { randomUUID } from "node:crypto";
import { screeningOutputToCandidatePackets } from "../domain/screening-output.js";
import type { BatchResearchService } from "../research/batch-service.js";
import type { PersonalizationService } from "../personalization/service.js";
import type { NotificationService } from "../notifications/service.js";
import type { DeliveryRunStore } from "./store.js";
import type { ScreeningProvider } from "./screening-provider.js";
import type { DailyDeliveryRun } from "./types.js";

export function taipeiLocalDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export class DailyDeliveryService {
  constructor(
    private readonly screening: ScreeningProvider,
    private readonly personalization: PersonalizationService,
    private readonly batch: BatchResearchService,
    private readonly notifications: NotificationService,
    private readonly store: DeliveryRunStore,
  ) {}

  async runForUser(
    userId: string,
    options: {
      force?: boolean;
      screeningLimit?: number;
      topK?: number;
      researchLimit?: number;
      concurrency?: number;
    } = {},
  ) {
    const localDate = taipeiLocalDate();

    if (!options.force) {
      const existing = await this.store.getSuccessful(userId, localDate);
      if (existing) {
        return {
          reused: true,
          deliveryRun: existing,
        };
      }
    }

    const startedAt = new Date().toISOString();
    const deliveryRun: DailyDeliveryRun = {
      deliveryRunId: randomUUID(),
      userId,
      localDate,
      status: "RUNNING",
      startedAt,
    };
    await this.store.save(deliveryRun);

    try {
      const profile =
        await this.personalization.getOrCreateProfile(userId);
      const output = await this.screening.screen(profile, {
        limit: options.screeningLimit ?? 20,
      });
      if (!options.force && output.run.priceAsOf !== localDate) {
        const waiting: DailyDeliveryRun = {
          ...deliveryRun,
          status: "WAITING_FOR_FRESH_DATA",
          screeningRunId: output.run.runId,
          priceAsOf: output.run.priceAsOf,
          completedAt: new Date().toISOString(),
          error:
            `Latest market data is ${output.run.priceAsOf}; local date is ${localDate}. No daily notification was sent.`,
        };
        await this.store.save(waiting);

        return {
          reused: false,
          waitingForFreshData: true,
          deliveryRun: waiting,
          screeningOutput: output,
        };
      }

      const candidates =
        screeningOutputToCandidatePackets(output);

      const result = await this.batch.run(candidates, {
        topK: options.topK ?? 5,
        researchLimit: options.researchLimit ?? 10,
        concurrency: options.concurrency ?? 2,
      });

      const completed: DailyDeliveryRun = {
        ...deliveryRun,
        status: "SUCCESS",
        screeningRunId: output.run.runId,
        priceAsOf: output.run.priceAsOf,
        researchCount: result.researched,
        publishedCount: result.top.length,
        completedAt: new Date().toISOString(),
      };
      await this.store.save(completed);

      const notification =
        await this.notifications.dailyResearchReady({
          userId,
          screeningRunId: output.run.runId,
          publishedCount: result.top.length,
          researchedCount: result.researched,
        });

      return {
        reused: false,
        deliveryRun: completed,
        screeningOutput: output,
        result,
        notification,
      };
    } catch (error) {
      const failed: DailyDeliveryRun = {
        ...deliveryRun,
        status: "FAILED",
        completedAt: new Date().toISOString(),
        error:
          error instanceof Error ? error.message : "Unknown delivery error",
      };
      await this.store.save(failed);
      throw error;
    }
  }

  async listRuns(userId: string, limit?: number) {
    return this.store.list(userId, limit);
  }
}
