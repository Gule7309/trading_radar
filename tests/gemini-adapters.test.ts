import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toGeminiJsonSchema } from "../src/infra/llm/gemini.js";
import {
  extractGroundedSearchResults,
} from "../src/infra/search/gemini-google-search.js";

describe("Gemini adapters", () => {
  it("converts Zod schemas to JSON Schema", () => {
    const schema = toGeminiJsonSchema(
      z.object({
        result: z.enum(["SUPPORTED", "REFUTED"]),
        reason: z.string(),
      }),
    );

    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
  });

  it("extracts deduplicated cited web sources from grounding metadata", () => {
    const text =
      "Company revenue accelerated. Margin pressure remains a downside risk.";

    const results = extractGroundedSearchResults(
      text,
      {
        groundingMetadata: {
          groundingChunks: [
            {
              web: {
                uri: "https://example.com/a",
                title: "Example A",
              },
            },
            {
              web: {
                uri: "https://example.com/b",
                title: "Example B",
              },
            },
            {
              web: {
                uri: "https://example.com/a",
                title: "Duplicate A",
              },
            },
          ],
          groundingSupports: [
            {
              segment: {
                startIndex: 0,
                endIndex: 28,
              },
              groundingChunkIndices: [0],
            },
            {
              segment: {
                startIndex: 29,
                endIndex: text.length,
              },
              groundingChunkIndices: [1],
            },
          ],
        },
      },
      5,
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      url: "https://example.com/a",
      title: "Example A",
      publisher: "example.com",
    });
    expect(results[0]?.snippet).toContain("revenue");
    expect(results[1]?.snippet).toContain("Margin");
  });
});
