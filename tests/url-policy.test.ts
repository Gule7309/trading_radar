import { describe, expect, it } from "vitest";
import { validateExternalHttpUrl } from "../src/security/url-policy.js";

describe("validateExternalHttpUrl", () => {
  it("allows ordinary public HTTPS URLs", () => {
    const result = validateExternalHttpUrl(
      "https://example.com/news?id=1#section",
    );

    expect(result.allowed).toBe(true);
    expect(result.normalizedUrl).toBe("https://example.com/news?id=1");
  });

  it.each([
    "http://localhost:3000/private",
    "http://127.0.0.1/admin",
    "http://10.0.0.1/internal",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "http://service.internal/path",
  ])("blocks unsafe target %s", (url) => {
    expect(validateExternalHttpUrl(url).allowed).toBe(false);
  });
});
