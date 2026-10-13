import type { PersonalizationService } from "../personalization/service.js";
import type { DailyDeliveryService } from "./service.js";

interface TaipeiParts {
  localDate: string;
  hour: number;
  weekday: number;
}

function taipeiParts(now = new Date()): TaipeiParts {
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
    localDate:
      `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    weekday: weekdayMap[value("weekday")] ?? 0,
  };
}

function subtractDays(
  isoDate: string,
  days: number,
): string {
  const [year, month, day] = isoDate
    .split("-")
    .map((value) => Number(value));
  const date = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1),
  );
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function latestExpectedDeliveryDate(
  now = new Date(),
  afterHour = 17,
): string {
  const { localDate, hour, weekday } = taipeiParts(now);

  if (
    weekday >= 1 &&
    weekday <= 5 &&
    hour >= afterHour
  ) {
    return localDate;
  }

  if (weekday === 0) {
    return subtractDays(localDate, 2);
  }

  if (weekday === 6) {
    return subtractDays(localDate, 1);
  }

  if (weekday === 1) {
    return subtractDays(localDate, 3);
  }

  return subtractDays(localDate, 1);
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
    this.timer = setInterval(
      () => void this.tick(),
      intervalMs,
    );
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;

    const afterHour = this.options.afterHour ?? 17;
    const targetDate = latestExpectedDeliveryDate(
      now,
      afterHour,
    );

    this.running = true;
    try {
      const profiles =
        await this.personalization.listProfiles();

      for (const profile of profiles) {
        try {
          await this.delivery.runForUser(
            profile.userId,
            { targetDate },
          );
        } catch (error) {
          console.error(
            JSON.stringify({
              service: "daily-research-scheduler",
              userId: profile.userId,
              targetDate,
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
