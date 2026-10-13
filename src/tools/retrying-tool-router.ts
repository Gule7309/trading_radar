import type {
  ResearchToolRouter,
  ToolExecutionContext,
  ToolObservation,
} from "./tool-router.js";
import type { ResearchAction } from "../domain/research.js";

export interface RetryingToolRouterOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RetryingToolRouter implements ResearchToolRouter {
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(
    private readonly inner: ResearchToolRouter,
    options: RetryingToolRouterOptions = {},
  ) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  }

  async execute(
    action: ResearchAction,
    context: ToolExecutionContext,
  ): Promise<ToolObservation> {
    let last: ToolObservation | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        last = await this.inner.execute(action, context);
      } catch (error) {
        last = {
          outcome: "ERROR",
          summary:
            error instanceof Error ? error.message : "Unknown tool exception.",
          retryable: true,
        };
      }

      if (last.outcome !== "ERROR" || last.retryable === false) {
        return {
          ...last,
          attempts: attempt,
          summary:
            attempt > 1
              ? `${last.summary} (attempt ${attempt}/${this.maxAttempts})`
              : last.summary,
        };
      }

      if (attempt < this.maxAttempts) {
        await sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }

    return {
      ...(last ?? {
        outcome: "ERROR",
        summary: "Tool failed without an observation.",
      }),
      attempts: this.maxAttempts,
    };
  }
}
