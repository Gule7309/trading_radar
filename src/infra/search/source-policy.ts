import type { SearchResult } from "./provider.js";

const LOW_SIGNAL_HOSTS = new Set([
  "facebook.com",
  "m.facebook.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "x.com",
  "twitter.com",
  "threads.net",
]);

function normalizeHost(value: string | undefined): string {
  if (!value) return "";

  const lowered = value.toLowerCase().replace(/^www\./, "");

  try {
    return new URL(lowered.includes("://") ? lowered : `https://${lowered}`)
      .hostname.toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return lowered;
  }
}

export function isLowSignalDiscoveryResult(result: SearchResult): boolean {
  const candidates = [
    normalizeHost(result.publisher),
    normalizeHost(result.title),
    normalizeHost(result.url),
  ];

  return candidates.some((host) => LOW_SIGNAL_HOSTS.has(host));
}

export function prioritizeDiscoveryResults(
  results: SearchResult[],
  maxResults: number,
): SearchResult[] {
  const highSignal = results.filter(
    (result) => !isLowSignalDiscoveryResult(result),
  );

  const selected =
    highSignal.length > 0
      ? highSignal
      : results;

  return selected.slice(0, maxResults);
}
