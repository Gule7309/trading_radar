from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from typing import Any, Mapping

WEIGHT_KEYS = ("growth", "profitability", "safety")
DEFAULT_MIN_LIQUIDITY = 100_000_000.0  # 新台幣元，20 日平均成交金額


class ScreeningError(RuntimeError):
    """Raised when a run cannot be produced honestly (e.g. no complete period)."""


def _snake(name: str) -> str:
    out = []
    for ch in name:
        if ch.isupper():
            out.append("_")
            ch = ch.lower()
        out.append(ch)
    return "".join(out)


def _normalise_keys(data: Mapping[str, Any]) -> dict[str, Any]:
    return {_snake(key): value for key, value in data.items()}


@dataclass(frozen=True)
class ScreeningConfig:
    """System parameters. 變更任何值都會改變 input_fingerprint，產生新的 run。"""

    version: str = "v1"
    revenue_coverage_threshold: float = 0.95
    financial_coverage_threshold: float = 0.95
    scan_periods: int = 6
    min_industry_size: int = 5
    turnover_window_days: int = 20
    notice_lookback_days: int = 30
    evidence_top_k: int = 50
    yoy_tolerance_pp: float = 0.1
    margin_tolerance_pp: float = 0.1
    debt_tolerance_pp: float = 0.1

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None) -> "ScreeningConfig":
        data = _normalise_keys(data or {})
        known = {f.name for f in fields(cls)}
        unknown = set(data) - known
        if unknown:
            raise ValueError(f"未知的 config 欄位：{sorted(unknown)}")
        config = cls(**data)
        if not 0 < config.revenue_coverage_threshold <= 1 or not 0 < config.financial_coverage_threshold <= 1:
            raise ValueError("coverage threshold 必須在 (0, 1]")
        if config.min_industry_size < 2 or config.turnover_window_days < 1 or config.evidence_top_k < 1:
            raise ValueError("min_industry_size／turnover_window_days／evidence_top_k 數值不合理")
        return config

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Profile:
    """使用者條件。hard constraints 在 percentile 之後才套用。

    min_liquidity 預設為 20 日平均成交金額 NT$1 億；傳入 None 或 0 可關閉。
    """

    excluded_industries: tuple[str, ...] = ()
    max_debt_ratio: float | None = None
    min_liquidity: float | None = DEFAULT_MIN_LIQUIDITY
    exclude_disposition: bool = True
    weights: Mapping[str, float] = field(default_factory=lambda: {k: 1.0 for k in WEIGHT_KEYS})

    def __post_init__(self) -> None:
        weights = {k: float(self.weights.get(k, 0.0)) for k in WEIGHT_KEYS}
        extra = set(self.weights) - set(WEIGHT_KEYS)
        if extra:
            raise ValueError(f"未知的 weights 欄位：{sorted(extra)}")
        if any(w < 0 for w in weights.values()) or sum(weights.values()) <= 0:
            raise ValueError("weights 必須非負且總和大於 0")
        object.__setattr__(self, "weights", weights)
        object.__setattr__(self, "excluded_industries", tuple(sorted(set(self.excluded_industries))))
        if self.max_debt_ratio is not None and self.max_debt_ratio <= 0:
            raise ValueError("max_debt_ratio 必須大於 0")
        if self.min_liquidity is not None and self.min_liquidity < 0:
            raise ValueError("min_liquidity 不可為負")

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None) -> "Profile":
        data = _normalise_keys(data or {})
        known = {f.name for f in fields(cls)}
        unknown = set(data) - known
        if unknown:
            raise ValueError(f"未知的 profile 欄位：{sorted(unknown)}")
        if "excluded_industries" in data:
            data["excluded_industries"] = tuple(data["excluded_industries"])
        return cls(**data)

    def to_dict(self) -> dict[str, Any]:
        """camelCase，與輸出文件一致。"""
        return {
            "excludedIndustries": list(self.excluded_industries),
            "maxDebtRatio": self.max_debt_ratio,
            "minLiquidity": self.min_liquidity,
            "excludeDisposition": self.exclude_disposition,
            "weights": dict(self.weights),
        }
