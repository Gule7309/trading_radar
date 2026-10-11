import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LlmProvider } from "../infra/llm/provider.js";
import type { SearchProvider } from "../infra/search/provider.js";
import type { PersonalizationService } from "../personalization/service.js";
import type { DailyDeliveryService } from "../delivery/service.js";

const execFileAsync = promisify(execFile);

export interface AdminRuntimeStatus {
  llmProvider: string;
  llmModel?: string;
  searchProvider: string;
  searchModel?: string;
  modelCredentialConfigured: boolean;
  taiwanDataConfigured: boolean;
  dailySchedulerEnabled: boolean;
  dailyResearchAfterHour: number;
  registeredUsers: number;
  latestDeliveryRuns: Array<{
    userId: string;
    status: string;
    localDate: string;
    completedAt?: string;
  }>;
}

export class AdminService {
  constructor(
    private readonly llm: LlmProvider,
    private readonly search: SearchProvider,
    private readonly personalization:
      | Pick<PersonalizationService, "listProfiles">
      | undefined,
    private readonly delivery:
      | Pick<DailyDeliveryService, "listRuns">
      | undefined,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async status(): Promise<AdminRuntimeStatus> {
    const profiles = this.personalization
      ? await this.personalization.listProfiles()
      : [];

    const latestDeliveryRuns: AdminRuntimeStatus["latestDeliveryRuns"] = [];

    if (this.delivery) {
      for (const profile of profiles.slice(0, 50)) {
        const [latest] = await this.delivery.listRuns(
          profile.userId,
          1,
        );
        if (!latest) continue;

        latestDeliveryRuns.push({
          userId: profile.userId,
          status: latest.status,
          localDate: latest.localDate,
          completedAt: latest.completedAt,
        });
      }
    }

    return {
      llmProvider: this.llm.name,
      llmModel:
        this.env.GEMINI_MODEL ??
        this.env.LLM_MODEL ??
        undefined,
      searchProvider: this.search.name,
      searchModel:
        this.env.GEMINI_SEARCH_MODEL ?? undefined,
      modelCredentialConfigured: Boolean(
        this.env.GEMINI_API_KEY ||
          this.env.GOOGLE_API_KEY,
      ),
      taiwanDataConfigured: Boolean(
        this.env.TAIWAN_DATA_DB,
      ),
      dailySchedulerEnabled:
        this.env.ENABLE_DAILY_SCHEDULER?.toLowerCase() ===
        "true",
      dailyResearchAfterHour: Number(
        this.env.DAILY_RESEARCH_AFTER_HOUR ?? "17",
      ),
      registeredUsers: profiles.length,
      latestDeliveryRuns,
    };
  }

  async modelCheck() {
    const startedAt = Date.now();
    const response = await this.llm.structured<{
      ok: boolean;
    }>({
      task: "VERIFIER",
      system:
        "This is a backend connectivity health check. Return JSON only and set ok=true.",
      input: {
        healthCheck: true,
      },
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
    });

    return {
      ok: response.data.ok === true,
      provider: this.llm.name,
      model: response.model,
      latencyMs:
        response.latencyMs ?? Date.now() - startedAt,
    };
  }

  async dataStatus() {
    const dbPath = this.env.TAIWAN_DATA_DB;
    if (!dbPath) {
      return {
        configured: false,
        tables: {},
        datasetStatus: [],
      };
    }

    const command =
      this.env.TAIWAN_DATA_CLI ?? "taiwan-data";
    const { stdout } = await execFileAsync(
      command,
      ["status", "--db", dbPath, "--json"],
      {
        timeout: Number(
          this.env.TAIWAN_DATA_STATUS_TIMEOUT_MS ??
            "30000",
        ),
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as {
      tables?: unknown;
      dataset_status?: unknown;
    };

    return {
      configured: true,
      tables: parsed.tables ?? {},
      datasetStatus: parsed.dataset_status ?? [],
    };
  }
}
