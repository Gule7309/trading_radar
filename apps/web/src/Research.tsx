import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  FileUp,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { useApp } from "./context-store";
import { api } from "./api";
import { RESEARCH_OPTIONS } from "./research-options";
import type { Snapshot } from "./contracts";
import { failureExplanation, relatedFailedRun } from "./research-failure";
import {
  date,
  hardMatches,
  label,
  parseScreening,
  rankChanges,
  readJson,
} from "./data";
import {
  Elapsed,
  Empty,
  ErrorBox,
  JsonDetails,
  Loading,
  PageHeading,
  Status,
  WeightsView,
} from "./ui";
import { StockExplorer } from "./StockExplorer";
import { ResearchDetail } from "./ResearchDetail";
import s from "./app.module.css";
import { useListNavigation } from "./useListNavigation";

function BatchModelFailures({ snapshot }: { snapshot: Snapshot }) {
  const app = useApp();
  const failed = snapshot.result.rejectedOrSkipped.filter(
    (item) => item.stopReason === "MODEL_FAILURE",
  );
  const diagnostics = useQuery({
    queryKey: ["batch-model-failures", snapshot.id],
    enabled: failed.length > 0 && !!app.health.data?.ok,
    retry: false,
    queryFn: async () =>
      Promise.all(
        failed.map(async (item) => {
          const history = await api.history(item.ticker);
          return {
            ...item,
            run: relatedFailedRun(
              history.runs,
              item.candidateId,
              snapshot.createdAt,
            ),
          };
        }),
      ),
  });
  if (!failed.length) return null;
  return (
    <section className={s.error} role="alert">
      <div>
        <strong>{failed.length} 檔研究遇到模型執行問題</strong>
        <p>
          前後端已收到這次執行結果，但這些股票尚未產生可發布結論。模型失敗不代表股票被判定為不適合投資。
        </p>
        {diagnostics.isPending && <p>正在讀取相關診斷…</p>}
        {diagnostics.isError && <p>診斷暫時無法讀取，請到系統狀態確認連線。</p>}
        {diagnostics.data?.map((item) => (
          <div key={item.candidateId}>
            <p>
              <strong>{item.ticker}</strong>：
              {failureExplanation(
                item.run?.result.diagnostics
                  ?.map((d) => d.message)
                  .join("\n") || "",
              )}
            </p>
            {item.run ? (
              <p className={s.hint}>
                同候選最近一次失敗：{date(item.run.result.completedAt)} ·{" "}
                <Link to={`/runs/${encodeURIComponent(item.run.runId)}`}>
                  查看執行診斷
                </Link>
              </p>
            ) : (
              <p className={s.hint}>後端沒有可對應的歷史診斷。</p>
            )}
          </div>
        ))}
        <Link to="/system">檢查模型與連線</Link>
      </div>
    </section>
  );
}

export function Research() {
  const app = useApp();
  const [params, setParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const listNavigation = useListNavigation();
  const [fileError, setFileError] = useState<unknown>(null);
  const selectedId = params.get("snapshot");
  const current = selectedId
    ? app.snapshots.find((snapshot) => snapshot.id === selectedId)
    : app.snapshots[0];
  const selected =
    current?.result.top.find((item) => item.ticker === params.get("ticker")) ||
    current?.result.top[0];
  const detail = params.has("ticker") && params.get("view") !== "list";
  const matched =
    !!app.profile.data &&
    hardMatches(app.input, app.profile.data.hardConstraints);
  const busy = app.research.isPending || app.daily.isPending;
  const data = current?.input || app.input;
  const previous = current
    ? app.snapshots[app.snapshots.indexOf(current) + 1]
    : undefined;
  const sameInput =
    previous &&
    current &&
    JSON.stringify(previous.input) === JSON.stringify(current.input);
  const select = (ticker: string) => {
    listNavigation.enter(() => setParams({ snapshot: current!.id, ticker }));
  };
  return (
    <>
      <PageHeading
        title="選股研究"
        text="比較財務表現，找到值得深入查證的股票。"
      >
        <Link className={s.button} to="/preferences">
          <SlidersHorizontal size={16} />
          研究偏好
        </Link>
        <button
          className={s.primary}
          onClick={() => app.research.mutate()}
          disabled={
            !app.canWrite ||
            !app.health.data?.batchResearch ||
            !matched ||
            !app.inputReady ||
            busy ||
            !app.loaded
          }
        >
          <RefreshCw size={16} />
          {busy ? "研究處理中" : current ? "重新研究候選" : "開始本次研究"}
        </button>
      </PageHeading>
      {(current || app.inputReady) && (
        <div className={s.periodStrip}>
          <span>
            行情<strong>{data.run.priceAsOf}</strong>
          </span>
          <span>
            營收<strong>{data.run.revenueAsOf}</strong>
          </span>
          <span>
            財報<strong>{data.run.financialAsOf}</strong>
          </span>
          <span>
            {current ? "執行結果時間" : "篩選執行"}
            <strong>{date(current?.createdAt || data.run.runAt)}</strong>
          </span>
        </div>
      )}
      <p className={s.muted}>
        每輪最多研究 {RESEARCH_OPTIONS.researchLimit} 檔，同時處理{" "}
        {RESEARCH_OPTIONS.concurrency} 檔， 最多顯示 {RESEARCH_OPTIONS.topK}{" "}
        檔可發布結果。等待上限 300 秒。
      </p>
      <details className={s.dataTools}>
        <summary>資料與研究紀錄</summary>
        <div className={s.researchTools}>
          <label>
            研究紀錄
            <select
              aria-label="研究紀錄"
              value={current?.id || ""}
              onChange={(e) => setParams({ snapshot: e.target.value })}
            >
              <option value="" disabled>
                尚無研究
              </option>
              {app.snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {date(snapshot.createdAt)} / {snapshot.result.top.length} 檔
                </option>
              ))}
            </select>
          </label>
          <div className={s.actions}>
            <button
              className={s.textButton}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <FileUp size={16} />
              匯入篩選資料
            </button>
            <button
              className={s.textButton}
              disabled={
                !app.canWrite || !app.health.data?.proactiveDelivery || busy
              }
              onClick={() => app.daily.mutate(false)}
            >
              取得最新每日研究
              <ArrowRight size={15} />
            </button>
          </div>
          <input
            ref={fileRef}
            className={s.srOnly}
            type="file"
            accept=".json,application/json"
            aria-label="匯入篩選資料檔案"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                app.setInput(parseScreening(await readJson(file)));
                setFileError(null);
              } catch (error) {
                setFileError(error);
              }
              e.target.value = "";
            }}
          />
        </div>
      </details>
      <ErrorBox error={fileError || app.research.error || app.daily.error} />
      {current && <BatchModelFailures snapshot={current} />}
      {app.profile.isError && (
        <ErrorBox
          error={app.profile.error}
          retry={() => void app.profile.refetch()}
        />
      )}
      {app.inputReady && !matched && app.profile.data && (
        <div className={s.notice}>
          <strong>目前硬性限制與輸入資料不同</strong>
          <p>
            請取得最新每日研究，或匯入重新篩選的資料。收到新資料後才能開始研究，避免把舊候選誤當成符合新條件。
          </p>
        </div>
      )}
      {app.inputReady && JSON.stringify(app.input) !== JSON.stringify(data) && (
        <p className={s.notice}>
          已準備新的輸入（行情 {app.input.run.priceAsOf}、
          {app.input.candidates.length}{" "}
          筆候選）。目前仍顯示上次結果，開始研究後才更新。
        </p>
      )}
      {app.daily.data?.waitingForFreshData && (
        <div className={s.notice}>
          <strong>等待新資料，尚未完成每日研究</strong>
          <p>
            任務日 {app.daily.data.deliveryRun.localDate}；資料行情日{" "}
            {app.daily.data.deliveryRun.priceAsOf || "未提供"}
            。已取得的篩選資料可另行研究，但不代表今日資料。
          </p>
        </div>
      )}
      {app.daily.data?.reused && (
        <div className={s.notice}>
          今日任務已執行，後端回傳既有執行摘要。完整結果若未保存在此瀏覽器，請到
          <Link to="/activity">執行紀錄</Link>查看摘要；不會自動重跑。
        </div>
      )}
      {!!app.daily.data?.watchlistRechecks?.failed && (
        <div className={s.notice}>
          <strong>
            每日研究已回傳，但有 {app.daily.data.watchlistRechecks.failed}{" "}
            檔追蹤重查失敗
          </strong>
          {app.daily.data.watchlistRechecks.items
            .filter((item) => item.status === "FAILED")
            .map((item) => (
              <p key={item.ticker}>
                {item.ticker}：{item.error || "後端未提供失敗原因"}
              </p>
            ))}
          <Link to="/activity">查看送達與重查紀錄</Link>
        </div>
      )}
      {busy && (
        <Elapsed
          since={
            app.research.isPending
              ? app.research.submittedAt
              : app.daily.submittedAt
          }
        />
      )}
      {app.cacheError && <p className={s.notice}>{app.cacheError}</p>}
      {!app.loaded ? (
        <Loading />
      ) : selectedId && !current ? (
        <Empty title="這份本機研究紀錄不存在">
          <button className={s.button} onClick={() => setParams({})}>
            返回目前研究
          </button>
        </Empty>
      ) : !current && !app.inputReady ? (
        <Empty title="先匯入真實篩選資料">
          <p>
            選擇從市場資料庫產出的 screening JSON，確認資料日期後再開始研究。
          </p>
          <button
            className={s.primary}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp size={16} />
            匯入篩選資料
          </button>
        </Empty>
      ) : (
        <>
          {!current && (
            <div className={s.firstResearch}>
              <div>
                <strong>
                  先從 {app.input.candidates.length} 檔篩選候選開始
                </strong>
                <p>
                  比較現有財務數據，再按「開始本次研究」取得論點、風險與證據。
                </p>
              </div>
              <Link to="/preferences" className={s.textButton}>
                調整我的研究偏好
              </Link>
            </div>
          )}
          <div hidden={detail && !!selected}>
            <StockExplorer
              key={current?.id || app.input.run.runId}
              input={data}
              snapshot={current}
              onSelect={select}
            />
          </div>
          {detail && selected && current && (
            <div className={s.researchPage}>
              <div className={s.detailNav} data-detail-start tabIndex={-1}>
                <button
                  className={s.textButton}
                  onClick={() =>
                    listNavigation.back(() =>
                      setParams({
                        snapshot: current.id,
                        ticker: selected.ticker,
                        view: "list",
                      }),
                    )
                  }
                >
                  <ArrowLeft size={17} />
                  返回候選比較
                </button>
                <label>
                  切換股票{" "}
                  <select
                    aria-label="切換研究股票"
                    value={selected.ticker}
                    onChange={(e) => select(e.target.value)}
                  >
                    {current.result.top.map((item) => (
                      <option key={item.ticker} value={item.ticker}>
                        {item.ticker} {item.result.companyName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ResearchDetail
                key={selected.result.runId}
                result={selected.result}
                ranking={selected}
                input={current.input}
                candidate={current.input.candidates.find(
                  (c) => c.stockId === selected.ticker,
                )}
              />
            </div>
          )}
          {current && (
            <>
              <details className={s.disclosure}>
                <summary>
                  未入選項目與原因（{current.result.rejectedOrSkipped.length}）
                </summary>
                {current.result.rejectedOrSkipped.map((item) => (
                  <div className={s.recordRow} key={item.candidateId}>
                    <strong>{item.ticker}</strong>
                    <Status value={item.status} />
                    <span>{label(item.stopReason)}</span>
                  </div>
                ))}
                {!current.result.rejectedOrSkipped.length && (
                  <p>
                    後端未回傳拒絕或略過項目。排名在 Top-K
                    之外的已研究結果未包含於這個 API，不表示它們被拒絕。
                  </p>
                )}
                <JsonDetails
                  title="上游量化排除統計（不與研究拒絕混算）"
                  value={current.input.excluded}
                />
              </details>
              <details className={s.disclosure}>
                <summary>本輪偏好與前次排序比較</summary>
                <WeightsView weights={current.weights} />
                {sameInput && previous ? (
                  <>
                    <p>候選輸入相同；以下為兩次後端實際回傳順位。</p>
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>股票</th>
                            <th>前次</th>
                            <th>本次</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankChanges(previous, current).map((item) => (
                            <tr key={item.ticker}>
                              <td>{item.ticker}</td>
                              <td>{item.before ?? "未入選"}</td>
                              <td>
                                {item.after}
                                {item.before === item.after ? "（未變）" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p>尚無相同候選輸入的前次紀錄可比較。</p>
                )}
                <p className={s.hint}>權重改變不保證每次都改變名次。</p>
              </details>
            </>
          )}
        </>
      )}
      {app.inputReady && (
        <details className={s.disclosure}>
          <summary>目前待研究的篩選資料</summary>
          <p>
            {app.input.candidates.length} 筆候選；行情 {app.input.run.priceAsOf}
            。來源範圍 {app.input.run.counts.universe} 檔，來源排名{" "}
            {app.input.run.counts.ranked} 檔，並非本次全部持有或研究。
          </p>
          <JsonDetails title="篩選設定與資料版本" value={app.input.run} />
        </details>
      )}
    </>
  );
}

export function RunPage() {
  const { runId = "" } = useParams();
  const app = useApp();
  const query = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId),
    enabled: !!app.health.data?.ok,
  });
  const snapshot = app.snapshots.find((s) =>
    s.result.top.some((t) => t.result.runId === runId),
  );
  return (
    <>
      <PageHeading title="研究紀錄" text="閱讀這一次研究的論點、風險與來源。" />
      <Link to="/activity" className={s.textButton}>
        返回執行紀錄
      </Link>
      <ErrorBox error={query.error} retry={() => void query.refetch()} />
      {query.isLoading && <Loading />}
      {query.data && (
        <div className={s.paper}>
          <ResearchDetail
            result={query.data.result}
            input={snapshot?.input}
            candidate={snapshot?.input.candidates.find(
              (c) => c.stockId === query.data.ticker,
            )}
          />
        </div>
      )}
    </>
  );
}
