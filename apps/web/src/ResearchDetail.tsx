import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  BookmarkPlus,
  ChevronRight,
  FileSearch,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "./api";
import { useApp } from "./context-store";
import type {
  Change,
  QuantCandidate,
  QuantEvidence,
  ResearchResult,
  ScreeningOutput,
  Source,
} from "./contracts";
import {
  date,
  label,
  metric,
  percent,
  saveReasons,
  skipReasons,
  isPlaceholderSource,
} from "./data";
import {
  ErrorBox,
  External,
  JsonDetails,
  Modal,
  Status,
  WeightsView,
} from "./ui";
import { storage } from "./storage";
import s from "./app.module.css";

export function EvidenceContent({
  title,
  status,
  ids,
  sources,
  quant,
}: {
  title: string;
  status?: string;
  ids?: string[];
  sources?: Source[];
  quant?: QuantEvidence;
}) {
  return (
    <>
      <blockquote className={s.evidenceQuote}>{title}</blockquote>
      {status && <Status value={status} />}
      {quant ? (
        <>
          <div className={s.section}>
            <h3>量化資料依據</h3>
            <dl className={s.definition}>
              <dt>股票代碼</dt>
              <dd>{quant.stockId}</dd>
              <dt>資料來源</dt>
              <dd>
                {quant.source} / {quant.dataset}
              </dd>
              <dt>資料期間</dt>
              <dd>{quant.dataAsOf}</dd>
              <dt>計算區間</dt>
              <dd>
                {quant.windowStart} — {quant.windowEnd}
              </dd>
              <dt>
                {quant.fetchedAtScope === "dataset"
                  ? "資料集更新時間"
                  : "該筆資料擷取時間"}
              </dt>
              <dd>{date(quant.fetchedAt)}</dd>
              <dt>原始數值</dt>
              <dd>
                {quant.value} {quant.unit}
              </dd>
            </dl>
            <p className={s.hint}>
              驗證方式由上游提供，請依下方方法區分「獨立交叉比對」與「輸入完整、推導一致」。兩者都不代表投資安全。
            </p>
            <p>{quant.calculation.method || "上游未提供驗證方法。"}</p>
            <External url={quant.sourceUrl}>開啟官方資料端點</External>
            {quant.referenceUrl && (
              <p>
                <External url={quant.referenceUrl}>閱讀參考頁</External>
              </p>
            )}
          </div>
          <details className={s.disclosure}>
            <summary>公式、方法與原始輸入</summary>
            <p>{quant.calculation.formula}</p>
            <dl className={s.definition}>
              {Object.entries(quant.calculation.inputs).map(([key, value]) => (
                <div key={key} className={s.definitionRow}>
                  <dt>
                    {key === "availabilityCutoff" ? "可用日期（估計）" : key}
                  </dt>
                  <dd>
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      ) : (
        <>
          <p className={s.hint}>
            {ids?.some((id) =>
              isPlaceholderSource(
                sources?.find((source) => source.sourceId === id)?.url,
              ),
            )
              ? "這次研究包含示範來源，下方會標示是否有可開啟的原始文件。"
              : "以下來源屬於這一次研究。公開回傳未包含原文摘錄與擷取時間；請開啟原始連結查核。"}
          </p>
          {!ids?.length && <p className={s.notice}>此論述未附來源識別碼。</p>}
          {ids?.map((id) => {
            const source = sources?.find((x) => x.sourceId === id);
            return (
              <section key={id} className={s.source}>
                {source ? (
                  <>
                    <h3>{source.title}</h3>
                    <dl className={s.definition}>
                      <dt>發布者</dt>
                      <dd>{source.publisher}</dd>
                      <dt>來源類型 / 層級</dt>
                      <dd>
                        {source.sourceType || "未提供"} / Tier{" "}
                        {source.sourceTier}（後端分級）
                      </dd>
                      <dt>發布時間</dt>
                      <dd>{date(source.publishedAt)}</dd>
                      <dt>資料期間</dt>
                      <dd>{source.dataPeriod || "未提供"}</dd>
                    </dl>
                    {isPlaceholderSource(source.url) ? (
                      <p className={s.notice}>
                        <strong>示範來源，無可開啟的原始文件</strong>
                        <br />
                        這個網址僅用於測試流程，不能據此確認論述。可回「重點總覽」查閱量化線索的實際資料來源。
                      </p>
                    ) : (
                      <External url={source.url}>查閱原始來源</External>
                    )}
                    <p className={s.sourceId}>{id}</p>
                  </>
                ) : (
                  <p className={s.notice}>
                    找不到 {id} 對應的來源文件，無法補造來源。
                  </p>
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}

export function ResearchTrace({ result }: { result: ResearchResult }) {
  const m = result.metrics;
  return (
    <details className={s.disclosure}>
      <summary>研究方法與執行紀錄</summary>
      <dl className={s.definition}>
        <dt>停止原因</dt>
        <dd>{label(result.stopReason)}</dd>
        <dt>完成時間</dt>
        <dd>{date(result.completedAt)}</dd>
        <dt>總耗時 / 模型耗時</dt>
        <dd>
          {m
            ? `${m.totalLatencyMs.toLocaleString()} / ${m.llmLatencyMs.toLocaleString()} ms`
            : "未提供"}
        </dd>
        <dt>模型呼叫 / Token</dt>
        <dd>
          {m
            ? `${m.llmCalls} 次 / 輸入 ${m.inputTokens}、輸出 ${m.outputTokens}`
            : "未提供"}
        </dd>
        <dt>估計成本（美元）</dt>
        <dd>
          {m?.estimatedCostUsd == null ? "未提供" : `$${m.estimatedCostUsd}`}
        </dd>
      </dl>
      {!result.researchTrace.length && <p>沒有回傳執行步驟。</p>}
      <ol className={s.trace}>
        {result.researchTrace.map((step, i) => (
          <li key={`${step.step}-${i}`}>
            <strong>{label(step.action)}</strong>
            <small>{date(step.createdAt)}</small>
            <p>
              {step.decisionSummary || step.actionDetail || step.reasonCode}
            </p>
            <p>{step.outcome}</p>
            <span className={s.hint}>
              {step.tool || "未提供工具"} · {step.reasonCode}
            </span>
          </li>
        ))}
      </ol>
      {result.diagnostics?.map((d, i) => (
        <div className={s.notice} key={i}>
          <strong>{d.stage}</strong>
          <p>{d.message}</p>
          <small>{date(d.createdAt)}</small>
        </div>
      ))}
      <p className={s.hint}>
        僅呈現後端提供的結構化執行紀錄；未回傳 Retry／Fallback
        時不推測它曾執行。
      </p>
    </details>
  );
}

function FeedbackDialog({
  result,
  action,
  onClose,
  onChange,
}: {
  result: ResearchResult;
  action: "SAVE" | "SKIP" | null;
  onClose: () => void;
  onChange: (change: Change) => void;
}) {
  const app = useApp();
  const navigate = useNavigate();
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [uncertain, setUncertain] = useState(
    storage.read(`feedback-pending:${result.runId}`) === "yes",
  );
  const mutation = useMutation({
    mutationFn: async () => {
      await app.assertWrite();
      if (!action || reasons.length < 1 || reasons.length > 4)
        throw new Error("請選擇 1–4 個原因。");
      await api.run(result.runId); // A cached result may outlive an in-memory backend.
      storage.write(`feedback-pending:${result.runId}`, "yes");
      return api.feedback({
        runId: result.runId,
        action,
        reasons,
        note: note.trim() || undefined,
      });
    },
    onSuccess: async (response) => {
      storage.write(`feedback-pending:${result.runId}`, "no");
      onChange(response.preferenceChange);
      await app.sync();
      toast.success(
        action === "SAVE" ? "收藏並追蹤完成" : "已記錄略過原因",
        response.watchlistItem
          ? {
              action: {
                label: "查看追蹤",
                onClick: () =>
                  navigate(
                    `/watchlist?thesis=${encodeURIComponent(response.watchlistItem!.thesisId)}`,
                  ),
              },
            }
          : undefined,
      );
      onClose();
    },
    onError: async (error) => {
      const ambiguous =
        error instanceof ApiError &&
        (error.status >= 500 || error.status === 0);
      if (ambiguous) setUncertain(true);
      else storage.write(`feedback-pending:${result.runId}`, "no");
      await app.sync();
    },
  });
  const options = action === "SAVE" ? saveReasons : skipReasons;
  return (
    <Modal
      open={!!action}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title={
        action === "SAVE"
          ? `為什麼收藏 ${result.companyName}？`
          : `為什麼略過 ${result.companyName}？`
      }
      description="選擇 1–4 個原因，幫助下一次研究更符合你的偏好。硬性篩選限制不會被修改。"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {action === "SAVE" && (
          <p className={s.hint}>
            若這檔股票已在追蹤清單，會保留既有論點，不會用本次研究覆蓋。
          </p>
        )}
        <fieldset
          disabled={mutation.isPending || uncertain}
          className={s.reasonChoices}
        >
          <legend className={s.srOnly}>回饋原因</legend>
          {options.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={reasons.includes(value)}
                disabled={!reasons.includes(value) && reasons.length >= 4}
                onChange={(e) =>
                  setReasons(
                    e.target.checked
                      ? [...reasons, value]
                      : reasons.filter((r) => r !== value),
                  )
                }
              />
              <span>{label(value)}</span>
            </label>
          ))}
        </fieldset>
        <label className={s.field}>
          補充說明（選填）
          <textarea
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
          />
          <small>{note.length} / 500 字</small>
        </label>
        <ErrorBox error={mutation.error} />
        {uncertain && (
          <div className={s.notice}>
            這筆操作的結果尚未確認，已停止重複提交。請先到
            <Link to="/activity" onClick={onClose}>
              回饋紀錄
            </Link>
            查看，必要時請後端確認。
          </div>
        )}
        <div className={s.actions}>
          <button
            type="button"
            className={s.button}
            onClick={onClose}
            disabled={mutation.isPending}
          >
            取消
          </button>
          <button
            className={s.primary}
            disabled={!reasons.length || mutation.isPending || uncertain}
          >
            {mutation.isPending
              ? "正在儲存…"
              : action === "SAVE"
                ? "收藏並追蹤"
                : "確認略過"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ResearchDetail({
  result,
  input,
  candidate,
  ranking,
  readOnly = false,
}: {
  readOnly?: boolean;
  result: ResearchResult;
  input?: ScreeningOutput;
  candidate?: QuantCandidate;
  ranking?: { score: number; quantScore: number; evidenceQuality: number };
}) {
  const app = useApp();
  const [section, setSection] = useState("overview");
  const [evidence, setEvidence] = useState<{
    title: string;
    status?: string;
    ids?: string[];
    quant?: QuantEvidence;
  } | null>(null);
  const [action, setAction] = useState<"SAVE" | "SKIP" | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const feedback = useQuery({
    queryKey: ["feedback"],
    queryFn: api.feedbackHistory,
    enabled: !!app.health.data?.personalization,
  });
  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    enabled: !!app.health.data?.watchlist,
  });
  const tracked = watchlist.data?.items.find(
    (item) => item.ticker === result.ticker,
  );
  const saved =
    !!tracked &&
    feedback.data?.feedback.some(
      (f) => f.runId === result.runId && f.action === "SAVE",
    );
  const skipped = feedback.data?.feedback.some(
    (f) => f.runId === result.runId && f.action === "SKIP",
  );
  const summary = result.verificationSummary;
  return (
    <article className={s.researchDetail}>
      <header className={s.companyHeading}>
        <div>
          <div className={s.stockMeta}>
            {result.ticker}
            {candidate && (
              <>
                <span>{label(candidate.market)}</span>
                <span>{candidate.industry || "產業未提供"}</span>
              </>
            )}
          </div>
          <h2>{result.companyName}</h2>
        </div>
        <Status value={result.status} />
      </header>
      {result.runId.startsWith("mock-") && (
        <p className={s.demoResearchNote}>
          這份論點與查證狀態是模擬研究；量化數值仍以各項資料期間與來源為準。
        </p>
      )}
      {candidate?.riskFlags.length ? (
        <div className={s.flags}>
          {candidate.riskFlags.map((flag) => (
            <span key={flag}>{label(flag)}</span>
          ))}
        </div>
      ) : null}
      <div className={s.inlineActions}>
        <button
          className={s.primary}
          disabled={
            readOnly ||
            !app.canWrite ||
            !app.health.data?.watchlist ||
            result.status !== "PUBLISHABLE" ||
            !result.thesis ||
            saved ||
            watchlist.isPending ||
            watchlist.isError
          }
          onClick={() => setAction("SAVE")}
        >
          <BookmarkPlus size={17} />
          {saved
            ? "本次研究已收藏"
            : tracked
              ? "已追蹤，補充回饋"
              : "收藏並追蹤"}
        </button>
        <button
          className={s.button}
          disabled={
            readOnly ||
            !app.canWrite ||
            !app.health.data?.personalization ||
            skipped
          }
          onClick={() => setAction("SKIP")}
        >
          <SkipForward size={17} />
          {skipped ? "已記錄略過" : "略過並回饋"}
        </button>
      </div>
      {tracked && (
        <div className={s.trackingNext}>
          <span>已在追蹤清單中，後續可對照新證據與論點版本。</span>
          <Link
            className={s.textButton}
            to={`/watchlist?thesis=${encodeURIComponent(tracked.thesisId)}`}
          >
            查看追蹤與筆記
            <ChevronRight size={16} />
          </Link>
        </div>
      )}
      {watchlist.isError && (
        <ErrorBox
          error={watchlist.error}
          retry={() => void watchlist.refetch()}
        />
      )}
      {change && (
        <div className={s.notice}>
          <strong>回饋已生效，下次研究會使用新權重</strong>
          <WeightsView weights={change.after} delta={change.delta} />
          <p>目前閱讀的排序保持不變。</p>
          <Link to="/preferences">查看偏好歷史</Link>
        </div>
      )}
      <nav className={s.detailTabs} aria-label="研究內容">
        {[
          ["overview", "重點總覽", "總覽"],
          [
            "evidence",
            `證據查核 ${result.claims.length}`,
            `查證 ${result.claims.length}`,
          ],
          [
            "risks",
            `風險與失效 ${result.risks.length}`,
            `風險 ${result.risks.length}`,
          ],
          ["history", "研究紀錄", "紀錄"],
        ].map(([key, title, short]) => (
          <button
            key={key}
            aria-label={title}
            aria-pressed={section === key}
            onClick={() => setSection(key)}
          >
            <span className={s.desktopTabLabel}>{title}</span>
            <span className={s.mobileTabLabel}>{short}</span>
          </button>
        ))}
      </nav>
      <div hidden={section !== "overview"}>
        <section className={s.thesisLead}>
          <h3>目前研究論點</h3>
          <p>{result.thesis || "這次研究尚未形成可發布論點。"}</p>
          {result.status !== "PUBLISHABLE" && (
            <p className={s.hint}>{label(result.stopReason)}</p>
          )}
        </section>
        {candidate && (
          <section className={s.section}>
            <h3>
              量化線索{" "}
              <small>
                {candidate.percentileScope === "industry"
                  ? "同產業比較"
                  : "全市場比較"}
              </small>
            </h3>
            <div className={s.quantGrid}>
              {Object.entries(candidate.metrics).map(([name, item]) => {
                const quant = input?.evidence.find(
                  (e) =>
                    e.id.toLowerCase() === item.evidenceId.toLowerCase() &&
                    e.stockId === candidate.stockId,
                );
                return (
                  <button
                    key={name}
                    className={s.metricButton}
                    onClick={() =>
                      setEvidence({
                        title: quant?.claim || label(name),
                        status: quant?.verificationStatus,
                        quant,
                        ids: quant ? undefined : [item.evidenceId],
                      })
                    }
                  >
                    <span>{label(name)}</span>
                    <strong>{metric(item.value, name)}</strong>
                    <small>
                      {item.percentile == null
                        ? "未提供百分位"
                        : `${name === "debtRatio" ? "財務安全度" : "指標"}百分位 ${percent(item.percentile)}`}
                    </small>
                    <FileSearch size={16} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {result.risks.length > 0 && (
          <div className={s.riskOverview}>
            <div>
              <strong>閱讀論點時，也請留意</strong>
              <p>{result.risks.map((risk) => risk.title).join("；")}</p>
            </div>
            <button
              className={s.textButton}
              onClick={() => setSection("risks")}
            >
              檢視風險與失效條件
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <section className={s.section}>
          <h3>值得研究的理由</h3>
          <ul className={s.reasons}>
            {result.keyReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          {!result.keyReasons.length && (
            <p className={s.muted}>尚未提供研究理由。</p>
          )}
        </section>
      </div>
      <div hidden={section !== "evidence"}>
        <section className={s.section}>
          <div className={s.sectionTitle}>
            <h3>支持證據</h3>
            <span className={s.muted}>{result.claims.length} 項論述</span>
          </div>
          {result.claims.map((claim) => (
            <div className={s.claim} key={claim.claimId}>
              <Status value={claim.status} />
              <p>{claim.text}</p>
              <button
                className={s.textButton}
                onClick={() =>
                  setEvidence({
                    title: claim.text,
                    status: claim.status,
                    ids: claim.sourceIds,
                  })
                }
              >
                查閱 {claim.sourceIds.length} 個來源
                <ChevronRight size={15} />
              </button>
            </div>
          ))}
          {!result.claims.length && (
            <p className={s.notice}>尚未建立可查證的論述。</p>
          )}
          <dl className={s.verification}>
            <div>
              <dt>核心論述覆蓋</dt>
              <dd>{percent(summary.coreClaimCoverage)}</dd>
            </div>
            <div>
              <dt>主要來源比例</dt>
              <dd>{percent(summary.primarySourceRatio)}</dd>
            </div>
            <div>
              <dt>未解決衝突</dt>
              <dd>{summary.unresolvedConflicts} 項</dd>
            </div>
          </dl>
          <p className={s.hint}>
            資料新鮮度：{label(summary.freshness || "UNKNOWN")}
            。以上為證據完整度，不是上漲機率或投資信心。
          </p>
        </section>
      </div>
      <div hidden={section !== "risks"}>
        <section className={`${s.section} ${s.risks}`}>
          <h3>主要風險</h3>
          {result.risks.map((risk, i) => (
            <div className={s.risk} key={i}>
              <h4>{risk.title}</h4>
              <p>{risk.explanation}</p>
              {risk.addressesRiskFlags?.length ? (
                <p className={s.hint}>
                  回應上游旗標：{risk.addressesRiskFlags.map(label).join("、")}
                  ；不表示風險已消失。
                </p>
              ) : null}
              <button
                className={s.textButton}
                onClick={() =>
                  setEvidence({
                    title: `${risk.title}：${risk.explanation}`,
                    ids: risk.sourceIds,
                  })
                }
              >
                檢視風險依據
                <ChevronRight size={15} />
              </button>
            </div>
          ))}
          {!result.risks.length && (
            <p>尚未回傳風險辨識結果，不代表沒有風險。</p>
          )}
        </section>
        <section className={s.section}>
          <h3>什麼情況下需要重新評估？</h3>
          <ul className={s.reasons}>
            {result.invalidationConditions.map((condition, i) => (
              <li key={i}>{condition}</li>
            ))}
          </ul>
          {!result.invalidationConditions.length && (
            <p>尚未提供論點失效條件。</p>
          )}
        </section>
      </div>
      <div hidden={section !== "history"}>
        {ranking && (
          <details className={s.disclosure}>
            <summary>查看研究排序分數</summary>
            <dl className={s.definition}>
              <dt>綜合排序</dt>
              <dd>{ranking.score.toFixed(4)}</dd>
              <dt>量化分數</dt>
              <dd>{ranking.quantScore.toFixed(4)}</dd>
              <dt>證據品質分數</dt>
              <dd>{ranking.evidenceQuality.toFixed(4)}</dd>
            </dl>
            <p>分數由後端提供，只用於研究排序。</p>
          </details>
        )}
        <ResearchTrace result={result} />
        <JsonDetails
          title="研究識別資料"
          value={{
            runId: result.runId,
            screeningRunId: input?.run.runId,
            dataVersion: input?.run.dataVersion,
            sourceSnapshot: input?.run.sourceSnapshot ?? "未提供",
          }}
        />
      </div>
      <Modal
        open={!!evidence}
        onClose={() => setEvidence(null)}
        title="查證研究依據"
        description="對照原始來源、資料期間與驗證狀態。"
        panel
      >
        {evidence && <EvidenceContent {...evidence} sources={result.sources} />}
      </Modal>
      {action && (
        <FeedbackDialog
          key={`${result.runId}-${action}`}
          result={result}
          action={action}
          onClose={() => setAction(null)}
          onChange={setChange}
        />
      )}
    </article>
  );
}
