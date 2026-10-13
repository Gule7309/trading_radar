import { expect, test } from "vitest";
import { z } from "zod";
import { request } from "./api";
import * as C from "./contracts";
import { sample } from "./data";

test("mock API: five results → feedback ranking → thesis changes → notices → daily branches", async () => {
  const status = await request("/api/admin/status", C.AdminSchema);
  if (status.llmProvider !== "mock")
    throw new Error(
      "Integration suite requires mock backend; refusing to mutate live data.",
    );
  const userId = `frontend-test-${crypto.randomUUID()}`;
  const path = `/api/users/${userId}`;
  const profile = await request(`${path}/profile`, C.ProfileSchema);
  const research = (screeningOutput: C.ScreeningOutput) =>
    request("/api/research/screening-output", C.BatchSchema, {
      userId,
      screeningOutput,
      options: { topK: 5, researchLimit: 10, concurrency: 2 },
    });
  const first = await research(sample);
  expect(first.top).toHaveLength(5);
  expect(first.researched).toBe(8);
  const firstRun = first.top[0].result;
  const saved = await request(
    `${path}/feedback`,
    z.object({
      feedback: C.FeedbackSchema,
      preferenceChange: C.ChangeSchema,
      profile: C.ProfileSchema,
      watchlistItem: C.WatchSchema,
    }),
    { runId: firstRun.runId, action: "SAVE", reasons: ["FINANCIAL_STABILITY"] },
  );
  expect(saved.profile.hardConstraints).toEqual(profile.hardConstraints);
  expect(saved.preferenceChange.after).not.toEqual(
    saved.preferenceChange.before,
  );
  const watchlist = await request(
    `${path}/watchlist`,
    z.object({ items: z.array(C.WatchSchema) }),
  );
  expect(watchlist.items).toHaveLength(1);
  expect(watchlist.items[0].sourceResearchRunId).toBe(firstRun.runId);
  let next = await research(sample);
  let feedbackCount = 1;
  while (
    next.top.map((t) => t.ticker).join(",") ===
      first.top.map((t) => t.ticker).join(",") &&
    feedbackCount < 8
  ) {
    await request(`${path}/feedback`, z.object({ profile: C.ProfileSchema }), {
      runId: next.top[0].result.runId,
      action: "SKIP",
      reasons: ["HIGH_VOLATILITY", "FINANCIAL_QUALITY"],
    });
    feedbackCount++;
    next = await research(sample);
  }
  expect(next.top.map((t) => t.ticker)).not.toEqual(
    first.top.map((t) => t.ticker),
  );
  console.log(
    JSON.stringify({
      demo: "actual-backend-ranking",
      before: first.top.map((t) => t.ticker),
      after: next.top.map((t) => t.ticker),
      feedbackCount,
    }),
  );
  expect(
    (await request(`${path}/profile`, C.ProfileSchema)).hardConstraints,
  ).toEqual(profile.hardConstraints);
  const sparse = structuredClone(sample);
  sparse.candidates = sparse.candidates.slice(0, 2);
  expect((await research(sparse)).top).toHaveLength(2);
  const empty = structuredClone(sample);
  empty.candidates = [];
  expect((await research(empty)).top).toHaveLength(0);
  const item = watchlist.items[0];
  for (const [scenario, expected] of [
    ["weakened", "WEAKENED"],
    ["invalidated", "INVALIDATED"],
    ["conflict", "WEAKENED"],
  ]) {
    const candidate = {
      ...item.candidate,
      dataSources: [
        { source: `mock-scenario:${scenario}`, asOf: item.candidate.asOf },
      ],
    };
    const response = await request(
      `${path}/watchlist/${item.ticker}/recheck`,
      z.object({
        researchRunId: z.string(),
        thesis: C.ThesisSchema,
        watchlistItem: C.WatchSchema,
      }),
      { candidate, eventType: "MANUAL_RECHECK" },
    );
    expect(response.thesis.status).toBe(expected);
    const stored = await request(
      `/api/research/runs/${response.researchRunId}`,
      C.StoredRunSchema,
    );
    expect(stored.result.status).toBe("REJECTED");
    if (scenario === "conflict")
      expect(stored.result.claims[0].status).toBe("CONFLICTING");
  }
  expect(
    (
      await request(
        `/api/theses/${item.thesisId}/versions`,
        z.object({ versions: z.array(C.ThesisSchema) }),
      )
    ).versions,
  ).toHaveLength(4);
  const notices = await request(
    `${path}/notifications`,
    z.object({ notifications: z.array(C.NotificationSchema) }),
  );
  expect(
    notices.notifications.some((n) => n.type === "EVIDENCE_CONFLICT"),
  ).toBe(true);
  expect(notices.notifications.some((n) => n.type === "THESIS_CHANGED")).toBe(
    true,
  );
  const read = await request(
    `${path}/notifications/${notices.notifications[0].notificationId}/read`,
    C.NotificationSchema,
    {},
  );
  expect(read.readAt).toBeDefined();
  const dailySchema = z.object({
    reused: z.boolean(),
    waitingForFreshData: z.boolean().optional(),
    result: C.BatchCoreSchema.optional(),
    deliveryRun: C.DeliverySchema,
  });
  const waiting = await request(`${path}/daily-research`, dailySchema, {});
  expect(waiting.waitingForFreshData).toBe(true);
  expect(waiting.result).toBeUndefined();
  const forced = await request(`${path}/daily-research`, dailySchema, {
    force: true,
  });
  expect(forced.deliveryRun.status).toBe("SUCCESS");
  expect(forced.result).toBeDefined();
  const reused = await request(`${path}/daily-research`, dailySchema, {});
  expect(reused.reused).toBe(true);
  expect(reused.result).toBeUndefined();
  const reset = await request(
    `${path}/profile/reset-soft`,
    C.ProfileSchema,
    {},
  );
  expect(reset.hardConstraints).toEqual(profile.hardConstraints);
  await request(
    `${path}/watchlist/${item.ticker}`,
    z.object({ removed: z.boolean() }),
    undefined,
    "DELETE",
  );
  expect(
    (
      await request(
        `${path}/feedback`,
        z.object({ feedback: z.array(C.FeedbackSchema) }),
      )
    ).feedback.length,
  ).toBeGreaterThan(0);
  const cors = await fetch("http://127.0.0.1:8787/health", {
    headers: { Origin: "http://localhost:5173" },
  });
  expect(cors.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:5173",
  );
}, 120_000);
