import { fetchLatestMonthlyRevenue } from "./tools/official/monthly-revenue-client.js";

const ticker = process.argv[2] ?? "2330";
const market = (process.argv[3]?.toUpperCase() ?? "TWSE") as "TWSE" | "TPEX";

if (market !== "TWSE" && market !== "TPEX") {
  throw new Error("Market must be TWSE or TPEX.");
}

const result = await fetchLatestMonthlyRevenue(market, ticker);

console.log(
  JSON.stringify(
    {
      record: result.record,
      source: result.source,
      attempts: result.attempts,
      durationMs: result.durationMs,
    },
    null,
    2,
  ),
);
