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
}

const ALLOWED_SCHEMA_KEYS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    typeof value === "object" &&
    value !== null &&
    "_def" in value &&
    "parse" in value &&
    typeof (value as { parse?: unknown }).parse === "function"
  );
}

function sanitizeGeminiSchemaNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGeminiSchemaNode(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  if ("const" in input) {
    output.enum = [sanitizeGeminiSchemaNode(input.const)];
  }

  for (const [key, child] of Object.entries(input)) {
    if (key === "const" || key === "$schema") continue;
    if (!ALLOWED_SCHEMA_KEYS.has(key)) continue;

    if (key === "properties" || key === "$defs") {
      if (typeof child !== "object" || child === null || Array.isArray(child)) {
        continue;
      }

      output[key] = Object.fromEntries(
        Object.entries(child as Record<string, unknown>).map(
          ([name, schema]) => [name, sanitizeGeminiSchemaNode(schema)],
        ),
      );
      continue;
    }

    output[key] = sanitizeGeminiSchemaNode(child);
  }

  return output;
}

export function toGeminiJsonSchema(schema: unknown): Record<string, unknown> {
  const raw = isZodSchema(schema)
    ? zodToJsonSchema(schema, {
        target: "jsonSchema7",
        $refStrategy: "none",
      })
    : schema;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Structured Gemini requests require a Zod or JSON schema.");
  }

  return sanitizeGeminiSchemaNode(raw) as Record<string, unknown>;
}

export function sanitizeGeminiErrorMessage(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[REDACTED]");
}

export function describeGeminiError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeGeminiErrorMessage(error.message);
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const parts = [
      typeof record.name === "string" ? record.name : undefined,
      typeof record.status === "number" || typeof record.status === "string"
        ? `status=${String(record.status)}`
        : undefined,
      typeof record.code === "number" || typeof record.code === "string"
        ? `code=${String(record.code)}`
        : undefined,
      typeof record.message === "string" ? record.message : undefined,
    ].filter((value): value is string => Boolean(value));

    if (parts.length > 0) {
      return sanitizeGeminiErrorMessage(parts.join(" | "));
    }
  }

  return "Unknown Gemini request failure.";
}

export class GeminiRequestError extends Error {
  constructor(
    public readonly task: string,
    public readonly model: string,
    cause: unknown,
  ) {
    super(
      `Gemini ${task} request failed on ${model}: ${describeGeminiError(cause)}`,
    );
    this.name = "GeminiRequestError";
  }
}

export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: GeminiLlmProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("GEMINI_API_KEY is required.");
    }

    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gemini-3.8-flash";
  }

  async structured<T>(
    request: StructuredLlmRequest,
  ): Promise<StructuredLlmResponse<T>> {
    const startedAt = Date.now();

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: JSON.stringify(request.input),
        config: {
          systemInstruction: request.system,
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
    } catch (error) {
      if (error instanceof GeminiRequestError) throw error;
      throw new GeminiRequestError(request.task, this.model, error);
    }
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
