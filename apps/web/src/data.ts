import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../packages/taiwan_data/src/taiwan_data/screening/screening-output.schema.json";
import fixture from "../../../packages/taiwan_data/tests/fixtures/sample_screening_output.json";
import {
  HardSchema,
  type HardConstraints,
  type ScreeningOutput,
  type Snapshot,
} from "./contracts";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile<ScreeningOutput>(schema);
export function parseScreening(value: unknown): ScreeningOutput {
  if (!validate(value))
    throw new Error(
      `篩選資料不符合 A 的契約：${validate.errors
        ?.slice(0, 4)
        .map((e) => `${e.instancePath || "/"} ${e.message}`)
        .join("；")}`,
    );
  return value as ScreeningOutput;
}
export const sample = parseScreening(fixture);
export function hardMatches(input: ScreeningOutput, hard: HardConstraints) {
  const parsed = HardSchema.safeParse(input.run.profile);
  if (!parsed.success) return false;
  const a = parsed.data;
  return (
    a.maxDebtRatio === hard.maxDebtRatio &&
    a.minLiquidity === hard.minLiquidity &&
    a.excludeDisposition === hard.excludeDisposition &&
    JSON.stringify([...a.excludedIndustries].sort()) ===
      JSON.stringify([...hard.excludedIndustries].sort())
  );
}
export function safeUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function isPlaceholderSource(value?: string | null) {
  const url = safeUrl(value);
  return !!url && new URL(url).hostname.endsWith(".invalid");
}
export function date(value?: string | null) {
  if (!value) return "未提供";
  if (!value.includes("T")) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(parsed);
}
export const percent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "未提供"
    : `${(value * 100).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;
export function metric(value: number, name: string) {
  return name === "avgTurnover20d"
    ? `${(value / 100_000_000).toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 億元`
    : `${value.toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;
}
export const labels: Record<string, string> = {
  "Initial verified thesis created.": "已建立初始研究論點。",
  "Initial verified thesis created from a publishable research result.":
    "已依本次發布研究建立初始論點。",
  PUBLISHABLE: "可發布研究",
  PARTIAL: "部分研究結果",
  REJECTED: "暫不形成結論",
  SKIPPED: "未納入本輪",
  PENDING: "待驗證",
  SUPPORTED: "已驗證支持",
  REFUTED: "證據反駁",
  INSUFFICIENT: "證據不足",
  CONFLICTING: "來源衝突",
  ACTIVE: "追蹤中",
  STRENGTHENED: "論點強化",
  UNCHANGED: "未有顯著變化",
  WEAKENED: "論點削弱",
  INVALIDATED: "論點失效",
  CURRENT: "當期（後端判定）",
  STALE: "過期（後端判定）",
  UNKNOWN: "未判定",
  PUBLISHED: "完成發布",
  INSUFFICIENT_EVIDENCE: "證據不足",
  UNRESOLVED_CONFLICT: "尚有未解決的來源衝突",
  SOURCE_FAILURE: "來源取得失敗",
  MODEL_FAILURE: "模型執行失敗",
  BUDGET_EXHAUSTED: "研究資源額度已用盡",
  NO_CORE_CLAIM: "尚未建立核心論述",
  NO_RISK_IDENTIFIED: "尚未完成必要風險辨識",
  HARD_CONSTRAINT_FAILED: "未符合硬性限制",
  RESEARCH_LIMIT: "本輪研究額度限制",
  RUNNING: "執行中",
  WAITING_FOR_FRESH_DATA: "等待新資料",
  SUCCESS: "完成",
  FAILED: "失敗",
  TWSE: "上市",
  TPEX: "上櫃",
  notice: "近 30 日注意股",
  disposition: "處置中",
  revenueYoY: "營收年增率",
  operatingMargin: "單季營業利益率",
  debtRatio: "負債比",
  avgTurnover20d: "近 20 日平均成交金額",
  DAILY_RESEARCH_READY: "每日研究",
  THESIS_CHANGED: "論點變化",
  EVIDENCE_CONFLICT: "證據衝突",
  MONTHLY_REVENUE: "月營收",
  MATERIAL_DISCLOSURE: "重大訊息",
  NEWS: "新聞",
  MANUAL_RECHECK: "手動重查",
  NEW_RESEARCH_RESULT: "研究結果",
  GROWTH: "成長",
  BALANCED: "均衡",
  STABLE: "穩健",
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  SHORT: "短期",
  LONG: "長期",
  SAVE: "收藏",
  SKIP: "略過",
  FEEDBACK: "研究回饋",
  MANUAL: "手動調整",
  RESET: "重設權重",
  growth: "成長",
  profitability: "獲利",
  safety: "財務安全",
  FINANCIAL_STABILITY: "財務穩健",
  INDUSTRY_TREND: "產業趨勢",
  ACCEPTABLE_RISK: "風險可接受",
  OTHER: "其他",
  HIGH_VOLATILITY: "波動太高",
  FINANCIAL_QUALITY: "財務體質",
  UNFAMILIAR_INDUSTRY: "產業不熟",
  INSUFFICIENT_GROWTH: "成長性不足",
  VALUATION_CONCERN: "估值疑慮",
  verified: "上游驗證通過",
  SEARCH_OFFICIAL: "查找官方資料",
  SEARCH_NEWS: "查找新聞",
  FETCH_SOURCE: "取得來源",
  VERIFY: "驗證證據",
  RUN_SKEPTIC: "檢查風險",
  FINALIZE: "整理研究",
  REJECT: "停止形成結論",
  CORE: "核心論述",
  SUPPORTING: "補充論述",
};
export const label = (value?: string) =>
  value ? labels[value] || `未識別：${value}` : "未提供";
export const saveReasons = [
  "GROWTH",
  "FINANCIAL_STABILITY",
  "INDUSTRY_TREND",
  "ACCEPTABLE_RISK",
  "OTHER",
];
export const skipReasons = [
  "HIGH_VOLATILITY",
  "FINANCIAL_QUALITY",
  "UNFAMILIAR_INDUSTRY",
  "INSUFFICIENT_GROWTH",
  "VALUATION_CONCERN",
  "OTHER",
];
export function rankChanges(previous: Snapshot, next: Snapshot) {
  return next.result.top.map((item) => ({
    ticker: item.ticker,
    before: previous.result.top.find((p) => p.ticker === item.ticker)?.rank,
    after: item.rank,
  }));
}
export async function readJson(file: File) {
  if (file.size > 950_000)
    throw new Error(
      "檔案過大，請使用小於 950 KB 的 JSON，並保留完整資料契約。",
    );
  return JSON.parse(await file.text()) as unknown;
}

export function isNewerData(next: string, current: string) {
  const nextTime = Date.parse(next);
  const currentTime = Date.parse(current);
  return (
    Number.isFinite(nextTime) &&
    Number.isFinite(currentTime) &&
    nextTime > currentTime
  );
}
