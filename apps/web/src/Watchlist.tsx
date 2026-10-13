import { useRef, useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  FileUp,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "./api";
import { useApp } from "./context-store";
import {
  PacketSchema,
  type CandidatePacket,
  type ResearchResult,
  type Thesis,
  type WatchItem,
} from "./contracts";
import { date, isNewerData, label, labels, readJson } from "./data";
import {
  Elapsed,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeading,
  Status,
} from "./ui";
import { EvidenceContent } from "./ResearchDetail";
import s from "./app.module.css";
import { useListNavigation } from "./useListNavigation";

function VersionContent({
  version,
  result,
  onEvidence,
}: {
  version: Thesis;
  result?: ResearchResult;
  onEvidence: (title: string, ids: string[], result?: ResearchResult) => void;
}) {
  return (
    <section className={s.version}>
      <div className={s.sectionTitle}>
        <h3>版本 {version.version}</h3>
        <Status value={version.status} />
      </div>
      <time>{date(version.createdAt)}</time>
      <p className={s.versionThesis}>{version.thesisText || "尚未形成論點"}</p>
      <h4>核心論述</h4>
      {version.coreClaims.map((claim) => (
        <div className={s.claim} key={claim.claimId}>
          <Status value={claim.status} />
          <p>{claim.text}</p>
          <button
            className={s.textButton}
            onClick={() => onEvidence(claim.text, claim.sourceIds, result)}
          >
            查看此版本來源
            <ChevronRight size={15} />
          </button>
        </div>
      ))}
      {version.supportingClaims.length > 0 && (
        <details className={s.disclosure}>
          <summary>補充論述</summary>
          {version.supportingClaims.map((claim) => (
            <div key={claim.claimId}>
              <Status value={claim.status} />
              <p>{claim.text}</p>
              <button
                className={s.textButton}
                onClick={() => onEvidence(claim.text, claim.sourceIds, result)}
              >
                查證來源
              </button>
            </div>
          ))}
        </details>
      )}
      <h4>主要風險</h4>
      {version.risks.map((risk, i) => (
        <div className={s.risk} key={i}>
          <strong>{risk.title}</strong>
          <p>{risk.explanation}</p>
          <button
            className={s.textButton}
            onClick={() => onEvidence(risk.explanation, risk.sourceIds, result)}
          >
            查看風險依據
          </button>
        </div>
      ))}
      <h4>失效條件</h4>
      <ul>
        {version.invalidationConditions.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
      {!result && (
        <p className={s.hint}>
          缺少能唯一對應此版本的研究文件；不使用其他版本同名來源代替。
        </p>
      )}
    </section>
  );
}

function WatchDetails({ item }: { item: WatchItem }) {
  const app = useApp();
  const feedback = useQuery({
    queryKey: ["feedback"],
    queryFn: api.feedbackHistory,
    enabled: !!app.health.data?.personalization,
  });
  const latestSave = feedback.data?.feedback
    .filter((f) => f.ticker === item.ticker && f.action === "SAVE")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const versions = useQuery({
    queryKey: ["versions", item.thesisId],
    queryFn: () => api.versions(item.thesisId),
  });
  const events = useQuery({
    queryKey: ["events", item.thesisId],
    queryFn: () => api.events(item.thesisId),
  });
  const runs = useQuery({
    queryKey: ["ticker-runs", item.ticker],
    queryFn: () => api.history(item.ticker),
  });
  const [versionNumber, setVersionNumber] = useState<number>();
  const [compareNumber, setCompareNumber] = useState(1);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fileError, setFileError] = useState<unknown>(null);
  const [fresh, setFresh] = useState<CandidatePacket | null>(null);
  const [eventType, setEventType] = useState("MANUAL_RECHECK");
  const [evidence, setEvidence] = useState<{
    title: string;
    ids: string[];
    result?: ResearchResult;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = [...(versions.data?.versions || [])].sort(
    (a, b) => a.version - b.version,
  );
  const selected =
    list.find((v) => v.version === versionNumber) || list[list.length - 1];
  const compared = list.find((v) => v.version === compareNumber) || list[0];
  function related(version: Thesis) {
    const matches = runs.data?.runs.filter(
      (run) =>
        run.result.completedAt === version.createdAt &&
        run.ticker === version.ticker,
    );
    return matches?.length === 1 ? matches[0].result : undefined;
  }
  const remove = useMutation({
    mutationFn: async () => {
      await app.assertWrite();
      return api.remove(item.ticker);
    },
    onSuccess: async () => {
      await app.sync();
      toast.success("已移除追蹤；歷史回饋與權重保持不變");
    },
  });
  const recheck = useMutation({
    mutationFn: async ({
      candidate,
      type,
    }: {
      candidate: CandidatePacket;
      type: string;
    }) => {
      await app.assertWrite();
      return api.recheck(item.ticker, candidate, type);
    },
    onSuccess: async () => {
      setFresh(null);
      setVersionNumber(undefined);
      await app.sync();
      toast.success("重查完成，已更新論點版本");
    },
    onError: () => {
      void app.sync();
    },
  });
  function scenario(value: string) {
    const candidate = structuredClone(item.candidate);
    candidate.dataSources = [
      ...(candidate.dataSources || []).filter(
        (x) => !x.source.startsWith("mock-scenario:"),
      ),
      { source: `mock-scenario:${value}`, asOf: candidate.asOf },
    ];
    recheck.mutate({ candidate, type: "MANUAL_RECHECK" });
  }
  return (
    <div className={s.watchDetail}>
      <header className={s.companyHeading}>
        <div>
          <div className={s.stockMeta}>
            {item.ticker} {label(item.candidate.market)}
          </div>
          <h2>{item.companyName}</h2>
        </div>
        <button
          className={s.textButton}
          disabled={!app.canWrite || recheck.isPending}
          onClick={() => setRemoveOpen(true)}
        >
          <Trash2 size={16} />
          移除追蹤
        </button>
      </header>
      <p className={s.muted}>
        收藏於 {date(item.createdAt)} · 最近檢查 {date(item.updatedAt)}
      </p>
      <ErrorBox
        error={versions.error || events.error || runs.error || recheck.error}
      />
      {versions.isLoading && <Loading />}
      <section className={s.watchNote} aria-label="收藏筆記">
        <h3>我為什麼收藏這檔股票？</h3>
        {latestSave ? (
          <>
            <p>{latestSave.reasons.map(label).join("、")}</p>
            {latestSave.note && <blockquote>{latestSave.note}</blockquote>}
            <small>
              最近一次收藏回饋 {date(latestSave.createdAt)}
              ；保留你當時的理由，不隨研究文字改寫。
            </small>
          </>
        ) : feedback.isLoading ? (
          <p>正在讀取收藏原因…</p>
        ) : feedback.isError ? (
          <ErrorBox
            error={feedback.error}
            retry={() => void feedback.refetch()}
          />
        ) : (
          <p>目前沒有可讀取的收藏回饋紀錄。</p>
        )}
      </section>
      {app.admin.data?.dailySchedulerEnabled === false && (
        <div className={s.schedulerInfo}>
          <span>
            目前未啟用每日自動研究；收藏後，需要後續重查才會產生新版本。
          </span>
          <Link to="/notifications" className={s.textButton}>
            查看通知與提醒設定
          </Link>
        </div>
      )}
      {selected && (
        <>
          <div className={s.thesisChange} data-status={selected.status}>
            <Status value={selected.status} />
            <p>
              {selected.changeReason
                ? labels[selected.changeReason] || selected.changeReason
                : "初始研究論點，尚無後續變化。"}
            </p>
            <Link to={`/runs/${encodeURIComponent(item.sourceResearchRunId)}`}>
              查看最近一次完整研究
            </Link>
          </div>
          {list.length === 1 && (
            <p className={s.hint}>
              已建立收藏時的研究論點，尚無後續版本可比較。收到新證據並完成重查後，這裡才會顯示論點變化。
            </p>
          )}
          {list.length > 1 && (
            <div className={s.versionControls}>
              <label>
                比較基準
                <select
                  value={compared?.version}
                  onChange={(e) => setCompareNumber(Number(e.target.value))}
                >
                  {list.map((v) => (
                    <option value={v.version} key={v.version}>
                      版本 {v.version}
                      {v.version === 1 ? "（收藏時）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                檢視版本
                <select
                  value={selected.version}
                  onChange={(e) => setVersionNumber(Number(e.target.value))}
                >
                  {list.map((v) => (
                    <option value={v.version} key={v.version}>
                      版本 {v.version} · {label(v.status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div
            className={
              list.length > 1 && compared?.version !== selected.version
                ? s.versionGrid
                : ""
            }
          >
            {list.length > 1 && compared?.version !== selected.version && (
              <VersionContent
                version={compared}
                result={related(compared)}
                onEvidence={(title, ids, result) =>
                  setEvidence({ title, ids, result })
                }
              />
            )}
            <VersionContent
              version={selected}
              result={related(selected)}
              onEvidence={(title, ids, result) =>
                setEvidence({ title, ids, result })
              }
            />
          </div>
        </>
      )}
      <section className={s.section}>
        <h3>論點事件</h3>
        <ol className={s.trace}>
          {events.data?.events.map((event) => (
            <li key={event.eventId}>
              <strong>{label(event.eventType)}</strong>
              <small>{date(event.occurredAt)}</small>
              <p>{labels[event.summary] || event.summary}</p>
            </li>
          ))}
        </ol>
      </section>
      <details className={s.disclosure}>
        <summary>以新資料重新檢查</summary>
        <p>
          正式研究可等待後端每日重查，或匯入資料端提供的全新個股資料包。此處不會把收藏時的舊資料當成新資料。
        </p>
        <div className={s.actions}>
          <button
            className={s.button}
            onClick={() => fileRef.current?.click()}
            disabled={!app.canWrite || recheck.isPending}
          >
            <FileUp size={16} />
            匯入新個股資料
          </button>
          <label>
            事件
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              {[
                "MONTHLY_REVENUE",
                "MATERIAL_DISCLOSURE",
                "NEWS",
                "MANUAL_RECHECK",
              ].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <input
          className={s.srOnly}
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          aria-label="新個股資料包"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const packet = PacketSchema.parse(await readJson(file));
              if (packet.ticker !== item.ticker)
                throw new Error("資料包股票代碼與目前追蹤股票不同。");
              if (!isNewerData(packet.asOf, item.candidate.asOf))
                throw new Error(
                  "無法確認這份資料比目前追蹤資料更新；請提供可解析且較新的資料日期，或使用後端每日重查。",
                );
              setFresh(packet);
              setFileError(null);
            } catch (error) {
              setFresh(null);
              setFileError(error);
            }
            e.target.value = "";
          }}
        />
        <ErrorBox error={fileError} />
        {fresh && (
          <div className={s.notice}>
            <p>
              已載入 {fresh.companyName}，資料時間 {date(fresh.asOf)}。
            </p>
            <button
              className={s.primary}
              disabled={recheck.isPending || !app.canWrite}
              onClick={() =>
                recheck.mutate({ candidate: fresh, type: eventType })
              }
            >
              使用新資料重查
            </button>
          </div>
        )}
      </details>
      {import.meta.env.DEV && app.detectedMode === "mock" && (
        <details className={s.devPanel}>
          <summary>開發展示：模擬論點事件</summary>
          <p>
            只測試 mock
            後端的狀態與通知。沿用範例資料日期，不代表取得新公告或真實研究。
          </p>
          <div className={s.actions}>
            {[
              ["weakened", "模擬論點削弱"],
              ["invalidated", "模擬論點失效"],
              ["conflict", "模擬來源衝突"],
            ].map(([value, text]) => (
              <button
                className={s.button}
                key={value}
                disabled={recheck.isPending || !app.canWrite}
                onClick={() => scenario(value)}
              >
                {text}
              </button>
            ))}
          </div>
        </details>
      )}
      {recheck.isPending && <Elapsed since={recheck.submittedAt} />}
      <Modal
        open={removeOpen}
        onClose={() => {
          if (!remove.isPending) setRemoveOpen(false);
        }}
        title={`停止追蹤 ${item.companyName}？`}
        description="只移除追蹤清單，不撤銷歷史回饋、研究權重或已產生的論點紀錄。"
      >
        <ErrorBox error={remove.error} />
        <button
          className={s.dangerButton}
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? "正在移除…" : "確認移除追蹤"}
        </button>
      </Modal>
      <Modal
        open={!!evidence}
        onClose={() => setEvidence(null)}
        title="此版本的證據"
        panel
      >
        {evidence && (
          <EvidenceContent
            title={evidence.title}
            ids={evidence.ids}
            sources={evidence.result?.sources}
          />
        )}
      </Modal>
    </div>
  );
}

export function Watchlist() {
  const app = useApp();
  const listNavigation = useListNavigation();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const query = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    enabled: !!app.health.data?.watchlist,
  });
  const items = query.data?.items || [];
  const theses = useQueries({
    queries: items.map((item) => ({
      queryKey: ["thesis", item.thesisId],
      queryFn: () => api.thesis(item.thesisId),
    })),
  });
  const needsAttention = (status?: string) =>
    status === "WEAKENED" || status === "INVALIDATED";
  const entries = items.map((item, index) => ({ item, thesis: theses[index] }));
  const attentionCount = entries.filter((x) =>
    needsAttention(x.thesis.data?.status),
  ).length;
  const rows = entries
    .filter(
      (x) =>
        (!attentionOnly || needsAttention(x.thesis.data?.status)) &&
        `${x.item.ticker} ${x.item.companyName}`.includes(search.trim()),
    )
    .sort(
      (a, b) =>
        Number(needsAttention(b.thesis.data?.status)) -
          Number(needsAttention(a.thesis.data?.status)) ||
        Date.parse(b.item.updatedAt) - Date.parse(a.item.updatedAt),
    );
  const requested = params.get("thesis");
  const selected = items.find((item) => item.thesisId === requested);
  const detail = !!selected && params.get("view") !== "list";
  return (
    <>
      <PageHeading title="追蹤清單" text="先看論點是否改變，再決定下一步。">
        <Link to="/" className={s.button}>
          尋找新的研究標的
        </Link>
      </PageHeading>
      <ErrorBox error={query.error} retry={() => void query.refetch()} />
      {query.isLoading && <Loading />}
      {app.health.data && !app.health.data.watchlist && (
        <p className={s.notice}>目前後端未啟用追蹤能力。</p>
      )}
      {query.data?.items.length === 0 && (
        <Empty
          title="把值得持續研究的股票放在這裡"
          icon={<Bookmark size={40} strokeWidth={1.3} />}
        >
          <p>
            在個股研究點「收藏並追蹤」，系統會保留當時的論點，方便之後對照新證據。
          </p>
          <Link to="/" className={s.primary}>
            前往選股研究
          </Link>
        </Empty>
      )}
      {requested && query.data && !selected && (
        <p className={s.notice}>
          這個論點已不在追蹤清單，或示範服務重啟後已清空。
          <button className={s.textButton} onClick={() => setParams({})}>
            查看目前清單
          </button>
        </p>
      )}
      {!!items.length && (
        <div hidden={detail}>
          <section className={s.explorer} aria-label="追蹤股票清單">
            <div className={s.explorerTop}>
              <div className={s.viewSwitch}>
                <button
                  aria-pressed={!attentionOnly}
                  onClick={() => setAttentionOnly(false)}
                >
                  全部追蹤 <span>{items.length}</span>
                </button>
                <button
                  aria-pressed={attentionOnly}
                  onClick={() => setAttentionOnly(true)}
                >
                  需重新評估 <span>{attentionCount}</span>
                </button>
              </div>
              <span className={s.explorerCaption}>論點削弱與失效優先顯示</span>
            </div>
            <div className={s.filterBar}>
              <label className={s.searchField}>
                <Search size={18} />
                <input
                  type="search"
                  placeholder="搜尋追蹤中的代號或名稱"
                  aria-label="搜尋追蹤股票"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {theses.some((t) => t.isError) && (
              <p className={s.notice}>
                部分論點暫時無法讀取，評估數量可能不完整。
                <button
                  className={s.textButton}
                  onClick={() =>
                    theses
                      .filter((t) => t.isError)
                      .forEach((t) => void t.refetch())
                  }
                >
                  重新讀取
                </button>
              </p>
            )}
            {theses.some((t) => t.isLoading) && (
              <p className={s.loading} role="status">
                正在確認追蹤論點…
              </p>
            )}
            <div className={s.watchRows}>
              {rows.map(({ item, thesis }) => (
                <button
                  className={s.watchSummary}
                  key={item.thesisId}
                  onClick={() =>
                    listNavigation.enter(() =>
                      setParams({ thesis: item.thesisId }),
                    )
                  }
                >
                  <span className={s.watchStock}>
                    <strong>{item.companyName}</strong>
                    <small>{item.ticker}</small>
                  </span>
                  <span>
                    {thesis.data ? (
                      <Status value={thesis.data.status} />
                    ) : (
                      <span className={s.muted}>
                        {thesis.isError ? "論點讀取失敗" : "正在讀取"}
                      </span>
                    )}
                  </span>
                  <span className={s.watchReason}>
                    {needsAttention(thesis.data?.status)
                      ? "新證據已改變原研究論點，請查看版本差異。"
                      : thesis.data?.status === "STRENGTHENED"
                        ? "新證據支持原論點，可查看新增依據。"
                        : "保留研究論點，持續觀察後續證據。"}
                    <small>最近檢查 {date(item.updatedAt)}</small>
                  </span>
                  <span className={s.watchOpen}>
                    查看變化
                    <ChevronRight size={17} />
                  </span>
                </button>
              ))}
            </div>
            {!rows.length && (
              <div className={s.noMatches}>
                <h3>
                  {search
                    ? "找不到這檔追蹤股票"
                    : "目前沒有論點削弱或失效的股票"}
                </h3>
                <p>可切回全部追蹤，查看每檔股票的最新版本。</p>
                <button
                  className={s.button}
                  onClick={() => {
                    setAttentionOnly(false);
                    setSearch("");
                  }}
                >
                  查看全部追蹤
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {detail && selected && (
        <div className={s.researchPage}>
          <div className={s.detailNav} data-detail-start tabIndex={-1}>
            <button
              className={s.textButton}
              onClick={() =>
                listNavigation.back(() =>
                  setParams({ thesis: selected.thesisId, view: "list" }),
                )
              }
            >
              <ArrowLeft size={17} />
              返回追蹤清單
            </button>
            <label>
              切換股票
              <select
                aria-label="切換追蹤股票"
                value={selected.thesisId}
                onChange={(e) => setParams({ thesis: e.target.value })}
              >
                {items.map((item) => (
                  <option key={item.thesisId} value={item.thesisId}>
                    {item.ticker} {item.companyName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <WatchDetails item={selected} key={selected.thesisId} />
        </div>
      )}
    </>
  );
}
