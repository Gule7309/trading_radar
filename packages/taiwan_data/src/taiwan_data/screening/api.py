from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import date, datetime
from pathlib import Path
from typing import Any

from ..db import TAIPEI, DataStore, dataset_status_digest, now_iso
from .config import Profile, ScreeningConfig, ScreeningError
from .evidence import METRIC_KEYS, SourceRegistry, build_evidence
from .metrics import Periods, load_records, resolve_periods
from .ranking import rank_records
from .store import camel, find_run, load_output as _load_output, next_run_id, save_run


def get_candidates(
    store: DataStore,
    profile: Profile | None = None,
    *,
    as_of_date: date | str | None = None,
    limit: int = 20,
    config: ScreeningConfig | None = None,
    reuse: bool = True,
) -> dict[str, Any]:
    """建立（或重用）一次 screening run，回傳 run metadata、candidates 與 evidence。"""
    config = config or ScreeningConfig()
    if not 1 <= limit <= config.evidence_top_k:
        raise ValueError(f"limit 必須介於 1 與 evidence_top_k（{config.evidence_top_k}）之間")
    run_id = run_screening(store, profile, as_of_date=as_of_date, config=config, reuse=reuse)
    return load_output(store, run_id, limit=limit)


def get_candidate_snapshot(
    store: DataStore,
    stock_id: str,
    profile: Profile | None = None,
    *,
    as_of_date: date | str | None = None,
    config: ScreeningConfig | None = None,
) -> dict[str, Any]:
    """Return one base-eligible stock with fresh verified quantitative Evidence.

    This is for saved-thesis monitoring. User hard constraints are intentionally
    not applied: a saved stock must still be re-evaluated even if it would no
    longer pass the current discovery filter. Soft weights are preserved only
    for its contextual quantScore.
    """
    profile, config = profile or Profile(), config or ScreeningConfig()
    as_of = _as_date(as_of_date)
    store.ensure_schema()

    watch_profile = Profile(
        excluded_industries=(),
        max_debt_ratio=None,
        min_liquidity=0,
        exclude_disposition=False,
        weights=profile.weights,
    )

    with closing(store.connect()) as conn:
        periods = resolve_periods(conn, as_of, config)
        data_version = dataset_status_digest(conn)
        records = load_records(conn, periods, config, as_of)
        base_eligible = rank_records(records, watch_profile, config)

        record = next((item for item in records if item.stock_id == stock_id), None)
        if record is None:
            raise KeyError(f"找不到股票：{stock_id}")
        if record.exclusion_reason is not None or record.rank is None:
            raise ScreeningError(
                f"{stock_id} 無法建立可驗證 snapshot：{record.exclusion_reason or 'not_ranked'}"
            )

        registry = SourceRegistry(conn)
        evidence = [
            build_evidence(record, metric, f"ev-{index:03d}", periods, registry)
            for index, metric in enumerate(METRIC_KEYS, start=1)
        ]
        evidence_by_metric = {item.metric: item.id for item in evidence}

        factor_key = {
            "revenue_yoy": "growth",
            "operating_margin": "profitability",
            "debt_ratio": "safety",
        }
        metrics = {}
        for metric, output_key in METRIC_KEYS.items():
            metrics[output_key] = {
                "value": record.metrics[metric].value,
                "percentile": (
                    record.percentiles[factor_key[metric]]
                    if metric in factor_key
                    else None
                ),
                "evidenceId": evidence_by_metric[output_key],
            }

        by_reason: dict[str, int] = {}
        for item in records:
            if item.exclusion_reason is not None:
                by_reason[item.exclusion_reason] = by_reason.get(item.exclusion_reason, 0) + 1

        ranked = sum(1 for item in records if item.rank is not None)
        source_snapshot = _source_snapshot(store, data_version)

        return {
            "schemaVersion": "screening-output-v1",
            "run": {
                "runId": f"watch-{as_of.isoformat().replace('-', '')}-{stock_id}",
                "runAt": now_iso(),
                "asOfDate": periods.as_of_date,
                "priceAsOf": periods.price_as_of,
                "revenueAsOf": periods.revenue_month,
                "revenueCoverage": round(periods.revenue_coverage, 6),
                "financialAsOf": periods.financial_label,
                "financialCoverage": round(periods.financial_coverage, 6),
                "configVersion": config.version,
                "dataVersion": data_version,
                "sourceSnapshot": source_snapshot,
                "status": "success",
                "profile": watch_profile.to_dict(),
                "config": {camel(k): v for k, v in config.to_dict().items()},
                "counts": {
                    "universe": len(records),
                    "baseEligible": base_eligible,
                    "ranked": ranked,
                },
            },
            "candidates": [{
                "stockId": record.stock_id,
                "stockName": record.stock_name,
                "market": record.market,
                "industry": record.industry,
                "percentileScope": record.percentile_scope,
                "metrics": metrics,
                "riskFlags": [
                    flag
                    for flag, on in (
                        ("disposition", record.disposition_flag),
                        ("notice", record.notice_flag),
                    )
                    if on
                ],
                "quantScore": record.quant_score,
                "rank": record.rank,
            }],
            "evidence": [{
                "id": item.id,
                "stockId": item.stock_id,
                "metric": item.metric,
                "claim": item.claim,
                "value": item.value,
                "unit": item.unit,
                "dataset": item.dataset,
                "source": item.source,
                "sourceUrl": item.source_url,
                "referenceUrl": item.reference_url,
                "dataAsOf": item.data_as_of,
                "windowStart": item.window_start,
                "windowEnd": item.window_end,
                "fetchedAt": item.fetched_at,
                "fetchedAtScope": item.fetched_at_scope,
                "calculation": item.calculation,
                "verificationStatus": item.verification_status,
            } for item in evidence],
            "excluded": {
                "total": sum(by_reason.values()),
                "byStage": {
                    "base": sum(by_reason.values()),
                    "constraint": 0,
                },
                "byReason": by_reason,
            },
        }


def load_output(store: DataStore, run_id: str, *, limit: int = 20) -> dict[str, Any]:
    """只讀 screening_* 表，因此資料庫日後更新也能原樣重現當次輸出。"""
    with closing(store.connect()) as conn:
        return _load_output(conn, run_id, limit)


def run_screening(
    store: DataStore,
    profile: Profile | None = None,
    *,
    as_of_date: date | str | None = None,
    config: ScreeningConfig | None = None,
    reuse: bool = True,
) -> str:
    profile, config = profile or Profile(), config or ScreeningConfig()
    as_of = _as_date(as_of_date)
    store.ensure_schema()
    with closing(store.connect()) as conn:
        periods = resolve_periods(conn, as_of, config)
        data_version = dataset_status_digest(conn)
        fingerprint = _fingerprint(periods, profile, config, data_version)
        if reuse and (existing := find_run(conn, fingerprint)):
            return existing

        records = load_records(conn, periods, config, as_of)
        base_eligible = rank_records(records, profile, config)
        ranked = sorted((r for r in records if r.rank is not None), key=lambda r: r.rank)
        registry = SourceRegistry(conn)
        evidence = []
        for record in ranked[:config.evidence_top_k]:
            for metric in METRIC_KEYS:
                evidence.append(build_evidence(
                    record, metric, f"ev-{len(evidence) + 1:03d}", periods, registry))

        run_id = next_run_id(conn, datetime.now(TAIPEI).date().isoformat())
        save_run(
            conn, run_id=run_id, run_at=now_iso(), periods=periods, config=config.to_dict(),
            profile=profile.to_dict(), fingerprint=fingerprint, data_version=data_version,
            source_snapshot=_source_snapshot(store, data_version), universe=len(records),
            base_eligible=base_eligible, ranked=len(ranked), records=records, evidence=evidence)
        return run_id


def _as_date(value: date | str | None) -> date:
    if value is None:
        return datetime.now(TAIPEI).date()
    return value if isinstance(value, date) else date.fromisoformat(value)


def _source_snapshot(store: DataStore, data_version: str) -> str | None:
    """manifest 的 SHA-256。

    只有 manifest 記錄的 data_version 等於目前資料庫的 data_version 時才引用；資料更新後 manifest
    即視為過期並回傳 None（代表未知）。不比對檔案大小：screening 寫入與 WAL checkpoint 會改變大小。
    """
    manifest = store.path.with_suffix(".manifest.json")
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if data.get("data_version") == data_version and data.get("sha256"):
        return f"sha256:{data['sha256']}"
    return None


def _fingerprint(periods: Periods, profile: Profile, config: ScreeningConfig, data_version: str) -> str:
    payload = {
        "asOfDate": periods.as_of_date, "priceAsOf": periods.price_as_of,
        "revenueMonth": periods.revenue_month, "financialQuarter": periods.financial_quarter,
        "profile": profile.to_dict(), "config": config.to_dict(), "dataVersion": data_version,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
