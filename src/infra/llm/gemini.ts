import { GoogleGenAI } from "@google/genai";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  LlmProvider,
  StructuredLlmRequest,
  StructuredLlmResponse,
} from "./provider.js";

export interface GeminiLlmProviderOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    typeof value === "object" &&
    value !== null &&
    "_def" in value &&
    "parse" in value &&
    typeof (value as { parse?: unknown }).parse === "function"
  );
}

export function toGeminiJsonSchema(schema: unknown): Record<string, unknown> {
  if (isZodSchema(schema)) {
    return zodToJsonSchema(schema, {
      target: "jsonSchema7",
      $refStrategy: "none",
    }) as Record<string, unknown>;
  }

  if (typeof schema === "object" && schema !== null) {
    return schema as Record<string, unknown>;
  }

  throw new Error("Structured Gemini requests require a Zod or JSON schema.");
}

export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly temperature: number;

  constructor(options: GeminiLlmProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("GEMINI_API_KEY is required.");
    }

    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gemini-3.8-flash";
    this.temperature = options.temperature ?? 0.1;
  }

  async structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>> {
    const startedAt = Date.now();
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: JSON.stringify(request.input),
      config: {
        systemInstruction: request.system,
        temperature: this.temperature,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiJsonSchema(request.schema),
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error(
        `Gemini returned no structured output for task ${request.task}.`,
      );
    }

    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch (error) {
      throw new Error(
        `Gemini returned invalid JSON for task ${request.task}: ` +
          (error instanceof Error ? error.message : "unknown parse error"),
      );
    }

    const usage = response.usageMetadata;

    return {
      data,
      model: this.model,
      latencyMs: Date.now() - startedAt,
      usage: usage
        ? {
            inputTokens: usage.promptTokenCount,
            outputTokens: usage.candidatesTokenCount,
          }
        : undefined,
    };
  }
}

export function geminiProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GeminiLlmProvider {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? "";

  return new GeminiLlmProvider({
    apiKey,
    model: env.GEMINI_MODEL ?? env.LLM_MODEL ?? "gemini-3.8-flash",
  });
}
