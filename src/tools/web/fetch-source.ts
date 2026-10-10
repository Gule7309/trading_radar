import { createHash } from "node:crypto";
import type { SourceDocument } from "../../domain/research.js";
import { validateExternalHttpUrl } from "../../security/url-policy.js";

export interface FetchSourceOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

export class UnsafeFetchTargetError extends Error {
  constructor(public readonly reason: string) {
    super("Fetch target rejected by URL policy: " + reason);
    this.name = "UnsafeFetchTargetError";
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectInstructionLikeText(text: string): boolean {
  const normalized = text.toLowerCase();

  return [
    "ignore previous instructions",
    "ignore all previous instructions",
    "system prompt",
    "developer message",
    "reveal your prompt",
    "do not follow your instructions",
    "you are chatgpt",
    "assistant must",
    "tool call",
  ].some((pattern) => normalized.includes(pattern));
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToPlainText(match[1] ?? "") : undefined;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
}

export function extractPublishedAt(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["'][^>]*>/i,
    /<meta[^>]+name=["'](?:date|publish-date|publication_date|datePublished)["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["'](?:date|publish-date|publication_date|datePublished)["'][^>]*>/i,
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const normalized = normalizeDate(match?.[1]);
    if (normalized) return normalized;
  }

  return undefined;
}

export async function fetchExternalSource(
  inputUrl: string,
  options: FetchSourceOptions = {},
): Promise<SourceDocument> {
  const policy = validateExternalHttpUrl(inputUrl);

  if (!policy.allowed || !policy.normalizedUrl) {
    throw new UnsafeFetchTargetError(policy.reason ?? "UNKNOWN");
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 500_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(policy.normalizedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "trading-radar/0.1",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status + " while fetching " + policy.normalizedUrl,
      );
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("Source exceeds " + maxBytes + " byte fetch limit.");
    }

    const raw = await response.text();
    const limited = raw.slice(0, maxBytes);
    const contentType = response.headers.get("content-type") ?? "";
    const text = contentType.includes("html")
      ? htmlToPlainText(limited)
      : limited.replace(/\s+/g, " ").trim();

    if (!text) {
      throw new Error("Fetched source contains no usable text.");
    }

    const finalUrl = response.url || policy.normalizedUrl;
    const finalPolicy = validateExternalHttpUrl(finalUrl);
    if (!finalPolicy.allowed) {
      throw new UnsafeFetchTargetError(
        "REDIRECT_" + (finalPolicy.reason ?? "UNSAFE"),
      );
    }

    const hostname = new URL(finalUrl).hostname;
    const hash = createHash("sha256")
      .update(finalUrl + "\n" + text)
      .digest("hex")
      .slice(0, 20);

    return {
      sourceId: "web-" + hash,
      url: finalUrl,
      title: extractTitle(limited) ?? hostname,
      publisher: hostname,
      sourceType: "OTHER",
      sourceTier: 3,
      publishedAt: contentType.includes("html")
        ? extractPublishedAt(limited)
        : undefined,
      retrievedAt: new Date().toISOString(),
      snippet: text.slice(0, 4_000),
      contentHash: hash,
      metadata: {
        contentType,
        truncated: raw.length > maxBytes,
        instructionLikeTextDetected: detectInstructionLikeText(text),
      },
      untrustedContent: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
