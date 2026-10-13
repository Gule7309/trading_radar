import { describe, expect, it } from "vitest";
import {
  isLowSignalDiscoveryResult,
  prioritizeDiscoveryResults,
} from "../src/infra/search/source-policy.js";

describe("search source policy", () => {
  it("filters social discovery results when higher-signal sources exist", () => {
    const results = prioritizeDiscoveryResults(
      [
        {
          title: "facebook.com",
          url: "https://example-redirect.test/a",
          publisher: "facebook.com",
          snippet: "social result",
        },
        {
          title: "udn.com",
          url: "https://example-redirect.test/b",
          publisher: "udn.com",
          snippet: "news result",
        },
      ],
      5,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.publisher).toBe("udn.com");
  });

  it("recognizes YouTube as low-signal discovery evidence", () => {
    expect(
      isLowSignalDiscoveryResult({
        title: "youtube.com",
        url: "https://example-redirect.test/c",
        publisher: "youtube.com",
        snippet: "video",
      }),
    ).toBe(true);
  });
});
