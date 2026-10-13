import { describe, expect, it } from "vitest";
import {
  DailyResearchScheduler,
  latestExpectedDeliveryDate,
} from "../src/delivery/scheduler.js";

describe("DailyResearchScheduler", () => {
  it("targets today after the configured Taipei hour on a weekday", () => {
    // 2026-10-12 17:00 Asia/Taipei (Monday).
    expect(
      latestExpectedDeliveryDate(
        new Date("2026-10-12T09:00:00Z"),
        17,
      ),
    ).toBe("2026-10-12");
  });

  it("targets the prior workday before today's run window", () => {
    // Monday 16:00 Asia/Taipei -> catch up Friday.
    expect(
      latestExpectedDeliveryDate(
        new Date("2026-10-12T08:00:00Z"),
        17,
      ),
    ).toBe("2026-10-09");

    // Sunday -> latest expected run is Friday.
    expect(
      latestExpectedDeliveryDate(
        new Date("2026-10-11T10:00:00Z"),
        17,
      ),
    ).toBe("2026-10-09");
  });

  it("passes the catch-up target date into daily delivery", async () => {
    const calls: Array<{ userId: string; targetDate?: string }> = [];
    const scheduler = new DailyResearchScheduler(
      {
        async listProfiles() {
          return [{ userId: "u1" }] as any;
        },
      } as any,
      {
        async runForUser(
          userId: string,
          options?: { targetDate?: string },
        ) {
          calls.push({
            userId,
            targetDate: options?.targetDate,
          });
          return {};
        },
      } as any,
      { afterHour: 17 },
    );

    await scheduler.tick(
      new Date("2026-10-11T10:00:00Z"),
    );

    expect(calls).toEqual([
      {
        userId: "u1",
        targetDate: "2026-10-09",
      },
    ]);
  });
});
