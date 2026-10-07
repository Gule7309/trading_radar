import { GoogleGenAI } from "@google/genai";
import type {
  SearchProvider,
  SearchQuery,
  SearchResult,
} from "./provider.js";

export interface GeminiGoogleSearchProviderOptions {
  apiKey: string;
  model?: string;
}

interface GroundingWebChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GroundingSupport {
  segment?: {
    startIndex?: number;
    endIndex?: number;
  };
  groundingChunkIndices?: number[];
}

interface GroundedCandidate {
  groundingMetadata?: {
    groundingChunks?: GroundingWebChunk[];
    groundingSupports?: GroundingSupport[];
    webSearchQueries?: string[];
  };
}

function publisherFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function extractGroundedSearchResults(
  text: string,
  candidate: GroundedCandidate | undefined,
  maxResults: number,
): SearchResult[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const supports = candidate?.groundingMetadata?.groundingSupports ?? [];
  const snippetsByChunk = new Map<number, string[]>();

  for (const support of supports) {
    const start = support.segment?.startIndex ?? 0;
    const end = support.segment?.endIndex ?? start;
    const citedText = text.slice(start, end).trim();

    if (!citedText) continue;

    for (const index of support.groundingChunkIndices ?? []) {
      const current = snippetsByChunk.get(index) ?? [];
      current.push(citedText);
      snippetsByChunk.set(index, current);
    }
  }

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  chunks.forEach((chunk, index) => {
    const url = chunk.web?.uri;
    if (!url || seen.has(url) || results.length >= maxResults) return;

    seen.add(url);

    const snippets = snippetsByChunk.get(index) ?? [];
    const snippet =
      snippets.join(" ").trim() ||
      text.slice(0, 500).trim() ||
      "Grounded Google Search source.";

    results.push({
      title: chunk.web?.title?.trim() || publisherFromUrl(url) || url,
      url,
      publisher: publisherFromUrl(url),
      snippet,
    });
  });

  return results;
}

export class GeminiGoogleSearchProvider implements SearchProvider {
  readonly name = "gemini-google-search";

  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: GeminiGoogleSearchProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("GEMINI_API_KEY is required.");
    }

    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gemini-3.8-flash";
  }

  async search(input: SearchQuery): Promise<SearchResult[]> {
    const maxResults = Math.max(1, Math.min(input.maxResults ?? 5, 10));
    const dateWindow =
      input.from || input.to
        ? ` Prefer sources within this date window: ${input.from ?? "open"} to ${input.to ?? "open"}.`
        : "";

    const response = await this.client.models.generateContent({
      model: this.model,
      contents:
        "Search the current public web for this Taiwan equity research query: " +
        input.query +
        "." +
        dateWindow +
        " Prefer recent, company-specific, factual sources. " +
        "Use official company or exchange sources when available. " +
        "Return a concise synthesis grounded in the retrieved sources.",
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0,
      },
    });

    const text = response.text?.trim() ?? "";
    const candidate = response.candidates?.[0] as unknown as
      | GroundedCandidate
      | undefined;

    return extractGroundedSearchResults(text, candidate, maxResults);
  }
}

export function geminiSearchProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GeminiGoogleSearchProvider {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? "";

  return new GeminiGoogleSearchProvider({
    apiKey,
    model:
      env.GEMINI_SEARCH_MODEL ??
      env.GEMINI_MODEL ??
      env.LLM_MODEL ??
      "gemini-3.8-flash",
  });
}
