import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { CandidatePacketSchema } from "../domain/candidate.js";
import type { CandidatePacket } from "../domain/candidate.js";
import type { ResearchResult } from "../domain/research.js";
import type { StoredResearchRun } from "../research/store.js";

export interface ResearchApiService {
  run(candidate: CandidatePacket): Promise<ResearchResult>;
  get(runId: string): Promise<StoredResearchRun | null>;
  listByTicker(
    ticker: string,
    limit?: number,
  ): Promise<StoredResearchRun[]>;
}

export interface ApiOptions {
  corsOrigin?: string;
  maxBodyBytes?: number;
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

export function createResearchApi(
  service: ResearchApiService,
  options: ApiOptions = {},
) {
  const corsOrigin = options.corsOrigin ?? "http://localhost:5173";
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;

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
          { ok: true, service: "trading-radar-b" },
          corsOrigin,
        );
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
          : message === "INVALID_JSON"
            ? 400
            : 500;

      return json(
        response,
        status,
        {
          error: status === 500 ? "INTERNAL_ERROR" : message,
          message: status === 500 ? undefined : message,
        },
        corsOrigin,
      );
    }
  });
}
