import type { PersonalizationService } from "../personalization/service.js";
import type { DailyDeliveryService } from "./service.js";

function taipeiParts(now = new Date()): {
  localDate: string;
  hour: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    weekday: weekdayMap[value("weekday")] ?? 0,
  };
}

export class DailyResearchScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly personalization: PersonalizationService,
    private readonly delivery: DailyDeliveryService,
    private readonly options: {
      afterHour?: number;
      intervalMs?: number;
    } = {},
  ) {}

  start(): void {
    if (this.timer) return;

    const intervalMs = Math.max(
      60_000,
      this.options.intervalMs ?? 60 * 60 * 1000,
    );

    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;

    const { hour, weekday } = taipeiParts(now);
    const afterHour = this.options.afterHour ?? 17;

    if (weekday === 0 || weekday === 6 || hour < afterHour) {
      return;
    }

    this.running = true;
    try {
      const profiles = await this.personalization.listProfiles();
      for (const profile of profiles) {
        try {
          await this.delivery.runForUser(profile.userId);
        } catch (error) {
          console.error(
            JSON.stringify({
              service: "daily-research-scheduler",
              userId: profile.userId,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown scheduler error",
            }),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
