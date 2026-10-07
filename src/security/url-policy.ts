import { isIP } from "node:net";

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

export interface UrlPolicyResult {
  allowed: boolean;
  reason?: string;
  normalizedUrl?: string;
}

export function validateExternalHttpUrl(input: string): UrlPolicyResult {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return { allowed: false, reason: "INVALID_URL" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { allowed: false, reason: "UNSUPPORTED_SCHEME" };
  }

  if (url.username || url.password) {
    return { allowed: false, reason: "EMBEDDED_CREDENTIALS" };
  }

  const hostname = url.hostname.toLowerCase().replace(/\\.$/, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { allowed: false, reason: "LOCAL_HOSTNAME" };
  }

  const ipVersion = isIP(hostname);

  if (
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (ipVersion === 6 && isPrivateIpv6(hostname))
  ) {
    return { allowed: false, reason: "PRIVATE_IP" };
  }

  url.hash = "";

  return {
    allowed: true,
    normalizedUrl: url.toString(),
  };
}
