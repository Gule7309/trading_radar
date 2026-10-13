import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useApp } from "./context-store";
import {
  ArrowLeft,
  Bookmark,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowRight,
  Search,
  X,
  Columns3,
} from "lucide-react";
import type { QuantCandidate, ScreeningOutput, Snapshot } from "./contracts";
import { label, metric } from "./data";
import { EvidenceContent } from "./ResearchDetail";
import { Modal } from "./ui";
import s from "./app.module.css";

const columns = [
  ["revenueYoY", "營收年增率"],
  ["operatingMargin", "單季營益率"],
  ["debtRatio", "負債比"],
  ["avgTurnover20d", "日均成交額"],
] as const;

export function StockExplorer({
  input,
  snapshot,
  onSelect,
}: {
  input: ScreeningOutput;
  snapshot?: Snapshot;
  onSelect: (ticker: string) => void;
}) {
  const app = useApp();
  const watchlist = useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist,
    enabled: !!app.health.data?.watchlist,
  });
  const isTracked = (ticker: string) =>
    watchlist.data?.items.some((item) => item.ticker === ticker);
  const sourceBack = useRef<HTMLButtonElement>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const [scope, setScope] = useState<"research" | "candidates">(
    snapshot ? "research" : "candidates",
  );
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [sort, setSort] = useState("rank");
  const [ascending, setAscending] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [quantStock, setQuantStock] = useState<QuantCandidate | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (evidenceId) sourceBack.current?.focus();
    else if ((compare || quantStock) && sourceTrigger.current?.isConnected)
      sourceTrigger.current.focus();
  }, [evidenceId, compare, quantStock]);
  function showEvidence(id?: string) {
    if (!id) return;
    sourceTrigger.current = document.activeElement as HTMLElement;
    setEvidenceId(id);
  }
  function closeInspector() {
    setEvidenceId(null);
    setCompare(false);
    setQuantStock(null);
    sourceTrigger.current = null;
  }
  const published = snapshot?.result.top || [];
  const researchScope = scope === "research" && !!snapshot;
  const base = researchScope
    ? input.candidates.filter((c) =>
        published.some((p) => p.ticker === c.stockId),
      )
    : input.candidates;
  const rank = (c: QuantCandidate) =>
    researchScope
      ? (published.find((p) => p.ticker === c.stockId)?.rank ?? Infinity)
      : c.rank;
  const matchesSearch = (c: QuantCandidate) =>
    `${c.stockId} ${c.stockName} ${c.industry || ""}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  const filtered = base.filter(
    (c) => (!industry || c.industry === industry) && matchesSearch(c),
  );
  const otherMatches = researchScope
    ? input.candidates.filter(matchesSearch).length
    : 0;
  const rows = [...filtered].sort((a, b) => {
    const av = sort === "rank" ? rank(a) : a.metrics[sort]?.value;
    const bv = sort === "rank" ? rank(b) : b.metrics[sort]?.value;
    if (av == null) return bv == null ? a.stockId.localeCompare(b.stockId) : 1;
    if (bv == null) return -1;
    return (
      (ascending ? av - bv : bv - av) || a.stockId.localeCompare(b.stockId)
    );
  });
  const comparisons = chosen
    .map((id) => input.candidates.find((c) => c.stockId === id))
    .filter((c): c is QuantCandidate => !!c);
  const evidence = input.evidence.find(
    (e) => e.id.toLowerCase() === evidenceId?.toLowerCase(),
  );
  const toggle = (ticker: string) =>
    setChosen((previous) =>
      previous.includes(ticker)
        ? previous.filter((x) => x !== ticker)
        : previous.length < 3
          ? [...previous, ticker]
          : previous,
    );
  function order(key: string) {
    if (key === sort) setAscending(!ascending);
    else {
      setSort(key);
      setAscending(key === "rank" || key === "debtRatio");
    }
  }
  function open(c: QuantCandidate) {
    if (published.some((p) => p.ticker === c.stockId)) onSelect(c.stockId);
    else setQuantStock(c);
  }
  function value(c: QuantCandidate, key: string) {
    const m = c.metrics[key];
    return m == null ? "未提供" : metric(m.value, key);
  }
  return (
    <>
      <section className={s.explorer} aria-label="股票研究工作區">
        <div className={s.explorerTop}>
          <div className={s.viewSwitch} aria-label="候選範圍">
            <button
              disabled={!snapshot}
              aria-pressed={researchScope}
              onClick={() => {
                setScope("research");
                setIndustry("");
              }}
            >
              已發布研究 <span>{published.length}</span>
            </button>
            <button
              aria-pressed={!researchScope}
              onClick={() => {
                setScope("candidates");
                setIndustry("");
              }}
            >
              篩選候選 <span>{input.candidates.length}</span>
            </button>
          </div>
          <span className={s.explorerCaption}>
            {researchScope
              ? `本輪研究 ${snapshot?.result.researched} 檔，發布 ${published.length} 檔`
              : "上游篩選明細，尚非完整研究"}
          </span>
        </div>
        <div className={s.filterBar}>
          <label className={s.searchField}>
            <Search size={18} />
            <input
              type="search"
              aria-label="搜尋候選股票"
              placeholder="搜尋本輪候選：代號、名稱或產業"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="篩選產業"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="">所有產業</option>
            {[
              ...new Set(
                base.map((c) => c.industry).filter((x): x is string => !!x),
              ),
            ]
              .sort()
              .map((x) => (
                <option key={x}>{x}</option>
              ))}
          </select>
          <select
            aria-label="股票排序"
            value={`${sort}:${ascending ? "asc" : "desc"}`}
            onChange={(e) => {
              const [key, direction] = e.target.value.split(":");
              setSort(key);
              setAscending(direction === "asc");
            }}
          >
            <option value="rank:asc">原始排名</option>
            <option value="rank:desc">原始排名：由後到前</option>
            {columns.flatMap(([key, title]) => [
              <option key={`${key}:desc`} value={`${key}:desc`}>
                {title}：高到低
              </option>,
              <option key={`${key}:asc`} value={`${key}:asc`}>
                {title}：低到高
              </option>,
            ])}
          </select>
        </div>
        <div className={s.tableHint}>
          <span role="status">
            顯示 {rows.length} / {base.length} 檔
          </span>
          <span>
            {chosen.length === 1 ? "再選 1 檔即可比較" : "勾選 2–3 檔並排比較"}
          </span>
        </div>
        <div className={s.stockTableWrap}>
          <table className={s.stockTable}>
            <caption className={s.srOnly}>
              候選財務比較；營收 {input.run.revenueAsOf}，財報{" "}
              {input.run.financialAsOf}，成交資料 {input.run.priceAsOf}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className={s.srOnly}>選取比較</span>
                  <Columns3 size={16} aria-hidden="true" />
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sort === "rank"
                      ? ascending
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button onClick={() => order("rank")}>
                    股票 / 排名 <ArrowUpDown size={13} />
                  </button>
                </th>
                {columns.map(([key, title]) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={
                      sort === key
                        ? ascending
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <button onClick={() => order(key)}>
                      {title}
                      {sort === key ? (
                        ascending ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <ArrowUpDown size={13} />
                      )}
                    </button>
                    <small>
                      {key === "revenueYoY"
                        ? input.run.revenueAsOf
                        : key === "avgTurnover20d"
                          ? "近 20 個交易日"
                          : input.run.financialAsOf}
                    </small>
                  </th>
                ))}
                <th scope="col">需留意</th>
                <th scope="col">
                  <span className={s.srOnly}>閱讀股票</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const result = published.find((p) => p.ticker === c.stockId);
                return (
                  <tr
                    key={c.stockId}
                    data-chosen={chosen.includes(c.stockId) || undefined}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`比較 ${c.stockName}`}
                        checked={chosen.includes(c.stockId)}
                        disabled={
                          !chosen.includes(c.stockId) && chosen.length >= 3
                        }
                        onChange={() => toggle(c.stockId)}
                      />
                    </td>
                    <th scope="row">
                      <button
                        className={s.stockIdentity}
                        onClick={() => open(c)}
                      >
                        <span className={s.stockRank}>{rank(c)}</span>
                        <span>
                          <strong>
                            {c.stockName}
                            {isTracked(c.stockId) && (
                              <span className={s.trackedLabel}>
                                <Bookmark size={12} aria-hidden="true" />
                                已收藏
                              </span>
                            )}
                          </strong>
                          <small>
                            {c.stockId}　{label(c.market)}　
                            {c.industry || "產業未提供"}
                          </small>
                        </span>
                      </button>
                    </th>
                    {columns.map(([key]) => (
                      <td className={s.numeric} key={key}>
                        {value(c, key)}
                      </td>
                    ))}
                    <td className={s.flagCell}>
                      {c.riskFlags.length ? (
                        <span>{c.riskFlags.map(label).join("、")}</span>
                      ) : (
                        <span className={s.muted}>未列特殊旗標</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={s.rowOpen}
                        aria-label={`${result ? "閱讀研究" : "查看數據"} ${c.stockName}`}
                        onClick={() => open(c)}
                      >
                        {result ? "研究" : "數據"}
                        <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className={s.noMatches}>
            <h3>
              {base.length
                ? "目前範圍內沒有符合的股票"
                : "本輪沒有可顯示的股票"}
            </h3>
            <p>
              搜尋只涵蓋這份資料中的 {input.candidates.length}{" "}
              檔候選，並非全市場搜尋。
            </p>
            {industry && base.some(matchesSearch) ? (
              <button className={s.primary} onClick={() => setIndustry("")}>
                清除產業篩選，保留搜尋
              </button>
            ) : researchScope && otherMatches > 0 ? (
              <button
                className={s.primary}
                onClick={() => {
                  setScope("candidates");
                  setIndustry("");
                }}
              >
                到篩選候選查看 {otherMatches} 檔
              </button>
            ) : (
              <p>
                可換個代號或名稱；若需要其他標的，請調整研究偏好並取得新的篩選資料。
              </p>
            )}
            <button
              className={s.textButton}
              onClick={() => {
                setSearch("");
                setIndustry("");
              }}
            >
              清除搜尋與篩選
            </button>
          </div>
        )}
        <div className={s.mobileStocks}>
          {rows.map((c) => (
            <div className={s.mobileStock} key={c.stockId}>
              <div className={s.sectionTitle}>
                <button className={s.stockIdentity} onClick={() => open(c)}>
                  <span className={s.stockRank}>{rank(c)}</span>
                  <span>
                    <strong>
                      {c.stockName}
                      {isTracked(c.stockId) && (
                        <span className={s.trackedLabel}>
                          <Bookmark size={12} aria-hidden="true" />
                          已收藏
                        </span>
                      )}
                    </strong>
                    <small>
                      {c.stockId}　{label(c.market)}
                    </small>
                  </span>
                </button>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`比較 ${c.stockName}`}
                    checked={chosen.includes(c.stockId)}
                    disabled={!chosen.includes(c.stockId) && chosen.length >= 3}
                    onChange={() => toggle(c.stockId)}
                  />
                  比較
                </label>
              </div>
              <dl>
                {columns.map(([key, title]) => (
                  <div key={key}>
                    <dt>{title}</dt>
                    <dd>{value(c, key)}</dd>
                  </div>
                ))}
              </dl>
              <div className={s.sectionTitle}>
                <span className={c.riskFlags.length ? s.flagCell : s.muted}>
                  {c.riskFlags.map(label).join("、") || "未列特殊旗標"}
                </span>
                <button className={s.textButton} onClick={() => open(c)}>
                  {published.some((p) => p.ticker === c.stockId)
                    ? "閱讀研究"
                    : "查看數據"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className={s.explorerFoot}>
          <span>排序與篩選只影響畫面，不改變研究偏好。</span>
          <span>特殊旗標以外仍可能有研究風險。</span>
        </div>
      </section>
      {chosen.length > 0 && (
        <div className={s.compareBar}>
          <div>
            <strong>比較 {chosen.length} / 3 檔</strong>
            <div className={s.comparisonChips}>
              {comparisons.map((c) => (
                <button
                  key={c.stockId}
                  onClick={() => toggle(c.stockId)}
                  aria-label={`移除比較 ${c.stockName}`}
                >
                  {c.stockName}
                  <X size={13} />
                </button>
              ))}
            </div>
          </div>
          <div className={s.actions}>
            <button className={s.textButton} onClick={() => setChosen([])}>
              <X size={16} />
              清除
            </button>
            <button
              className={s.primary}
              data-comparison-trigger
              disabled={comparisons.length < 2}
              onClick={() => setCompare(true)}
            >
              <Columns3 size={17} />
              並排比較
            </button>
          </div>
        </div>
      )}
      <Modal
        open={compare || !!quantStock}
        onClose={closeInspector}
        title={
          evidenceId
            ? "量化數據來源"
            : compare
              ? "並排比較"
              : `${quantStock?.stockName || ""} ${quantStock?.stockId || ""}`
        }
        description={
          evidenceId
            ? "確認股票、數值、資料期間，再對照原始資料。"
            : compare
              ? "比較同一份篩選資料；閱讀研究後再決定是否收藏追蹤。"
              : "本輪尚無這檔股票的發布研究，可先查閱量化數據。"
        }
        wide={compare}
        panel={!compare}
      >
        {evidenceId && (
          <div className={s.comparisonEvidence}>
            <button
              ref={sourceBack}
              className={s.textButton}
              onClick={() => setEvidenceId(null)}
            >
              <ArrowLeft size={16} />
              {compare ? "返回比較，保留已選股票" : "返回個股數據"}
            </button>
            {evidence ? (
              <>
                <h3>
                  {
                    input.candidates.find((c) => c.stockId === evidence.stockId)
                      ?.stockName
                  }{" "}
                  {evidence.stockId}
                </h3>
                <EvidenceContent
                  title={evidence.claim}
                  status={evidence.verificationStatus}
                  quant={evidence}
                />
              </>
            ) : (
              <p>本份資料未提供對應來源，無法查證。</p>
            )}
          </div>
        )}
        <div hidden={!!evidenceId || !compare}>
          <MetricGuide />
          <p className={s.comparisonHint}>
            左右滑動查看各檔股票；指標名稱固定在左側。
          </p>
          <div className={s.comparisonWrap}>
            <table className={s.comparisonTable}>
              <thead>
                <tr>
                  <th scope="col">財務指標</th>
                  {comparisons.map((c) => (
                    <th scope="col" key={c.stockId}>
                      <strong>
                        {c.stockName}
                        {isTracked(c.stockId) && (
                          <span className={s.trackedLabel}>
                            <Bookmark size={12} aria-hidden="true" />
                            已收藏
                          </span>
                        )}
                      </strong>
                      <small>
                        {c.stockId}　{c.industry || "未提供產業"}
                      </small>
                      {published.some((p) => p.ticker === c.stockId) && (
                        <button
                          className={s.primary}
                          onClick={() => {
                            setCompare(false);
                            onSelect(c.stockId);
                          }}
                          aria-label={`閱讀研究 ${c.stockName}`}
                        >
                          閱讀研究
                          <ArrowRight size={15} />
                        </button>
                      )}
                      <button
                        className={s.textButton}
                        onClick={() => {
                          toggle(c.stockId);
                          if (chosen.length <= 2) setCompare(false);
                        }}
                        aria-label={`移除比較 ${c.stockName}`}
                      >
                        移除
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {columns.map(([key, title]) => (
                  <tr key={key}>
                    <th scope="row">
                      {title}
                      <small>
                        {key === "revenueYoY"
                          ? input.run.revenueAsOf
                          : key === "avgTurnover20d"
                            ? input.run.priceAsOf
                            : input.run.financialAsOf}
                      </small>
                    </th>
                    {comparisons.map((c) => (
                      <td key={c.stockId}>
                        <strong>{value(c, key)}</strong>
                        <button
                          className={s.textButton}
                          data-evidence-id={c.metrics[key]?.evidenceId}
                          onClick={() =>
                            showEvidence(c.metrics[key]?.evidenceId)
                          }
                          disabled={!c.metrics[key]?.evidenceId}
                        >
                          查數據來源
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row">特殊旗標</th>
                  {comparisons.map((c) => (
                    <td key={c.stockId}>
                      {c.riskFlags.map(label).join("、") || "未列特殊旗標"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">研究狀態</th>
                  {comparisons.map((c) => (
                    <td key={c.stockId}>
                      {published.some((p) => p.ticker === c.stockId)
                        ? "已有發布研究"
                        : "本輪未提供發布研究"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div hidden={!!evidenceId || !quantStock}>
          {quantStock && (
            <>
              <p>
                {label(quantStock.market)}　{quantStock.industry}
              </p>
              <div className={s.quantGrid}>
                {columns.map(([key, title]) => (
                  <button
                    className={s.metricButton}
                    key={key}
                    onClick={() =>
                      showEvidence(quantStock.metrics[key]?.evidenceId)
                    }
                  >
                    <span>{title}</span>
                    <strong>{value(quantStock, key)}</strong>
                    <small>查看數據來源</small>
                  </button>
                ))}
              </div>
              <p className={s.notice}>
                {quantStock.riskFlags.map(label).join("、") ||
                  "上游未列特殊旗標，不代表沒有風險。"}
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

function MetricGuide() {
  return (
    <details className={s.metricGuide}>
      <summary>這些數字代表什麼？</summary>
      <dl>
        <dt>營收年增率</dt>
        <dd>
          當月營收相對去年同月的變化。這裡不是股價漲跌幅，也不是全年成長率。
        </dd>
        <dt>單季營益率</dt>
        <dd>該季營業利益占營收的比例。比較時請同時確認季度與產業。</dd>
        <dt>負債比</dt>
        <dd>負債占資產的比例，不是借款利率。數字較低不代表沒有投資風險。</dd>
        <dt>日均成交額</dt>
        <dd>
          近 20 個交易日平均每日成交金額，單位為新臺幣億元，不是股價或報酬率。
        </dd>
      </dl>
    </details>
  );
}
