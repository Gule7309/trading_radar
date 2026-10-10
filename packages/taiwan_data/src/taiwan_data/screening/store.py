"""Persist a screening run and read it back as the output document.

輸出文件只由 screening_* 三張表組成，不再查原始資料表，所以舊 run 在資料更新後仍可原樣讀出。
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .evidence import METRIC_KEYS, Evidence
from .metrics import Periods, Record

SCHEMA_VERSION = "screening-output-v1"
# 使用者條件造成的排除原因；其餘皆為 base exclusions。每檔股票只記錄第一個命中的原因。
CONSTRAINT_REASONS = frozenset({"excluded_industry", "max_debt_ratio", "min_liquidity", "active_disposition"})


def camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


def next_run_id(conn: sqlite3.Connection, run_date: str) -> str:
    prefix = run_date.replace("-", "")
    # 取最大序號而非筆數：刪除過 run 或序號有空洞時，用筆數推算會撞號。
    last = conn.execute(
        "SELECT MAX(CAST(substr(run_id, 10) AS INTEGER)) FROM screening_runs WHERE run_id LIKE ?",
        (prefix + "-%",)).fetchone()[0]
    return f"{prefix}-{(last or 0) + 1:03d}"


def find_run(conn: sqlite3.Connection, fingerprint: str) -> str | None:
    row = conn.execute(
        "SELECT run_id FROM screening_runs WHERE input_fingerprint = ? AND status = 'success' "
        "ORDER BY run_id LIMIT 1", (fingerprint,)).fetchone()
    return row[0] if row else None


def save_run(
    conn: sqlite3.Connection, *, run_id: str, run_at: str, periods: Periods, config: dict[str, Any],
    profile: dict[str, Any], fingerprint: str, data_version: str, source_snapshot: str | None,
    universe: int, base_eligible: int, ranked: int, records: list[Record], evidence: list[Evidence],
) -> None:
    with conn:
        conn.execute(
            "INSERT INTO screening_runs (run_id, run_at, as_of_date, price_as_of, revenue_as_of, "
            "revenue_coverage, financial_as_of, financial_coverage, config_version, config_json, "
            "profile_json, input_fingerprint, data_version, source_snapshot, universe_count, "
            "base_eligible_count, ranked_count, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (run_id, run_at, periods.as_of_date, periods.price_as_of, periods.revenue_month,
             round(periods.revenue_coverage, 6), periods.financial_label,
             round(periods.financial_coverage, 6), config["version"],
             json.dumps(config, sort_keys=True), json.dumps(profile, sort_keys=True), fingerprint,
             data_version, source_snapshot, universe, base_eligible, ranked, "success"))
        conn.executemany(
            "INSERT INTO screening_results (run_id, stock_id, stock_name, market, industry, "
            "revenue_yoy, operating_margin, debt_ratio, avg_turnover_20d, revenue_yoy_status, "
            "operating_margin_status, debt_ratio_status, avg_turnover_20d_status, revenue_yoy_pctl, "
            "operating_margin_pctl, debt_ratio_pctl, percentile_scope, notice_flag, disposition_flag, "
            "quant_score, rank, exclusion_reason, data_as_of) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [_result_row(run_id, r, periods) for r in records])
        conn.executemany(
            "INSERT INTO screening_evidence (run_id, id, stock_id, metric, claim, value, unit, dataset, "
            "source, source_url, reference_url, data_as_of, window_start, window_end, fetched_at, "
            "fetched_at_scope, calculation_json, verification_status) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(run_id, e.id, e.stock_id, e.metric, e.claim, e.value, e.unit, e.dataset, e.source,
              e.source_url, e.reference_url, e.data_as_of, e.window_start, e.window_end, e.fetched_at,
              e.fetched_at_scope, json.dumps(e.calculation, ensure_ascii=False, sort_keys=True),
              e.verification_status) for e in evidence])


def _result_row(run_id: str, r: Record, periods: Periods) -> tuple:
    def value(metric):
        return r.metrics[metric].value if metric in r.metrics else None

    def status(metric):
        return r.metrics[metric].status if metric in r.metrics else None

    return (run_id, r.stock_id, r.stock_name, r.market, r.industry,
            value("revenue_yoy"), value("operating_margin"), value("debt_ratio"), value("avg_turnover_20d"),
            status("revenue_yoy"), status("operating_margin"), status("debt_ratio"),
            status("avg_turnover_20d"),
            r.percentiles.get("growth"), r.percentiles.get("profitability"), r.percentiles.get("safety"),
            r.percentile_scope, int(r.notice_flag), int(r.disposition_flag), r.quant_score, r.rank,
            r.exclusion_reason, periods.price_as_of)


def load_output(conn: sqlite3.Connection, run_id: str, limit: int) -> dict[str, Any]:
    run = conn.execute("SELECT * FROM screening_runs WHERE run_id = ?", (run_id,)).fetchone()
    if run is None:
        raise KeyError(f"找不到 screening run：{run_id}")
    top_k = json.loads(run["config_json"]).get("evidence_top_k", 50)
    if not 1 <= limit <= top_k:
        raise ValueError(f"limit 必須介於 1 與此 run 的 evidence_top_k（{top_k}）之間")
    rows = conn.execute(
        "SELECT * FROM screening_results WHERE run_id = ? AND rank IS NOT NULL AND rank <= ? "
        "ORDER BY rank", (run_id, limit)).fetchall()
    evidence_by_key = {(e["stock_id"], e["metric"]): e["id"] for e in conn.execute(
        "SELECT stock_id, metric, id FROM screening_evidence WHERE run_id = ?", (run_id,))}
    stock_ids = [r["stock_id"] for r in rows]

    candidates = []
    for r in rows:
        metrics = {}
        for metric, key in METRIC_KEYS.items():
            percentile = {"revenue_yoy": "revenue_yoy_pctl", "operating_margin": "operating_margin_pctl",
                          "debt_ratio": "debt_ratio_pctl"}.get(metric)
            metrics[key] = {
                "value": r[metric],
                "percentile": r[percentile] if percentile else None,
                "evidenceId": evidence_by_key[(r["stock_id"], key)],
            }
        candidates.append({
            "stockId": r["stock_id"], "stockName": r["stock_name"], "market": r["market"],
            "industry": r["industry"], "percentileScope": r["percentile_scope"], "metrics": metrics,
            "riskFlags": [flag for flag, on in (("disposition", r["disposition_flag"]),
                                                ("notice", r["notice_flag"])) if on],
            "quantScore": r["quant_score"], "rank": r["rank"],
        })

    marks = ",".join("?" * len(stock_ids)) or "NULL"
    evidence = [{
        "id": e["id"], "stockId": e["stock_id"], "metric": e["metric"], "claim": e["claim"],
        "value": e["value"], "unit": e["unit"], "dataset": e["dataset"], "source": e["source"],
        "sourceUrl": e["source_url"], "referenceUrl": e["reference_url"], "dataAsOf": e["data_as_of"],
        "windowStart": e["window_start"], "windowEnd": e["window_end"], "fetchedAt": e["fetched_at"],
        "fetchedAtScope": e["fetched_at_scope"], "calculation": json.loads(e["calculation_json"]),
        "verificationStatus": e["verification_status"],
    } for e in conn.execute(
        f"SELECT * FROM screening_evidence WHERE run_id = ? AND stock_id IN ({marks}) ORDER BY id",
        (run_id, *stock_ids))]

    by_reason = {r[0]: r[1] for r in conn.execute(
        "SELECT exclusion_reason, COUNT(*) FROM screening_results WHERE run_id = ? "
        "AND exclusion_reason IS NOT NULL GROUP BY exclusion_reason ORDER BY exclusion_reason", (run_id,))}
    config = json.loads(run["config_json"])
    constraint = sum(n for reason, n in by_reason.items() if reason in CONSTRAINT_REASONS)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "run": {
            "runId": run["run_id"], "runAt": run["run_at"], "asOfDate": run["as_of_date"],
            "priceAsOf": run["price_as_of"], "revenueAsOf": run["revenue_as_of"],
            "revenueCoverage": run["revenue_coverage"], "financialAsOf": run["financial_as_of"],
            "financialCoverage": run["financial_coverage"], "configVersion": run["config_version"],
            "dataVersion": run["data_version"], "sourceSnapshot": run["source_snapshot"],
            "status": run["status"], "profile": json.loads(run["profile_json"]),
            "config": {camel(k): v for k, v in config.items()},
            "counts": {"universe": run["universe_count"], "baseEligible": run["base_eligible_count"],
                       "ranked": run["ranked_count"]},
        },
        "candidates": candidates,
        "evidence": evidence,
        "excluded": {
            "total": sum(by_reason.values()),
            # 對帳：universe = ranked + excluded.total；excluded.total = base + constraint
            "byStage": {"base": sum(by_reason.values()) - constraint, "constraint": constraint},
            "byReason": by_reason,
        },
    }
