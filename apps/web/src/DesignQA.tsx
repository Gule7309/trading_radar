import { useSearchParams } from "react-router-dom";
import { ResearchDetail } from "./ResearchDetail";
import type { ResearchResult } from "./contracts";
import { sample } from "./data";
import { Empty, PageHeading } from "./ui";
import s from "./app.module.css";

// Local display fixtures, never submitted to the research backend or archived.
export function DesignQA() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("data") || "demo";
  const worst = mode === "worst";
  const result: ResearchResult = {
    runId: "ui-only",
    ticker: "2059",
    companyName: worst
      ? "台灣國際半導體設備與精密零組件控股股份有限公司"
      : mode === "one"
        ? "川"
        : "川湖",
    status: worst ? "PARTIAL" : "PUBLISHABLE",
    decision: worst ? "REJECT" : "KEEP",
    thesis: worst
      ? undefined
      : "[UI 測試資料] 這是用來檢查閱讀與版面呈現的論點，不是投資研究。",
    keyReasons: [
      "[UI 測試資料] 成長線索需要與營收認列、產品組合、一次性訂單，以及前期低基期共同查核，避免把單期數值延伸成未經驗證的長期結論。",
    ],
    claims: Array.from({ length: worst ? 12 : 1 }, (_, i) => ({
      claimId: `qa-${i}`,
      text: `[UI 測試資料] 第 ${i + 1} 項論述：海外子公司與不同會計期間的揭露存在可比性限制；閱讀原始公告與附註後，才能確認數字是否支持同一研究命題。`,
      status: worst
        ? ["CONFLICTING", "INSUFFICIENT", "PENDING", "NEW_STATUS"][i % 4]
        : "SUPPORTED",
      sourceIds: worst ? ["qa-source", "missing-document"] : ["qa-source"],
    })),
    sources: [
      {
        sourceId: "qa-source",
        title:
          "[UI 測試資料] 第三季合併財務報告暨海外子公司重大投資計畫說明：董事會通過之資本支出、匯率變化與供應鏈交期風險補充揭露",
        publisher: "台灣國際半導體設備與精密零組件控股股份有限公司",
        sourceTier: 2,
        sourceType: "COMPANY_IR",
        url: "https://example.invalid/investor-relations/2026-q3-consolidated-financial-report-and-capital-expenditure-announcement",
      },
    ],
    risks: [
      {
        title: "匯率與需求變動同時影響獲利",
        explanation:
          "[UI 測試資料] 短期訂單增長不等同於可持續獲利。若匯率、材料成本與客戶集中度同時惡化，需重新查證支持論點的條件。",
        sourceIds: [],
      },
    ],
    invalidationConditions: [
      "若後續已驗證公告反駁核心營收或毛利假設，應重新評估原先論點。",
    ],
    verificationSummary: {
      coreClaimCoverage: worst ? 0 : 1,
      primarySourceRatio: worst ? 0 : 0.5,
      unresolvedConflicts: worst ? 12 : 0,
    },
    researchTrace: [
      {
        step: 1,
        action: "FETCH_SOURCE",
        reasonCode: "SOURCE_FAILURE",
        tool: "UI_TEST_DOUBLE",
        outcome: "[測試替身] 來源無法取得；僅驗證畫面，不代表 Agent 實際執行。",
        createdAt: "2026-10-08T09:00:00Z",
      },
      {
        step: 2,
        action: "REJECT",
        reasonCode: "UNRESOLVED_CONFLICT",
        decisionSummary: "[測試替身] 備援來源仍不足以支持論述。",
        outcome: "Stopped",
        createdAt: "2026-10-08T09:00:01Z",
      },
    ],
    diagnostics: [
      {
        stage: "VERIFICATION",
        message:
          "[測試替身] Retry / Fallback 訊息顯示檢查；實際研究必須使用後端執行紀錄。",
        createdAt: "2026-10-08T09:00:01Z",
      },
    ],
    stopReason: worst ? "UNRESOLVED_CONFLICT" : "PUBLISHED",
    startedAt: "2026-10-08T09:00:00Z",
    completedAt: "2026-10-08T09:00:01Z",
  };
  const candidate = structuredClone(sample.candidates[0]);
  if (worst) {
    candidate.riskFlags = ["notice", "disposition"];
    candidate.metrics.revenueYoY.value = -99.9;
    candidate.metrics.operatingMargin.value = -245.8;
    candidate.metrics.debtRatio.value = 149.2;
    candidate.metrics.avgTurnover20d.value = 123_456_789_012;
  }
  // Quantitative values in worst mode are fixtures; omit A evidence to prevent false attribution.
  return (
    <>
      <PageHeading
        title="畫面壓力測試"
        text="僅限開發環境。全部是 UI 測試資料，無法收藏、回饋或寫入研究紀錄。"
      />
      <div className={s.notice}>
        檢查長中文、缺論點、缺來源日期、未知狀態、衝突、負值與極端金額。真實 API
        支援的 Top-K 上限為 20；本文集合則未在公開 DTO 限制長度。
      </div>
      {mode === "empty" ? (
        <Empty title="沒有研究結果">
          <p>這是零結果呈現的測試替身。</p>
        </Empty>
      ) : (
        <div className={s.paper}>
          <ResearchDetail
            result={result}
            candidate={candidate}
            input={worst ? undefined : sample}
            readOnly
          />
        </div>
      )}
      <div className={s.qaToggle} aria-label="測試資料切換">
        {[
          ["demo", "Demo data"],
          ["worst", "Worst case"],
          ["empty", "Empty"],
          ["one", "One"],
        ].map(([value, text]) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => setParams({ data: value })}
          >
            {text}
          </button>
        ))}
      </div>
    </>
  );
}
