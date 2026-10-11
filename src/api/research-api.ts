import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";
import { CandidatePacketSchema } from "../domain/candidate.js";
import {
  ScreeningOutputV1Schema,
  screeningOutputToCandidatePackets,
} from "../domain/screening-output.js";
import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";
import type { StoredResearchRun } from "../research/store.js";
import type {
  BatchResearchOptions,
  BatchResearchResult,
} from "../research/batch-service.js";
import type {
  ThesisEvent,
  ThesisVersion,
} from "../thesis/types.js";
import {
  FeedbackInputSchema,
  UserProfileUpdateSchema,
  type FeedbackInput,
  type UserProfile,
  type UserProfileUpdate,
} from "../personalization/types.js";
import { personalizeCandidates } from "../personalization/ranking.js";
import type { WatchlistItem } from "../watchlist/types.js";
import type { NotificationItem } from "../notifications/types.js";
import type { DailyDeliveryRun } from "../delivery/types.js";

export interface ResearchApiService {
  run(candidate: CandidatePacket): Promise<ResearchResult>;
  get(runId: string): Promise<StoredResearchRun | null>;
  listByTicker(
    ticker: string,
    limit?: number,
  ): Promise<StoredResearchRun[]>;
}

export interface BatchResearchApiService {
  run(
    candidates: CandidatePacket[],
    options?: BatchResearchOptions,
  ): Promise<BatchResearchResult>;
}

export interface ThesisApiService {
  create(
    candidate: CandidatePacket,
    thesisId?: string,
  ): Promise<{ researchRunId: string; thesis: ThesisVersion }>;
  recheck(
    thesisId: string,
    candidate: CandidatePacket,
    eventType?: ThesisEvent["eventType"],
  ): Promise<{ researchRunId: string; thesis: ThesisVersion }>;
  getLatest(thesisId: string): Promise<ThesisVersion | null>;
  listVersions(thesisId: string): Promise<ThesisVersion[]>;
  listEvents(thesisId: string): Promise<ThesisEvent[]>;
}

export interface PersonalizationApiService {
  getOrCreateProfile(userId: string): Promise<UserProfile>;
  updateProfile(
    userId: string,
    input: UserProfileUpdate,
  ): Promise<UserProfile>;
  resetSoftPreferences(userId: string): Promise<UserProfile>;
  recordFeedback(
    userId: string,
    input: FeedbackInput,
  ): Promise<{
    feedback: unknown;
    preferenceChange: unknown;
    profile: UserProfile;
    researchRun: StoredResearchRun | null;
  }>;
  listFeedback(userId: string, limit?: number): Promise<unknown[]>;
  listPreferenceChanges(
    userId: string,
    limit?: number,
  ): Promise<unknown[]>;
  getScreeningProfile(userId: string): Promise<Record<string, unknown>>;
}

export interface WatchlistApiService {
  saveFromResearchRun(
    userId: string,
    runId: string,
  ): Promise<WatchlistItem>;
  recheck(
    userId: string,
    ticker: string,
    candidate: CandidatePacket,
    eventType?: ThesisEvent["eventType"],
  ): Promise<unknown>;
  list(userId: string): Promise<WatchlistItem[]>;
  remove(userId: string, ticker: string): Promise<boolean>;
}

export interface NotificationApiService {
  list(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<NotificationItem[]>;
  markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationItem | null>;
}

export interface DeliveryApiService {
  runForUser(
    userId: string,
    options?: {
      force?: boolean;
      screeningLimit?: number;
      topK?: number;
      researchLimit?: number;
      concurrency?: number;
    },
  ): Promise<unknown>;
  listRuns(userId: string, limit?: number): Promise<DailyDeliveryRun[]>;
}

export interface ApiOptions {
  corsOrigin?: string;
  maxBodyBytes?: number;
  theses?: ThesisApiService;
  batch?: BatchResearchApiService;
  personalization?: PersonalizationApiService;
  watchlist?: WatchlistApiService;
  notifications?: NotificationApiService;
  delivery?: DeliveryApiService;
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  corsOrigin: string,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new Error("REQUEST_BODY_TOO_LARGE");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(
      Buffer.concat(chunks).toString("utf8"),
    ) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function parseCandidatePayload(
  value: unknown,
): {
  candidate: CandidatePacket;
  thesisId?: string;
  eventType?: ThesisEvent["eventType"];
} {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_CANDIDATE_PACKET");
  }

  const record = value as Record<string, unknown>;
  const candidateInput =
    "candidate" in record ? record.candidate : value;
  const parsed = CandidatePacketSchema.safeParse(candidateInput);

  if (!parsed.success) {
    const error = new Error(
      "INVALID_CANDIDATE_PACKET",
    ) as Error & { issues?: unknown };
    error.issues = parsed.error.issues;
    throw error;
  }

  return {
    candidate: parsed.data,
    thesisId:
      typeof record.thesisId === "string"
        ? record.thesisId
        : undefined,
    eventType:
      typeof record.eventType === "string"
        ? (record.eventType as ThesisEvent["eventType"])
        : undefined,
  };
}

function numberParam(
  value: string | null,
  fallback: number,
): number {
  const parsed = Number(value ?? String(fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function errorStatus(message: string): number {
  if (message === "REQUEST_BODY_TOO_LARGE") return 413;

  if (
    message === "RESEARCH_RUN_NOT_FOUND" ||
    message === "RUN_NOT_FOUND" ||
    message === "THESIS_NOT_FOUND" ||
    message === "WATCHLIST_ITEM_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    message === "INVALID_JSON" ||
    message === "INVALID_CANDIDATE_PACKET" ||
    message === "INVALID_SCREENING_OUTPUT" ||
    message === "SCREENING_ADAPTER_ERROR" ||
    message === "WATCHLIST_REQUIRES_PUBLISHABLE_RESEARCH" ||
    message === "WATCHLIST_TICKER_MISMATCH"
  ) {
    return 400;
  }

  return 500;
}

export function createResearchApi(
  service: ResearchApiService,
  options: ApiOptions = {},
) {
  const corsOrigin =
    options.corsOrigin ?? "http://localhost:5173";
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const theses = options.theses;
  const batch = options.batch;
  const personalization = options.personalization;
  const watchlist = options.watchlist;
  const notifications = options.notifications;
  const delivery = options.delivery;

  return createServer(async (request, response) => {
    if (!request.url || !request.method) {
      return json(
        response,
        400,
        { error: "INVALID_REQUEST" },
        corsOrigin,
      );
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": corsOrigin,
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods":
          "GET,POST,PUT,DELETE,OPTIONS",
      });
      return response.end();
    }

    const url = new URL(request.url, "http://localhost");

    try {
      if (
        request.method === "GET" &&
        url.pathname === "/health"
      ) {
        return json(
          response,
          200,
          {
            ok: true,
            service: "trading-radar-b",
            thesisTracking: Boolean(theses),
            batchResearch: Boolean(batch),
            personalization: Boolean(personalization),
            watchlist: Boolean(watchlist),
            notifications: Boolean(notifications),
            proactiveDelivery: Boolean(delivery),
          },
          corsOrigin,
        );
      }

      const profileMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/profile$/,
      );
      if (profileMatch) {
        if (!personalization) {
          return json(
            response,
            501,
            { error: "PERSONALIZATION_API_DISABLED" },
            corsOrigin,
          );
        }
        const userId = decodeURIComponent(profileMatch[1] ?? "");

        if (request.method === "GET") {
          return json(
            response,
            200,
            await personalization.getOrCreateProfile(userId),
            corsOrigin,
          );
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(
            request,
            maxBodyBytes,
          );
          const parsed = UserProfileUpdateSchema.safeParse(body);
          if (!parsed.success) {
            return json(
              response,
              400,
              {
                error: "INVALID_USER_PROFILE",
                issues: parsed.error.issues,
              },
              corsOrigin,
            );
          }

          return json(
            response,
            200,
            await personalization.updateProfile(
              userId,
              parsed.data,
            ),
            corsOrigin,
          );
        }
      }

      const resetProfileMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/profile\/reset-soft$/,
      );
      if (
        request.method === "POST" &&
        resetProfileMatch
      ) {
        if (!personalization) {
          return json(
            response,
            501,
            { error: "PERSONALIZATION_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          resetProfileMatch[1] ?? "",
        );
        return json(
          response,
          200,
          await personalization.resetSoftPreferences(userId),
          corsOrigin,
        );
      }

      const screeningProfileMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/screening-profile$/,
      );
      if (
        request.method === "GET" &&
        screeningProfileMatch
      ) {
        if (!personalization) {
          return json(
            response,
            501,
            { error: "PERSONALIZATION_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          screeningProfileMatch[1] ?? "",
        );
        return json(
          response,
          200,
          await personalization.getScreeningProfile(userId),
          corsOrigin,
        );
      }

      const feedbackMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/feedback$/,
      );
      if (feedbackMatch) {
        if (!personalization) {
          return json(
            response,
            501,
            { error: "PERSONALIZATION_API_DISABLED" },
            corsOrigin,
          );
        }
        const userId = decodeURIComponent(
          feedbackMatch[1] ?? "",
        );

        if (request.method === "GET") {
          return json(
            response,
            200,
            {
              userId,
              feedback: await personalization.listFeedback(
                userId,
                numberParam(url.searchParams.get("limit"), 100),
              ),
            },
            corsOrigin,
          );
        }

        if (request.method === "POST") {
          const body = await readJsonBody(
            request,
            maxBodyBytes,
          );
          const parsed = FeedbackInputSchema.safeParse(body);
          if (!parsed.success) {
            return json(
              response,
              400,
              {
                error: "INVALID_FEEDBACK",
                issues: parsed.error.issues,
              },
              corsOrigin,
            );
          }

          const recorded =
            await personalization.recordFeedback(
              userId,
              parsed.data,
            );
          const watchlistItem =
            parsed.data.action === "SAVE" && watchlist
              ? await watchlist.saveFromResearchRun(
                  userId,
                  parsed.data.runId,
                )
              : undefined;

          return json(
            response,
            200,
            {
              feedback: recorded.feedback,
              preferenceChange:
                recorded.preferenceChange,
              profile: recorded.profile,
              watchlistItem,
            },
            corsOrigin,
          );
        }
      }

      const preferenceHistoryMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/preference-history$/,
      );
      if (
        request.method === "GET" &&
        preferenceHistoryMatch
      ) {
        if (!personalization) {
          return json(
            response,
            501,
            { error: "PERSONALIZATION_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          preferenceHistoryMatch[1] ?? "",
        );
        return json(
          response,
          200,
          {
            userId,
            changes:
              await personalization.listPreferenceChanges(
                userId,
                numberParam(url.searchParams.get("limit"), 100),
              ),
          },
          corsOrigin,
        );
      }

      const watchlistMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/watchlist$/,
      );
      if (
        request.method === "GET" &&
        watchlistMatch
      ) {
        if (!watchlist) {
          return json(
            response,
            501,
            { error: "WATCHLIST_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          watchlistMatch[1] ?? "",
        );
        return json(
          response,
          200,
          {
            userId,
            items: await watchlist.list(userId),
          },
          corsOrigin,
        );
      }

      const watchlistItemMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/watchlist\/([^/]+)$/,
      );
      if (
        request.method === "DELETE" &&
        watchlistItemMatch
      ) {
        if (!watchlist) {
          return json(
            response,
            501,
            { error: "WATCHLIST_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          watchlistItemMatch[1] ?? "",
        );
        const ticker = decodeURIComponent(
          watchlistItemMatch[2] ?? "",
        );

        return json(
          response,
          200,
          {
            removed: await watchlist.remove(
              userId,
              ticker,
            ),
          },
          corsOrigin,
        );
      }

      const recheckWatchlistMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/watchlist\/([^/]+)\/recheck$/,
      );
      if (
        request.method === "POST" &&
        recheckWatchlistMatch
      ) {
        if (!watchlist) {
          return json(
            response,
            501,
            { error: "WATCHLIST_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          recheckWatchlistMatch[1] ?? "",
        );
        const ticker = decodeURIComponent(
          recheckWatchlistMatch[2] ?? "",
        );
        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        const parsed = parseCandidatePayload(body);

        return json(
          response,
          200,
          await watchlist.recheck(
            userId,
            ticker,
            parsed.candidate,
            parsed.eventType,
          ),
          corsOrigin,
        );
      }

      const notificationMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/notifications$/,
      );
      if (
        request.method === "GET" &&
        notificationMatch
      ) {
        if (!notifications) {
          return json(
            response,
            501,
            { error: "NOTIFICATION_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          notificationMatch[1] ?? "",
        );
        const unreadOnly =
          url.searchParams.get("unread") === "1" ||
          url.searchParams.get("unread") === "true";

        return json(
          response,
          200,
          {
            userId,
            notifications: await notifications.list(
              userId,
              {
                unreadOnly,
                limit: numberParam(
                  url.searchParams.get("limit"),
                  100,
                ),
              },
            ),
          },
          corsOrigin,
        );
      }

      const markNotificationReadMatch =
        url.pathname.match(
          /^\/api\/users\/([^/]+)\/notifications\/([^/]+)\/read$/,
        );
      if (
        request.method === "POST" &&
        markNotificationReadMatch
      ) {
        if (!notifications) {
          return json(
            response,
            501,
            { error: "NOTIFICATION_API_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          markNotificationReadMatch[1] ?? "",
        );
        const notificationId = decodeURIComponent(
          markNotificationReadMatch[2] ?? "",
        );
        const item = await notifications.markRead(
          userId,
          notificationId,
        );

        if (!item) {
          return json(
            response,
            404,
            { error: "NOTIFICATION_NOT_FOUND" },
            corsOrigin,
          );
        }

        return json(response, 200, item, corsOrigin);
      }

      const dailyResearchMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/daily-research$/,
      );
      if (
        request.method === "POST" &&
        dailyResearchMatch
      ) {
        if (!delivery) {
          return json(
            response,
            501,
            { error: "PROACTIVE_DELIVERY_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          dailyResearchMatch[1] ?? "",
        );
        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        const record =
          typeof body === "object" && body !== null
            ? (body as Record<string, unknown>)
            : {};

        return json(
          response,
          200,
          await delivery.runForUser(userId, {
            force: record.force === true,
            screeningLimit:
              typeof record.screeningLimit === "number"
                ? record.screeningLimit
                : undefined,
            topK:
              typeof record.topK === "number"
                ? record.topK
                : undefined,
            researchLimit:
              typeof record.researchLimit === "number"
                ? record.researchLimit
                : undefined,
            concurrency:
              typeof record.concurrency === "number"
                ? record.concurrency
                : undefined,
          }),
          corsOrigin,
        );
      }

      const deliveryRunsMatch = url.pathname.match(
        /^\/api\/users\/([^/]+)\/delivery-runs$/,
      );
      if (
        request.method === "GET" &&
        deliveryRunsMatch
      ) {
        if (!delivery) {
          return json(
            response,
            501,
            { error: "PROACTIVE_DELIVERY_DISABLED" },
            corsOrigin,
          );
        }

        const userId = decodeURIComponent(
          deliveryRunsMatch[1] ?? "",
        );
        return json(
          response,
          200,
          {
            userId,
            runs: await delivery.listRuns(
              userId,
              numberParam(url.searchParams.get("limit"), 100),
            ),
          },
          corsOrigin,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname ===
          "/api/research/screening-output"
      ) {
        if (!batch) {
          return json(
            response,
            501,
            { error: "BATCH_API_DISABLED" },
            corsOrigin,
          );
        }

        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        if (typeof body !== "object" || body === null) {
          return json(
            response,
            400,
            { error: "INVALID_SCREENING_OUTPUT" },
            corsOrigin,
          );
        }

        const record = body as {
          screeningOutput?: unknown;
          options?: BatchResearchOptions;
          userId?: string;
        };
        const screeningInput =
          "screeningOutput" in record
            ? record.screeningOutput
            : body;
        const parsed =
          ScreeningOutputV1Schema.safeParse(screeningInput);

        if (!parsed.success) {
          return json(
            response,
            400,
            {
              error: "INVALID_SCREENING_OUTPUT",
              issues: parsed.error.issues,
            },
            corsOrigin,
          );
        }

        let candidates: CandidatePacket[];
        try {
          candidates =
            screeningOutputToCandidatePackets(parsed.data);
        } catch (error) {
          return json(
            response,
            400,
            {
              error: "SCREENING_ADAPTER_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown adapter error",
            },
            corsOrigin,
          );
        }

        let appliedProfile: UserProfile | undefined;
        if (
          record.userId &&
          personalization
        ) {
          appliedProfile =
            await personalization.getOrCreateProfile(
              record.userId,
            );
          candidates = personalizeCandidates(
            candidates,
            appliedProfile,
          );
        }

        const result = await batch.run(
          candidates,
          record.options,
        );

        return json(
          response,
          200,
          {
            screeningRunId: parsed.data.run.runId,
            dataVersion: parsed.data.run.dataVersion,
            sourceSnapshot: parsed.data.run.sourceSnapshot,
            personalization: appliedProfile
              ? {
                  userId: appliedProfile.userId,
                  softPreferences:
                    appliedProfile.softPreferences,
                }
              : undefined,
            ...result,
          },
          corsOrigin,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/research/batch"
      ) {
        if (!batch) {
          return json(
            response,
            501,
            { error: "BATCH_API_DISABLED" },
            corsOrigin,
          );
        }

        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        if (
          typeof body !== "object" ||
          body === null ||
          !Array.isArray(
            (body as { candidates?: unknown }).candidates,
          )
        ) {
          return json(
            response,
            400,
            { error: "INVALID_BATCH_REQUEST" },
            corsOrigin,
          );
        }

        const record = body as {
          candidates: unknown[];
          options?: BatchResearchOptions;
        };
        const candidates: CandidatePacket[] = [];

        for (const item of record.candidates) {
          const parsed = CandidatePacketSchema.safeParse(item);
          if (!parsed.success) {
            return json(
              response,
              400,
              {
                error: "INVALID_CANDIDATE_PACKET",
                issues: parsed.error.issues,
              },
              corsOrigin,
            );
          }
          candidates.push(parsed.data);
        }

        return json(
          response,
          200,
          await batch.run(
            candidates,
            record.options,
          ),
          corsOrigin,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/research/runs"
      ) {
        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        const parsed = CandidatePacketSchema.safeParse(body);

        if (!parsed.success) {
          return json(
            response,
            400,
            {
              error: "INVALID_CANDIDATE_PACKET",
              issues: parsed.error.issues,
            },
            corsOrigin,
          );
        }

        return json(
          response,
          200,
          await service.run(parsed.data),
          corsOrigin,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/theses"
      ) {
        if (!theses) {
          return json(
            response,
            501,
            { error: "THESIS_API_DISABLED" },
            corsOrigin,
          );
        }

        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        const parsed = parseCandidatePayload(body);
        return json(
          response,
          200,
          await theses.create(
            parsed.candidate,
            parsed.thesisId,
          ),
          corsOrigin,
        );
      }

      const recheckMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)\/recheck$/,
      );
      if (
        request.method === "POST" &&
        recheckMatch
      ) {
        if (!theses) {
          return json(
            response,
            501,
            { error: "THESIS_API_DISABLED" },
            corsOrigin,
          );
        }

        const body = await readJsonBody(
          request,
          maxBodyBytes,
        );
        const parsed = parseCandidatePayload(body);
        const thesisId = decodeURIComponent(
          recheckMatch[1] ?? "",
        );

        return json(
          response,
          200,
          await theses.recheck(
            thesisId,
            parsed.candidate,
            parsed.eventType,
          ),
          corsOrigin,
        );
      }

      const thesisMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)$/,
      );
      if (
        request.method === "GET" &&
        thesisMatch
      ) {
        if (!theses) {
          return json(
            response,
            501,
            { error: "THESIS_API_DISABLED" },
            corsOrigin,
          );
        }

        const thesisId = decodeURIComponent(
          thesisMatch[1] ?? "",
        );
        const thesis = await theses.getLatest(thesisId);

        if (!thesis) {
          return json(
            response,
            404,
            { error: "THESIS_NOT_FOUND" },
            corsOrigin,
          );
        }

        return json(response, 200, thesis, corsOrigin);
      }

      const versionsMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)\/versions$/,
      );
      if (
        request.method === "GET" &&
        versionsMatch
      ) {
        if (!theses) {
          return json(
            response,
            501,
            { error: "THESIS_API_DISABLED" },
            corsOrigin,
          );
        }

        const thesisId = decodeURIComponent(
          versionsMatch[1] ?? "",
        );
        return json(
          response,
          200,
          {
            thesisId,
            versions: await theses.listVersions(
              thesisId,
            ),
          },
          corsOrigin,
        );
      }

      const eventsMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)\/events$/,
      );
      if (
        request.method === "GET" &&
        eventsMatch
      ) {
        if (!theses) {
          return json(
            response,
            501,
            { error: "THESIS_API_DISABLED" },
            corsOrigin,
          );
        }

        const thesisId = decodeURIComponent(
          eventsMatch[1] ?? "",
        );
        return json(
          response,
          200,
          {
            thesisId,
            events: await theses.listEvents(thesisId),
          },
          corsOrigin,
        );
      }

      const runMatch = url.pathname.match(
        /^\/api\/research\/runs\/([^/]+)$/,
      );
      if (
        request.method === "GET" &&
        runMatch
      ) {
        const runId = decodeURIComponent(
          runMatch[1] ?? "",
        );
        const run = await service.get(runId);

        if (!run) {
          return json(
            response,
            404,
            { error: "RUN_NOT_FOUND" },
            corsOrigin,
          );
        }

        return json(response, 200, run, corsOrigin);
      }

      const tickerMatch = url.pathname.match(
        /^\/api\/research\/tickers\/([^/]+)\/runs$/,
      );
      if (
        request.method === "GET" &&
        tickerMatch
      ) {
        const ticker = decodeURIComponent(
          tickerMatch[1] ?? "",
        );
        const runs = await service.listByTicker(
          ticker,
          numberParam(url.searchParams.get("limit"), 20),
        );

        return json(
          response,
          200,
          { ticker, runs },
          corsOrigin,
        );
      }

      return json(
        response,
        404,
        { error: "NOT_FOUND" },
        corsOrigin,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "UNKNOWN_ERROR";
      const status = errorStatus(message);

      return json(
        response,
        status,
        {
          error:
            status === 500 ? "INTERNAL_ERROR" : message,
          message:
            status === 500 ? undefined : message,
          issues:
            error &&
            typeof error === "object" &&
            "issues" in error
              ? (error as { issues?: unknown }).issues
              : undefined,
        },
        corsOrigin,
      );
    }
  });
}
