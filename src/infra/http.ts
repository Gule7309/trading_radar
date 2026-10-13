export interface JsonHttpOptions {
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
  headers?: Record<string, string>;
}

export interface JsonHttpResult<T> {
  data: T;
  status: number;
  retrievedAt: string;
  durationMs: number;
  attempts: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchJson<T>(
  url: string,
  options: JsonHttpOptions = {},
): Promise<JsonHttpResult<T>> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const retryBaseMs = options.retryBaseMs ?? 400;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "trading-radar/0.1",
          ...(options.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(
          `HTTP ${response.status} while fetching ${url}`,
        );

        if (attempt <= retries && shouldRetryStatus(response.status)) {
          lastError = error;
          await sleep(retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        throw error;
      }

      const data = (await response.json()) as T;

      return {
        data,
        status: response.status,
        retrievedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;

      if (attempt > retries) {
        break;
      }

      await sleep(retryBaseMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}
