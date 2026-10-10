"""Percentile → user hard constraints → weighted score → rank.

順序是規格的一部分：percentile 先在通過 base exclusions 的股票之間算好，
使用者條件之後才套用，所以不同使用者條件不會改變任何公司的 percentile。
"""
from __future__ import annotations

from typing import Mapping

from .config import Profile, ScreeningConfig, WEIGHT_KEYS
from .metrics import Record

# 計分因子 → (指標名稱, 是否越高越好)
FACTORS: dict[str, tuple[str, bool]] = {
    "growth": ("revenue_yoy", True),
    "profitability": ("operating_margin", True),
    "safety": ("debt_ratio", False),
}


def average_rank_percentiles(values: Mapping[str, float]) -> dict[str, float]:
    """(平均名次 − 1) ÷ (n − 1)；同值取平均名次；n = 1 時為 0.5。"""
    n = len(values)
    if n == 1:
        return {key: 0.5 for key in values}
    items = sorted(values.items(), key=lambda kv: (kv[1], kv[0]))
    out: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and items[j + 1][1] == items[i][1]:
            j += 1
        percentile = ((i + 1 + j + 1) / 2 - 1) / (n - 1)
        for k in range(i, j + 1):
            out[items[k][0]] = round(percentile, 6)
        i = j + 1
    return out


def assign_percentiles(records: list[Record], config: ScreeningConfig) -> list[Record]:
    eligible = [r for r in records if r.exclusion_reason is None]
    market = {factor: average_rank_percentiles(_signed(eligible, metric, higher))
              for factor, (metric, higher) in FACTORS.items()}
    groups: dict[str, list[Record]] = {}
    for record in eligible:
        if record.industry is not None:
            groups.setdefault(record.industry, []).append(record)
    industry = {
        name: {factor: average_rank_percentiles(_signed(members, metric, higher))
               for factor, (metric, higher) in FACTORS.items()}
        for name, members in groups.items() if len(members) >= config.min_industry_size
    }
    for record in eligible:
        scoped = industry.get(record.industry) if record.industry is not None else None
        source = scoped if scoped is not None else market
        record.percentile_scope = "industry" if scoped is not None else "market"
        record.percentiles = {factor: source[factor][record.stock_id] for factor in FACTORS}
    return eligible


def _signed(records: list[Record], metric: str, higher_is_better: bool) -> dict[str, float]:
    sign = 1.0 if higher_is_better else -1.0
    return {r.stock_id: sign * r.metrics[metric].value for r in records}


def constraint_reason(record: Record, profile: Profile) -> str | None:
    if record.industry in profile.excluded_industries:
        return "excluded_industry"
    if profile.max_debt_ratio is not None and record.metrics["debt_ratio"].value > profile.max_debt_ratio:
        return "max_debt_ratio"
    if profile.min_liquidity is not None and record.metrics["avg_turnover_20d"].value < profile.min_liquidity:
        return "min_liquidity"
    if profile.exclude_disposition and record.disposition_flag:
        return "active_disposition"
    return None


def rank_records(records: list[Record], profile: Profile, config: ScreeningConfig) -> int:
    """就地更新 records；回傳通過 base exclusions 的檔數。"""
    eligible = assign_percentiles(records, config)
    survivors: list[Record] = []
    for record in eligible:
        reason = constraint_reason(record, profile)
        if reason is None:
            survivors.append(record)
        else:
            record.exclusion_reason = reason
    total_weight = sum(profile.weights[key] for key in WEIGHT_KEYS)
    for record in survivors:
        record.quant_score = round(
            sum(profile.weights[key] * record.percentiles[key] for key in WEIGHT_KEYS) / total_weight, 6)
    survivors.sort(key=lambda r: (-r.quant_score, r.stock_id))
    for rank, record in enumerate(survivors, start=1):
        record.rank = rank
    return len(eligible)
