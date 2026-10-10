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
from .store import find_run, load_output as _load_output, next_run_id, save_run


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
