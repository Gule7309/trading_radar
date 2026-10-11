import { describe, expect, it } from "vitest";
import { DailyResearchScheduler } from "../src/delivery/scheduler.js";

describe("DailyResearchScheduler", () => {
  it("runs after the configured Taipei hour on a workday", async () => {
    const calls: string[] = [];
    const scheduler = new DailyResearchScheduler(
      {
        async listProfiles() {
          return [{ userId: "u1" }] as any;
        },
      } as any,
      {
        async runForUser(userId: string) {
          calls.push(userId);
          return {};
        },
      } as any,
      { afterHour: 17 },
    );

    // 2026-10-12 17:00 Asia/Taipei (Monday).
    await scheduler.tick(
      new Date("2026-10-12T09:00:00Z"),
    );

    expect(calls).toEqual(["u1"]);
  });

  it("does not run before the configured hour or on weekends", async () => {
    const calls: string[] = [];
    const scheduler = new DailyResearchScheduler(
      {
        async listProfiles() {
          return [{ userId: "u1" }] as any;
        },
      } as any,
      {
        async runForUser(userId: string) {
          calls.push(userId);
          return {};
        },
      } as any,
      { afterHour: 17 },
    );

    await scheduler.tick(
      new Date("2026-10-12T08:00:00Z"),
    );
    await scheduler.tick(
      new Date("2026-10-11T10:00:00Z"),
    );

    expect(calls).toEqual([]);
  });
});
