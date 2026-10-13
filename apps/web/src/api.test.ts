import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, request } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("API failure semantics", () => {
  it("preserves the backend string error code for old cached runs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "RUN_NOT_FOUND" }), {
          status: 404,
        }),
      ),
    );
    await expect(request("/missing", z.unknown())).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
      status: 404,
    });
  });
  it("rejects a successful HTTP response with an invalid DTO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(
      request("/run", z.object({ result: z.object({ runId: z.string() }) })),
    ).rejects.toMatchObject({ code: "CONTRACT_MISMATCH" });
  });
  it("waits the configured 300 seconds and never retries an uncertain POST", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const promise = request("/research", z.unknown(), {});
    const assertion = expect(promise).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry network failures or disabled capabilities", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
    vi.stubGlobal("fetch", fetcher);
    await expect(request("/feedback", z.unknown(), {})).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ error: "PERSONALIZATION_API_DISABLED" }), {
        status: 501,
      }),
    );
    await expect(request("/profile", z.unknown())).rejects.toMatchObject({
      code: "PERSONALIZATION_API_DISABLED",
      status: 501,
    });
  });
});
