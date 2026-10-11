import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  ScreeningOutputV1Schema,
  type ScreeningOutputV1,
} from "../domain/screening-output.js";
import type { UserProfile } from "../personalization/types.js";
import type { ScreeningProvider } from "./screening-provider.js";

const execFileAsync = promisify(execFile);

export interface CliScreeningProviderOptions {
  dbPath: string;
  command?: string;
  timeoutMs?: number;
}

export class CliScreeningProvider implements ScreeningProvider {
  private readonly dbPath: string;
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: CliScreeningProviderOptions) {
    if (!options.dbPath) {
      throw new Error("TAIWAN_DATA_DB is required for scheduled screening.");
    }
    this.dbPath = options.dbPath;
    this.command = options.command ?? "taiwan-data";
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async screen(
    profile: UserProfile,
    options: { limit?: number } = {},
  ): Promise<ScreeningOutputV1> {
    const dir = await mkdtemp(join(tmpdir(), "trading-radar-screen-"));
    const profilePath = join(dir, "profile.json");
    const outputPath = join(dir, "screening-output.json");

    try {
      await writeFile(
        profilePath,
        JSON.stringify(
          {
            excludedIndustries:
              profile.hardConstraints.excludedIndustries,
            maxDebtRatio: profile.hardConstraints.maxDebtRatio,
            minLiquidity: profile.hardConstraints.minLiquidity,
            excludeDisposition:
              profile.hardConstraints.excludeDisposition,
            weights: profile.softPreferences,
          },
          null,
          2,
        ),
        "utf8",
      );

      await execFileAsync(
        this.command,
        [
          "screen",
          "--db",
          this.dbPath,
          "--limit",
          String(Math.max(1, Math.min(options.limit ?? 20, 50))),
          "--profile",
          profilePath,
          "--output",
          outputPath,
        ],
        {
          timeout: this.timeoutMs,
          maxBuffer: 5 * 1024 * 1024,
        },
      );

      const parsed = JSON.parse(
        await readFile(outputPath, "utf8"),
      ) as unknown;

      return ScreeningOutputV1Schema.parse(parsed);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): CliScreeningProvider {
    return new CliScreeningProvider({
      dbPath: env.TAIWAN_DATA_DB ?? "",
      command: env.TAIWAN_DATA_CLI ?? "taiwan-data",
      timeoutMs: Number(env.TAIWAN_DATA_SCREEN_TIMEOUT_MS ?? "120000"),
    });
  }
}
