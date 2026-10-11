import { loadEnvFile } from "node:process";
import { providersFromEnv } from "../runtime/provider-factory.js";
import { createResearchRuntime } from "../runtime/research-runtime.js";
import { SqliteResearchRunStore } from "../research/sqlite-store.js";
import { ResearchService } from "../research/service.js";
import { BatchResearchService } from "../research/batch-service.js";
import { SqliteThesisStore } from "../thesis/sqlite-store.js";
import { ThesisService } from "../thesis/service.js";
import { ThesisResearchService } from "../thesis/research-service.js";
import { SqlitePersonalizationStore } from "../personalization/sqlite-store.js";
import { PersonalizationService } from "../personalization/service.js";
import { SqliteNotificationStore } from "../notifications/sqlite-store.js";
import { NotificationService } from "../notifications/service.js";
import { SqliteWatchlistStore } from "../watchlist/sqlite-store.js";
import { WatchlistService } from "../watchlist/service.js";
import { SqliteDeliveryRunStore } from "../delivery/sqlite-store.js";
import { CliScreeningProvider } from "../delivery/cli-screening-provider.js";
import { DailyDeliveryService } from "../delivery/service.js";
import { DailyResearchScheduler } from "../delivery/scheduler.js";
import { createResearchApi } from "./research-api.js";

try {
  loadEnvFile(".env");
} catch {
  // Environment variables may already be supplied externally.
}

const providers = providersFromEnv();
const runtime = createResearchRuntime(providers.llm, providers.search);
const sqlitePath =
  process.env.SQLITE_PATH ?? "trading-radar.sqlite";

const researchStore =
  new SqliteResearchRunStore(sqlitePath);
const research = new ResearchService(
  runtime,
  researchStore,
);
const batch = new BatchResearchService(research);

const thesisStore = new SqliteThesisStore(sqlitePath);
const thesisService = new ThesisService(thesisStore);
const theses = new ThesisResearchService(
  research,
  thesisService,
);

const personalizationStore =
  new SqlitePersonalizationStore(sqlitePath);
const personalization = new PersonalizationService(
  personalizationStore,
  research,
);

const notificationStore =
  new SqliteNotificationStore(sqlitePath);
const notifications = new NotificationService(
  notificationStore,
);

const watchlistStore =
  new SqliteWatchlistStore(sqlitePath);
const watchlist = new WatchlistService(
  watchlistStore,
  research,
  thesisService,
  theses,
  notifications,
);

const deliveryStore =
  new SqliteDeliveryRunStore(sqlitePath);

let delivery: DailyDeliveryService | undefined;
let scheduler: DailyResearchScheduler | undefined;

if (process.env.TAIWAN_DATA_DB) {
  const screening = CliScreeningProvider.fromEnv();
  delivery = new DailyDeliveryService(
    screening,
    personalization,
    batch,
    notifications,
    deliveryStore,
  );

  if (
    process.env.ENABLE_DAILY_SCHEDULER?.toLowerCase() ===
    "true"
  ) {
    scheduler = new DailyResearchScheduler(
      personalization,
      delivery,
      {
        afterHour: Number(
          process.env.DAILY_RESEARCH_AFTER_HOUR ?? "17",
        ),
        intervalMs: Number(
          process.env.DAILY_SCHEDULER_INTERVAL_MS ??
            String(60 * 60 * 1000),
        ),
      },
    );
    scheduler.start();
  }
}

const server = createResearchApi(research, {
  corsOrigin:
    process.env.CORS_ORIGIN ?? "http://localhost:5173",
  theses,
  batch,
  personalization,
  watchlist,
  notifications,
  delivery,
});

const port = Number(process.env.PORT ?? "8787");

server.listen(port, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      service: "trading-radar-b",
      listening: `http://127.0.0.1:${port}`,
      llmProvider: providers.llm.name,
      searchProvider: providers.search.name,
      thesisTracking: true,
      personalization: true,
      watchlist: true,
      notifications: true,
      proactiveDelivery: Boolean(delivery),
      dailyScheduler: Boolean(scheduler),
    }),
  );
});

const shutdown = () => {
  scheduler?.stop();
  server.close(() => {
    researchStore.close();
    thesisStore.close();
    personalizationStore.close();
    notificationStore.close();
    watchlistStore.close();
    deliveryStore.close();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
