import { z } from "zod";
import * as C from "./contracts";

export const API_BASE = (
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787"
).replace(/\/$/, "");
export const DATA_MODE = import.meta.env.VITE_DATA_MODE || "mock";
export const USER_ID = "demo-user";
export const SCOPE = `${API_BASE}|${DATA_MODE}|${USER_ID}`;
export const userPath = `/api/users/${encodeURIComponent(USER_ID)}`;
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  timeout = 300_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        (typeof raw?.error === "string" ? raw.error : raw?.error?.code) ||
          raw?.code ||
          `HTTP_${response.status}`,
        raw?.error?.message || raw?.message || "伺服器未能完成請求",
        response.status,
      );
    const parsed = schema.safeParse(raw);
    if (!parsed.success)
      throw new ApiError(
        "CONTRACT_MISMATCH",
        `回傳格式與契約不符：${parsed.error.issues
          .map((i) => i.path.join("."))
          .slice(0, 4)
          .join("、")}`,
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        "TIMEOUT",
        "尚未收到結果，後端可能仍在執行。請先同步執行與回饋紀錄，再決定是否重新操作。",
      );
    throw new ApiError(
      "NETWORK",
      "連線中斷，尚無法確認操作結果。請確認後端已啟動及連線設定，先同步紀錄，避免重複提交。",
    );
  } finally {
    clearTimeout(timer);
  }
}
export const api = {
  health: () => request("/health", C.HealthSchema, undefined, "GET", 10_000),
  admin: () => request("/api/admin/status", C.AdminSchema),
  profile: () => request(`${userPath}/profile`, C.ProfileSchema),
  updateProfile: (profile: Partial<C.Profile>) =>
    request(`${userPath}/profile`, C.ProfileSchema, profile, "PUT"),
  resetWeights: () =>
    request(`${userPath}/profile/reset-soft`, C.ProfileSchema, {}),
  screeningProfile: () =>
    request(`${userPath}/screening-profile`, z.record(z.string(), z.unknown())),
  research: (input: C.ScreeningOutput) =>
    request("/api/research/screening-output", C.BatchSchema, {
      userId: USER_ID,
      screeningOutput: input,
      options: { topK: 5, researchLimit: 10, concurrency: 2 },
    }),
  run: (id: string) =>
    request(`/api/research/runs/${encodeURIComponent(id)}`, C.StoredRunSchema),
  history: (ticker: string) =>
    request(
      `/api/research/tickers/${encodeURIComponent(ticker)}/runs?limit=100`,
      z.object({ ticker: z.string(), runs: z.array(C.StoredRunSchema) }),
    ),
  feedback: (data: {
    runId: string;
    action: "SAVE" | "SKIP";
    reasons: string[];
    note?: string;
  }) =>
    request(
      `${userPath}/feedback`,
      z.object({
        feedback: C.FeedbackSchema,
        preferenceChange: C.ChangeSchema,
        profile: C.ProfileSchema,
        watchlistItem: C.WatchSchema.optional(),
      }),
      data,
    ),
  feedbackHistory: () =>
    request(
      `${userPath}/feedback`,
      z.object({ userId: z.string(), feedback: z.array(C.FeedbackSchema) }),
    ),
  changes: () =>
    request(
      `${userPath}/preference-history`,
      z.object({ userId: z.string(), changes: z.array(C.ChangeSchema) }),
    ),
  watchlist: () =>
    request(
      `${userPath}/watchlist`,
      z.object({ userId: z.string(), items: z.array(C.WatchSchema) }),
    ),
  remove: (ticker: string) =>
    request(
      `${userPath}/watchlist/${encodeURIComponent(ticker)}`,
      z.object({ removed: z.boolean() }),
      undefined,
      "DELETE",
    ),
  recheck: (ticker: string, candidate: C.CandidatePacket, eventType: string) =>
    request(
      `${userPath}/watchlist/${encodeURIComponent(ticker)}/recheck`,
      z.object({
        researchRunId: z.string(),
        thesis: C.ThesisSchema,
        watchlistItem: C.WatchSchema,
      }),
      { candidate, eventType },
    ),
  thesis: (id: string) =>
    request(`/api/theses/${encodeURIComponent(id)}`, C.ThesisSchema),
  versions: (id: string) =>
    request(
      `/api/theses/${encodeURIComponent(id)}/versions`,
      z.object({ thesisId: z.string(), versions: z.array(C.ThesisSchema) }),
    ),
  events: (id: string) =>
    request(
      `/api/theses/${encodeURIComponent(id)}/events`,
      z.object({ thesisId: z.string(), events: z.array(C.EventSchema) }),
    ),
  notifications: () =>
    request(
      `${userPath}/notifications`,
      z.object({
        userId: z.string(),
        notifications: z.array(C.NotificationSchema),
      }),
    ),
  readNotice: (id: string) =>
    request(
      `${userPath}/notifications/${encodeURIComponent(id)}/read`,
      C.NotificationSchema,
      {},
    ),
  deliveries: () =>
    request(
      `${userPath}/delivery-runs`,
      z.object({ userId: z.string(), runs: z.array(C.DeliverySchema) }),
    ),
  daily: (force = false) =>
    request(
      `${userPath}/daily-research`,
      z.object({
        reused: z.boolean(),
        waitingForFreshData: z.boolean().optional(),
        deliveryRun: C.DeliverySchema,
        screeningOutput: z.unknown().optional(),
        result: C.BatchCoreSchema.optional(),
        watchlistRechecks: z
          .object({
            rechecked: z.number(),
            failed: z.number(),
            items: z.array(
              z.object({
                ticker: z.string(),
                status: z.string(),
                thesisStatus: z.string().optional(),
                error: z.string().optional(),
              }),
            ),
          })
          .optional(),
        notification: C.NotificationSchema.optional(),
      }),
      { force, topK: 5, researchLimit: 10, concurrency: 2 },
    ),
  modelCheck: () =>
    request(
      "/api/admin/model-check",
      z.object({
        ok: z.boolean(),
        provider: z.string(),
        model: z.string().optional(),
        latencyMs: z.number(),
      }),
      {},
    ),
  dataStatus: () =>
    request("/api/admin/data-status", z.record(z.string(), z.unknown())),
};
