import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

export interface ApiOptions {
  corsOrigin?: string;
  maxBodyBytes?: number;
  theses?: ThesisApiService;
  batch?: BatchResearchApiService;
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
    "access-control-allow-methods": "GET,POST,OPTIONS",
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
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new Error("REQUEST_BODY_TOO_LARGE");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function parseCandidatePayload(
  value: unknown,
): { candidate: CandidatePacket; thesisId?: string; eventType?: ThesisEvent["eventType"] } {
  if (typeof value !== "object" || value === null) {
    throw new Error("INVALID_CANDIDATE_PACKET");
  }

  const record = value as Record<string, unknown>;
  const candidateInput =
    "candidate" in record ? record.candidate : value;
  const parsed = CandidatePacketSchema.safeParse(candidateInput);

  if (!parsed.success) {
    const error = new Error("INVALID_CANDIDATE_PACKET") as Error & {
      issues?: unknown;
    };
    error.issues = parsed.error.issues;
    throw error;
  }

  return {
    candidate: parsed.data,
    thesisId:
      typeof record.thesisId === "string" ? record.thesisId : undefined,
    eventType:
      typeof record.eventType === "string"
        ? (record.eventType as ThesisEvent["eventType"])
        : undefined,
  };
}

export function createResearchApi(
  service: ResearchApiService,
  options: ApiOptions = {},
) {
  const corsOrigin = options.corsOrigin ?? "http://localhost:5173";
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const theses = options.theses;
  const batch = options.batch;

  return createServer(async (request, response) => {
    if (!request.url || !request.method) {
      return json(response, 400, { error: "INVALID_REQUEST" }, corsOrigin);
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": corsOrigin,
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      });
      return response.end();
    }

    const url = new URL(request.url, "http://localhost");

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json(
          response,
          200,
          {
            ok: true,
            service: "trading-radar-b",
            thesisTracking: Boolean(theses),
            batchResearch: Boolean(batch),
          },
          corsOrigin,
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/research/screening-output"
      ) {
        if (!batch) {
          return json(response, 501, { error: "BATCH_API_DISABLED" }, corsOrigin);
        }

        const body = await readJsonBody(request, maxBodyBytes);
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
        };
        const screeningInput =
          "screeningOutput" in record ? record.screeningOutput : body;
        const parsed = ScreeningOutputV1Schema.safeParse(screeningInput);

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
          candidates = screeningOutputToCandidatePackets(parsed.data);
        } catch (error) {
          return json(
            response,
            400,
            {
              error: "SCREENING_ADAPTER_ERROR",
              message:
                error instanceof Error ? error.message : "Unknown adapter error",
            },
            corsOrigin,
          );
        }

        const result = await batch.run(candidates, record.options);

        return json(
          response,
          200,
          {
            screeningRunId: parsed.data.run.runId,
            dataVersion: parsed.data.run.dataVersion,
            sourceSnapshot: parsed.data.run.sourceSnapshot,
            ...result,
          },
          corsOrigin,
        );
      }

      if (request.method === "POST" && url.pathname === "/api/research/batch") {
        if (!batch) {
          return json(response, 501, { error: "BATCH_API_DISABLED" }, corsOrigin);
        }

        const body = await readJsonBody(request, maxBodyBytes);
        if (
          typeof body !== "object" ||
          body === null ||
          !Array.isArray((body as { candidates?: unknown }).candidates)
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

        const result = await batch.run(candidates, record.options);
        return json(response, 200, result, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/api/research/runs") {
        const body = await readJsonBody(request, maxBodyBytes);
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

        const result = await service.run(parsed.data);
        return json(response, 200, result, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/api/theses") {
        if (!theses) {
          return json(response, 501, { error: "THESIS_API_DISABLED" }, corsOrigin);
        }

        const body = await readJsonBody(request, maxBodyBytes);
        const parsed = parseCandidatePayload(body);
        const result = await theses.create(parsed.candidate, parsed.thesisId);
        return json(response, 200, result, corsOrigin);
      }

      const recheckMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)\/recheck$/,
      );
      if (request.method === "POST" && recheckMatch) {
        if (!theses) {
          return json(response, 501, { error: "THESIS_API_DISABLED" }, corsOrigin);
        }

        const body = await readJsonBody(request, maxBodyBytes);
        const parsed = parseCandidatePayload(body);
        const thesisId = decodeURIComponent(recheckMatch[1] ?? "");
        const result = await theses.recheck(
          thesisId,
          parsed.candidate,
          parsed.eventType,
        );
        return json(response, 200, result, corsOrigin);
      }

      const thesisMatch = url.pathname.match(/^\/api\/theses\/([^/]+)$/);
      if (request.method === "GET" && thesisMatch) {
        if (!theses) {
          return json(response, 501, { error: "THESIS_API_DISABLED" }, corsOrigin);
        }

        const thesisId = decodeURIComponent(thesisMatch[1] ?? "");
        const thesis = await theses.getLatest(thesisId);

        if (!thesis) {
          return json(response, 404, { error: "THESIS_NOT_FOUND" }, corsOrigin);
        }

        return json(response, 200, thesis, corsOrigin);
      }

      const versionsMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)\/versions$/,
      );
      if (request.method === "GET" && versionsMatch) {
        if (!theses) {
          return json(response, 501, { error: "THESIS_API_DISABLED" }, corsOrigin);
        }

        const thesisId = decodeURIComponent(versionsMatch[1] ?? "");
        return json(
          response,
          200,
          { thesisId, versions: await theses.listVersions(thesisId) },
          corsOrigin,
        );
      }

      const eventsMatch = url.pathname.match(
        /^\/api\/theses\/([^/]+)\/events$/,
      );
      if (request.method === "GET" && eventsMatch) {
        if (!theses) {
          return json(response, 501, { error: "THESIS_API_DISABLED" }, corsOrigin);
        }

        const thesisId = decodeURIComponent(eventsMatch[1] ?? "");
        return json(
          response,
          200,
          { thesisId, events: await theses.listEvents(thesisId) },
          corsOrigin,
        );
      }

      const runMatch = url.pathname.match(/^\/api\/research\/runs\/([^/]+)$/);
      if (request.method === "GET" && runMatch) {
        const runId = decodeURIComponent(runMatch[1] ?? "");
        const run = await service.get(runId);

        if (!run) {
          return json(response, 404, { error: "RUN_NOT_FOUND" }, corsOrigin);
        }

        return json(response, 200, run, corsOrigin);
      }

      const tickerMatch = url.pathname.match(
        /^\/api\/research\/tickers\/([^/]+)\/runs$/,
      );
      if (request.method === "GET" && tickerMatch) {
        const ticker = decodeURIComponent(tickerMatch[1] ?? "");
        const limit = Number(url.searchParams.get("limit") ?? "20");
        const runs = await service.listByTicker(
          ticker,
          Number.isFinite(limit) ? limit : 20,
        );

        return json(response, 200, { ticker, runs }, corsOrigin);
      }

      return json(response, 404, { error: "NOT_FOUND" }, corsOrigin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      const status =
        message === "REQUEST_BODY_TOO_LARGE"
          ? 413
          : message === "INVALID_JSON" ||
              message === "INVALID_CANDIDATE_PACKET"
            ? 400
            : 500;

      return json(
        response,
        status,
        {
          error: status === 500 ? "INTERNAL_ERROR" : message,
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
