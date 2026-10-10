"""Screening 規格測試。

合成資料庫（見 seed）的設計讓每個數字都能手算：
  甲業 A1..A6（6 檔，產業內 percentile）：
    營收 YoY = 10k %（k = 1..6），營業利益率 = [20, 40, 10, 35, 30, 25]，負債比 = [30, 50, 10, 60, 20, 40]
  乙業 B1..B3（3 檔 < 5，退回全市場 percentile）
  特殊個案：N1 注意股、D1 處置中、C1 營收 YoY 與來源值衝突、P1 只有 10 日行情、
            R1 無去年同月營收、S1 只有 2026Q1 財報、K1 銀行、F1 無財報、X1 已下市。
"""
import json
import sqlite3
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path

import jsonschema
import pytest

from taiwan_data import cli
from taiwan_data.db import DataStore
from taiwan_data.screening import Profile, ScreeningConfig, ScreeningError, get_candidates, load_output, run_screening
from taiwan_data.screening.metrics import add_months

SCHEMA = json.loads(
    (Path(__file__).parents[1] / "src/taiwan_data/screening/screening-output.schema.json")
    .read_text(encoding="utf-8"))
FIXTURE = Path(__file__).parent / "fixtures" / "sample_screening_output.json"

DATES = [(date(2026, 9, 14) + timedelta(days=i)).isoformat() for i in range(25)]  # 09-14 .. 10-08
WINDOW = DATES[-20:]
CFG = ScreeningConfig(financial_coverage_threshold=0.9)  # 合成資料 Q2/Q1 = 14/15

A_OI = [200, 400, 100, 350, 300, 250]
A_LIAB = [300, 500, 100, 600, 200, 400]
MAIN = {}
for k in range(1, 7):
    MAIN[f"A{k}"] = dict(industry="甲業", market="TWSE", rev=100 + 10 * k, prior=100,
                         oi=A_OI[k - 1], liab=A_LIAB[k - 1], turnover=1e9 * k)
for k, (rev, oi, liab) in enumerate([(120, 150, 450), (130, 250, 350), (140, 350, 250)], start=1):
    MAIN[f"B{k}"] = dict(industry="乙業", market="TPEX" if k == 1 else "TWSE", rev=rev, prior=100,
                         oi=oi, liab=liab, turnover=5e8 * k)
MAIN["N1"] = dict(industry="丙業", market="TWSE", rev=133, prior=100, oi=220, liab=350, turnover=7e8)
MAIN["D1"] = dict(industry="丙業", market="TWSE", rev=150, prior=100, oi=300, liab=200, turnover=8e8)
MAIN["C1"] = dict(industry="丁業", market="TWSE", rev=150, prior=100, oi=210, liab=300, turnover=6e8,
                  source_yoy=20.0)
MAIN["P1"] = dict(industry="丁業", market="TWSE", rev=125, prior=100, oi=230, liab=320, turnover=6e8,
                  days=10)
MAIN["R1"] = dict(industry="丁業", market="TWSE", rev=120, prior=None, oi=240, liab=310, turnover=6e8)
EXPECTED_A = {  # (growth, profitability, safety) percentile，手算
    "A1": (0.0, 0.2, 0.6), "A2": (0.2, 1.0, 0.2), "A3": (0.4, 0.0, 1.0),
    "A4": (0.6, 0.8, 0.0), "A5": (0.8, 0.6, 0.8), "A6": (1.0, 0.4, 0.4),
}


def _quarter_row(stock_id, year, quarter, spec, available, statement_type="general", oi="spec"):
    revenue_q, assets = 1000, 1000
    income = spec["oi"] if oi == "spec" else oi
    return {
        "stock_id": stock_id, "year": year, "quarter": quarter, "revenue_quarter": revenue_q,
        "operating_income_quarter": income,
        "operating_margin_quarter": None if income is None else income / revenue_q * 100,
        "total_assets": assets, "total_liabilities": spec["liab"],
        "debt_ratio": spec["liab"] / assets * 100, "available_date": available,
        "statement_type": statement_type, "source_kind": "mops_historical",
        "market": spec["market"], "fetched_at": "2026-10-10T08:53:01+08:00",
    }


def seed(path, september=None):
    store = DataStore(path)
    store.ensure_schema()
    stocks = [{"stock_id": sid, "stock_name": f"股票{sid}", "market": s["market"],
               "industry_code": s["industry"], "is_active": 1} for sid, s in MAIN.items()]
    stocks += [
        {"stock_id": "X1", "stock_name": "已下市", "market": "TWSE", "industry_code": "甲業", "is_active": 0},
        {"stock_id": "K1", "stock_name": "銀行", "market": "TWSE", "industry_code": "金融", "is_active": 1},
        {"stock_id": "S1", "stock_name": "舊財報", "market": "TWSE", "industry_code": "戊業", "is_active": 1},
        {"stock_id": "F1", "stock_name": "無財報", "market": "TWSE", "industry_code": "戊業", "is_active": 1},
    ]
    store.upsert("stocks", stocks, ("stock_id",))

    prices = []
    for sid, s in MAIN.items():
        dates = DATES[-s.get("days", 25):]
        for d in dates:
            turnover = 1 if d in DATES[:5] else s["turnover"]  # 窗口外的舊資料刻意設成極小值
            prices.append({"stock_id": sid, "trade_date": d, "open": 1.0, "high": 1.0, "low": 1.0,
                           "close": 1.0, "volume": 1, "turnover": int(turnover), "change_pct": 0.0})
    store.upsert("daily_prices", prices, ("stock_id", "trade_date"))

    revenue = []
    for sid, s in MAIN.items():
        if s["prior"] is not None:
            revenue += [(sid, "2025-08", s["prior"], 0.0), (sid, "2025-09", 100, 0.0)]
        yoy = s.get("source_yoy", round((s["rev"] / s["prior"] - 1) * 100, 2) if s["prior"] else None)
        revenue += [(sid, "2026-07", s["rev"] * 0.9, 0.0), (sid, "2026-08", s["rev"], yoy)]
        if september == "full" or (september == "partial" and sid in ("A1", "A2", "A3")):
            revenue.append((sid, "2026-09", s["rev"] * 1.1, s.get("source_yoy", None if not s["prior"] else
                                                                round((s["rev"] * 1.1 / 100 - 1) * 100, 2))))
    store.upsert("monthly_revenue", [
        {"stock_id": a, "year_month": b, "revenue": c, "mom_pct": 0.0, "yoy_pct": d}
        for a, b, c, d in revenue], ("stock_id", "year_month"))

    quarters = []
    for sid, s in MAIN.items():
        quarters.append(_quarter_row(sid, 2026, 2, s, "2026-08-31"))
        quarters.append(_quarter_row(sid, 2026, 1, s, "2026-05-31"))
    quarters.append(_quarter_row("S1", 2026, 1, MAIN["A1"] | {"market": "TWSE"}, "2026-05-31"))
    quarters.append(_quarter_row("K1", 2026, 2, MAIN["A1"], "2026-08-31", statement_type="bank", oi=None))
    # 只有兩家公司先公布 Q3（涵蓋率不足）：run 必須仍使用共同季度 Q2，不能混用 Q3
    for sid in ("A1", "A2"):
        quarters.append(_quarter_row(sid, 2026, 3, MAIN[sid] | {"liab": 999, "oi": 1}, "2026-10-05"))
    store.upsert("quarterly_financials", quarters, ("stock_id", "year", "quarter"))

    store.upsert("notice_events", [
        {"stock_id": "N1", "notice_date": "2026-10-05", "reason": "x", "market": "TWSE"},
        {"stock_id": "A1", "notice_date": "2026-06-01", "reason": "old", "market": "TWSE"},
    ], ("stock_id", "notice_date", "reason"))
    store.upsert("disposition_events", [
        {"stock_id": "D1", "announce_date": "2026-09-30", "start_date": "2026-10-01",
         "end_date": "2026-10-20", "cumulative": None, "reason": "x", "measure": "x", "market": "TWSE"},
        {"stock_id": "A2", "announce_date": "2026-08-01", "start_date": "2026-08-02",
         "end_date": "2026-09-01", "cumulative": None, "reason": "x", "measure": "x", "market": "TWSE"},
    ], ("stock_id", "start_date", "end_date"))
    store.upsert("dataset_status", [
        {"dataset": "monthly_revenue", "as_of_value": "2026-08", "fetched_at": "2026-10-10T01:12:21+08:00",
         "source": "https://mopsov.twse.com.tw/nas/t21/", "status": "success", "row_count": 1, "error": None},
        {"dataset": "quarterly_financials_history", "as_of_value": "2026-Q2",
         "fetched_at": "2026-10-10T08:53:19+08:00",
         "source": "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04;https://mopsov.twse.com.tw/mops/web/ajax_t163sb05",
         "status": "success", "row_count": 1, "error": None},
        {"dataset": "market_history", "as_of_value": "2026-10-08", "fetched_at": "2026-10-10T01:12:16+08:00",
         "source": "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX;"
                   "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes;"
                   "https://www.twse.com.tw/rwd/zh/fund/T86",
         "status": "success", "row_count": 1, "error": None},
    ], ("dataset",))
    return store


@pytest.fixture
def store(tmp_path):
    return seed(tmp_path / "t.sqlite")


def results(store, run_id):
    with closing(store.connect()) as conn:
        return {r["stock_id"]: dict(r) for r in conn.execute(
            "SELECT * FROM screening_results WHERE run_id = ?", (run_id,))}


def run(store, profile=None, **kw):
    kw.setdefault("config", CFG)
    kw.setdefault("as_of_date", "2026-10-10")
    return run_screening(store, profile, **kw)


# 1 ───────────────────────────────────────────────────────────────────────
def test_ranking_is_deterministic_with_stable_tie_break(store):
    first, second = run(store, reuse=False), run(store, reuse=False)
    assert first != second
    a, b = results(store, first), results(store, second)
    strip = lambda rows: {k: {c: v for c, v in r.items() if c != "run_id"} for k, r in rows.items()}
    assert strip(a) == strip(b)
    # A2、A3、A4 的 quantScore 相同（0.466667）→ 以 stock_id 遞增排序
    assert a["A2"]["quant_score"] == a["A3"]["quant_score"] == a["A4"]["quant_score"]
    assert a["A2"]["rank"] < a["A3"]["rank"] < a["A4"]["rank"]


def test_same_inputs_reuse_the_existing_run(store):
    assert run(store) == run(store)


# 2 ───────────────────────────────────────────────────────────────────────
def test_user_constraints_apply_after_percentiles_and_before_ranking(store):
    base = results(store, run(store))
    strict_id = run(store, Profile(max_debt_ratio=45, min_liquidity=2.5e9))
    strict = results(store, strict_id)
    for sid, row in base.items():  # percentile 不受使用者條件影響
        for col in ("revenue_yoy_pctl", "operating_margin_pctl", "debt_ratio_pctl", "percentile_scope"):
            assert strict[sid][col] == row[col], (sid, col)
    assert strict["A2"]["exclusion_reason"] == "max_debt_ratio"   # 負債比 50
    assert strict["A1"]["exclusion_reason"] == "min_liquidity"    # 日均 1e9 < 2.5e9
    assert strict["A2"]["rank"] is None and strict["A2"]["quant_score"] is None
    ranks = sorted(r["rank"] for r in strict.values() if r["rank"] is not None)
    assert ranks == list(range(1, len(ranks) + 1))
    assert all(strict[s]["debt_ratio"] <= 45 for s in strict if strict[s]["rank"])
    out = get_candidates(store, Profile(excluded_industries=["甲業"]), config=CFG, as_of_date="2026-10-10")
    assert all(c["industry"] != "甲業" for c in out["candidates"])


# 3 ───────────────────────────────────────────────────────────────────────
def test_industry_percentiles_and_scores_are_exact(store):
    rows = results(store, run(store))
    for sid, (growth, profit, safety) in EXPECTED_A.items():
        row = rows[sid]
        assert row["percentile_scope"] == "industry"
        assert row["revenue_yoy_pctl"] == pytest.approx(growth, abs=1e-6)
        assert row["operating_margin_pctl"] == pytest.approx(profit, abs=1e-6)
        assert row["debt_ratio_pctl"] == pytest.approx(safety, abs=1e-6)  # 負債比越低越高
        assert row["quant_score"] == pytest.approx((growth + profit + safety) / 3, abs=1e-6)


def test_small_industry_falls_back_to_market_percentile(store):
    rows = results(store, run(store))
    pool = [r for r in rows.values() if r["revenue_yoy_status"] == "verified"
            and r["operating_margin_status"] == "verified" and r["avg_turnover_20d_status"] == "verified"]
    assert len(pool) == 11  # A1-6、B1-3、N1、D1

    def pctl(value, values):
        less, equal = sum(v < value for v in values), sum(v == value for v in values)
        return (less + (equal - 1) / 2) / (len(values) - 1)

    for sid in ("B1", "B2", "B3"):
        row = rows[sid]
        assert row["percentile_scope"] == "market"
        assert row["revenue_yoy_pctl"] == pytest.approx(
            pctl(row["revenue_yoy"], [r["revenue_yoy"] for r in pool]), abs=1e-5)
        assert row["debt_ratio_pctl"] == pytest.approx(
            pctl(-row["debt_ratio"], [-r["debt_ratio"] for r in pool]), abs=1e-5)


def test_weights_change_score_not_percentile(store):
    base = results(store, run(store))
    growth_only = results(store, run(store, Profile(weights={"growth": 1, "profitability": 0, "safety": 0})))
    assert growth_only["A6"]["rank"] == 1 and growth_only["A6"]["quant_score"] == 1.0
    assert growth_only["A6"]["revenue_yoy_pctl"] == base["A6"]["revenue_yoy_pctl"]


# 4 ───────────────────────────────────────────────────────────────────────
def test_revenue_coverage_gate_falls_back_to_last_complete_month(tmp_path):
    partial = seed(tmp_path / "p.sqlite", september="partial")  # 9 月只有 3/14 家
    row = _run_row(partial, run(partial))
    assert row["revenue_as_of"] == "2026-08" and row["revenue_coverage"] == pytest.approx(1.0)
    # 門檻是 config：降到 0.2 後 9 月（3/14 ≈ 0.21）即被採用，且 coverage 被保存
    loose = run(partial, config=ScreeningConfig(financial_coverage_threshold=0.9, revenue_coverage_threshold=0.2))
    assert _run_row(partial, loose)["revenue_as_of"] == "2026-09"
    assert _run_row(partial, loose)["revenue_coverage"] == pytest.approx(3 / 14, abs=1e-5)
    with pytest.raises(ScreeningError):
        run(partial, config=ScreeningConfig(financial_coverage_threshold=0.9, scan_periods=1))


def test_complete_month_is_used_only_after_the_statutory_deadline(tmp_path):
    full = seed(tmp_path / "f.sqlite", september="full")
    assert _run_row(full, run(full, as_of_date="2026-10-10"))["revenue_as_of"] == "2026-09"
    # 10/10 之前 9 月營收尚未過法定公告期限，即使資料已存在也不使用（避免前視偏誤）
    assert _run_row(full, run(full, as_of_date="2026-10-09"))["revenue_as_of"] == "2026-08"


def test_financial_quarter_is_common_across_stocks(store):
    run_id = run(store)
    rows = results(store, run_id)
    assert _run_row(store, run_id)["financial_as_of"] == "2026Q2"
    assert rows["A1"]["debt_ratio"] == pytest.approx(30.0)  # 沒有混入 A1 先公布的 Q3（99.9）
    assert rows["S1"]["exclusion_reason"] == "financials_not_common_quarter"
    assert rows["S1"]["rank"] is None


def _run_row(store, run_id):
    with closing(store.connect()) as conn:
        return dict(conn.execute("SELECT * FROM screening_runs WHERE run_id = ?", (run_id,)).fetchone())


# 5 ───────────────────────────────────────────────────────────────────────
def test_avg_turnover_uses_exactly_the_last_twenty_market_days(store):
    run_id = run(store)
    rows = results(store, run_id)
    for k in range(1, 7):  # 窗口之前 5 天被設成 1：若誤用 25 天平均會偏低
        assert rows[f"A{k}"]["avg_turnover_20d"] == pytest.approx(1e9 * k)
    assert rows["P1"]["avg_turnover_20d_status"] == "partial"  # 只有 10 日
    assert rows["P1"]["exclusion_reason"] == "partial:avg_turnover_20d"
    out = load_output(store, run_id, limit=20)
    turnover = next(e for e in out["evidence"] if e["metric"] == "avgTurnover20d")
    assert (turnover["windowStart"], turnover["windowEnd"]) == (WINDOW[0], WINDOW[-1])
    assert turnover["calculation"]["inputs"]["observedDays"] == 20
    assert turnover["dataAsOf"] == "2026-10-08"


# 6 ───────────────────────────────────────────────────────────────────────
def test_evidence_values_match_raw_database_rows(store):
    out = get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20)
    month, prior_month = out["run"]["revenueAsOf"], add_months(out["run"]["revenueAsOf"], -12)
    by_id = {e["id"]: e for e in out["evidence"]}
    with closing(store.connect()) as conn:
        for cand in out["candidates"]:
            sid = cand["stockId"]
            rev = lambda m: conn.execute(
                "SELECT revenue FROM monthly_revenue WHERE stock_id=? AND year_month=?", (sid, m)).fetchone()[0]
            fin = conn.execute("SELECT * FROM quarterly_financials WHERE stock_id=? AND year=2026 AND quarter=2",
                               (sid,)).fetchone()
            avg = conn.execute(
                "SELECT AVG(turnover) FROM daily_prices WHERE stock_id=? AND trade_date IN "
                "(SELECT DISTINCT trade_date FROM daily_prices ORDER BY trade_date DESC LIMIT 20)", (sid,)
            ).fetchone()[0]
            expected = {
                "revenueYoY": (rev(month) / rev(prior_month) - 1) * 100,
                "operatingMargin": fin["operating_income_quarter"] / fin["revenue_quarter"] * 100,
                "debtRatio": fin["total_liabilities"] / fin["total_assets"] * 100,
                "avgTurnover20d": avg,
            }
            for key, value in expected.items():
                metric = cand["metrics"][key]
                assert metric["value"] == pytest.approx(value, rel=1e-6, abs=1e-3), (sid, key)
                assert by_id[metric["evidenceId"]]["value"] == metric["value"]
            inputs = by_id[cand["metrics"]["revenueYoY"]["evidenceId"]]["calculation"]["inputs"]
            assert inputs["revenue"] == rev(month) and inputs["priorYearRevenue"] == rev(prior_month)


# 7 + 8 ───────────────────────────────────────────────────────────────────
def test_every_candidate_metric_points_to_a_matching_unique_evidence(store):
    out = get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20)
    ids = [e["id"] for e in out["evidence"]]
    assert len(ids) == len(set(ids)) == 4 * len(out["candidates"])
    assert ids == [f"ev-{i:03d}" for i in range(1, len(ids) + 1)]
    by_id = {e["id"]: e for e in out["evidence"]}
    for cand in out["candidates"]:
        assert set(cand["metrics"]) == {"revenueYoY", "operatingMargin", "debtRatio", "avgTurnover20d"}
        for key, metric in cand["metrics"].items():
            evidence = by_id[metric["evidenceId"]]
            assert (evidence["stockId"], evidence["metric"]) == (cand["stockId"], key)
            assert evidence["verificationStatus"] == "verified"


def test_evidence_carries_source_metadata(store):
    out = get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20)
    for e in out["evidence"]:
        for field in ("source", "dataAsOf", "windowStart", "windowEnd", "fetchedAt", "claim"):
            assert e[field], (e["id"], field)
        assert e["sourceUrl"].startswith("https://")
        assert e["fetchedAtScope"] == ("row" if e["dataset"] == "quarterly_financials" else "dataset")
        assert e["calculation"]["formula"] and e["calculation"]["inputs"]
    pick = lambda stock, metric: next(e for e in out["evidence"] if e["stockId"] == stock and e["metric"] == metric)
    assert pick("A1", "operatingMargin")["sourceUrl"].endswith("ajax_t163sb04")
    assert pick("A1", "debtRatio")["sourceUrl"].endswith("ajax_t163sb05")
    assert pick("A1", "avgTurnover20d")["sourceUrl"].endswith("MI_INDEX")
    assert pick("B1", "avgTurnover20d")["source"] == "TPEx"
    assert pick("B1", "avgTurnover20d")["sourceUrl"].endswith("dailyQuotes")


# 9 ───────────────────────────────────────────────────────────────────────
def test_snapshot_is_reproducible_after_the_database_changes(store):
    first = get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20)
    with closing(store.connect()) as conn, conn:
        conn.execute("UPDATE daily_prices SET turnover = 1")
        conn.execute("DELETE FROM quarterly_financials WHERE stock_id = 'A1'")
        conn.execute("UPDATE dataset_status SET fetched_at = '2099-01-01T00:00:00+08:00'")
    assert load_output(store, first["run"]["runId"], limit=20) == first
    later = get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20)
    assert later["run"]["runId"] != first["run"]["runId"]
    assert later["run"]["dataVersion"] != first["run"]["dataVersion"]


# 10 ──────────────────────────────────────────────────────────────────────
def test_missing_or_unverifiable_stocks_are_never_imputed_or_ranked(store):
    run_id = run(store)
    rows = results(store, run_id)
    expected = {
        "R1": "insufficient:revenue_yoy", "C1": "conflict:revenue_yoy", "P1": "partial:avg_turnover_20d",
        "S1": "financials_not_common_quarter", "K1": "not_general_statement", "F1": "missing_financials",
        "X1": "inactive",
    }
    for sid, reason in expected.items():
        assert rows[sid]["exclusion_reason"] == reason, sid
        assert rows[sid]["rank"] is None and rows[sid]["quant_score"] is None, sid
    assert rows["R1"]["revenue_yoy"] is None            # 沒有以來源值或 0 補值
    assert rows["C1"]["revenue_yoy_status"] == "conflict"
    assert rows["K1"]["operating_margin"] is None       # 金融業不硬算
    ranked = sorted((r for r in rows.values() if r["rank"]), key=lambda r: r["rank"])
    assert [r["rank"] for r in ranked] == list(range(1, len(ranked) + 1))
    assert [(-r["quant_score"], r["stock_id"]) for r in ranked] == sorted(
        (-r["quant_score"], r["stock_id"]) for r in ranked)
    out = load_output(store, run_id, limit=50)
    assert not {c["stockId"] for c in out["candidates"]} & set(expected)  # 未 verified 不得發布
    assert out["excluded"]["byReason"]["conflict:revenue_yoy"] == 1


# risk flags ──────────────────────────────────────────────────────────────
def test_disposition_is_excluded_by_default_but_kept_for_audit(store):
    default = results(store, run(store))
    assert default["D1"]["disposition_flag"] == 1 and default["D1"]["exclusion_reason"] == "active_disposition"
    assert default["D1"]["rank"] is None and default["D1"]["revenue_yoy"] == pytest.approx(50.0)
    assert default["A2"]["disposition_flag"] == 0  # 處置已結束
    out = get_candidates(store, Profile(exclude_disposition=False), config=CFG, as_of_date="2026-10-10", limit=20)
    d1 = next(c for c in out["candidates"] if c["stockId"] == "D1")
    assert "disposition" in d1["riskFlags"]


def test_notice_is_only_a_flag_and_does_not_change_ranks(store):
    with_flag = results(store, run(store))
    assert with_flag["N1"]["notice_flag"] == 1 and with_flag["A1"]["notice_flag"] == 0  # 超出 30 日
    no_lookback = results(store, run(store, config=ScreeningConfig(
        financial_coverage_threshold=0.9, notice_lookback_days=1)))
    assert no_lookback["N1"]["notice_flag"] == 0
    assert {s: r["rank"] for s, r in with_flag.items()} == {s: r["rank"] for s, r in no_lookback.items()}
    out = load_output(store, run(store), limit=20)
    assert next(c for c in out["candidates"] if c["stockId"] == "N1")["riskFlags"] == ["notice"]


# interface & contract ────────────────────────────────────────────────────
def test_limit_is_bounded_by_evidence_top_k(store):
    for bad in (0, 51):
        with pytest.raises(ValueError):
            get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=bad)
    small = ScreeningConfig(financial_coverage_threshold=0.9, evidence_top_k=3)
    out = get_candidates(store, config=small, as_of_date="2026-10-10", limit=3)
    assert len(out["candidates"]) == 3 and len(out["evidence"]) == 12
    with pytest.raises(ValueError):
        get_candidates(store, config=small, as_of_date="2026-10-10", limit=4)


def test_output_document_and_cli_match_the_schema(store, tmp_path):
    jsonschema.validate(get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20), SCHEMA)
    out_path = tmp_path / "out" / "candidates.json"
    config_path = tmp_path / "config.json"
    config_path.write_text(json.dumps({"financialCoverageThreshold": 0.9}), encoding="utf-8")
    cli.main(["screen", "--db", str(store.path), "--as-of", "2026-10-10", "--limit", "5",
              "--config", str(config_path), "--max-debt-ratio", "55", "--output", str(out_path)])
    document = json.loads(out_path.read_text(encoding="utf-8"))
    jsonschema.validate(document, SCHEMA)
    assert len(document["candidates"]) == 5
    assert document["run"]["profile"]["maxDebtRatio"] == 55


def test_sample_fixture_conforms_to_the_contract():
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    jsonschema.validate(document, SCHEMA)  # 只驗結構，不綁定會隨資料更新而變動的數值
    ids = {e["id"] for e in document["evidence"]}
    assert 5 <= len(document["candidates"]) <= 10
    for cand in document["candidates"]:
        assert {m["evidenceId"] for m in cand["metrics"].values()} <= ids
    assert all(e["verificationStatus"] == "verified" for e in document["evidence"])


# 預設流動性、對帳、provenance ─────────────────────────────────────────────
def test_default_min_liquidity_is_100m_twd_and_can_be_overridden(store):
    assert Profile().min_liquidity == 100_000_000
    assert Profile().to_dict()["minLiquidity"] == 100_000_000
    with closing(store.connect()) as conn, conn:  # A1 日均成交金額降到 5,000 萬
        conn.execute("UPDATE daily_prices SET turnover = 50000000 WHERE stock_id = 'A1' AND trade_date >= ?",
                     (WINDOW[0],))
    default = results(store, run(store))
    assert default["A1"]["exclusion_reason"] == "min_liquidity" and default["A1"]["rank"] is None
    assert default["A2"]["rank"] is not None
    # 流動性只是門檻，不計分：關閉後 A1 回到排名，且其他股票的 percentile 與分數不受影響
    off = results(store, run(store, Profile(min_liquidity=None)))
    assert off["A1"]["rank"] is not None
    for col in ("revenue_yoy_pctl", "operating_margin_pctl", "debt_ratio_pctl"):
        assert off["A2"][col] == default["A2"][col]
    assert off["A1"]["quant_score"] == pytest.approx((0.0 + 0.2 + 0.6) / 3, abs=1e-6)


@pytest.mark.parametrize("profile", [
    Profile(), Profile(max_debt_ratio=45, min_liquidity=2.5e9), Profile(excluded_industries=["甲業"]),
    Profile(exclude_disposition=False, min_liquidity=None),
])
def test_universe_reconciles_to_ranked_plus_excluded(store, profile):
    out = load_output(store, run(store, profile), limit=20)
    counts, excluded = out["run"]["counts"], out["excluded"]
    assert counts["universe"] == counts["ranked"] + excluded["total"]
    assert excluded["total"] == sum(excluded["byReason"].values())
    assert excluded["total"] == excluded["byStage"]["base"] + excluded["byStage"]["constraint"]
    assert counts["baseEligible"] == counts["universe"] - excluded["byStage"]["base"]
    assert counts["ranked"] == counts["baseEligible"] - excluded["byStage"]["constraint"]
    jsonschema.validate(out | {"candidates": out["candidates"]}, SCHEMA)


def test_source_snapshot_references_the_manifest_only_while_it_matches_the_data(store):
    from taiwan_data.bootstrap import refresh_manifest
    assert get_candidates(store, config=CFG, as_of_date="2026-10-10")["run"]["sourceSnapshot"] is None
    manifest = refresh_manifest(store.path)
    out = get_candidates(store, config=CFG, as_of_date="2026-10-10", reuse=False)
    assert out["run"]["sourceSnapshot"] == f"sha256:{manifest['sha256']}"
    # screening 自己寫入資料庫（含 WAL checkpoint）不會讓 manifest 失效
    again = get_candidates(store, config=CFG, as_of_date="2026-10-10", reuse=False)
    assert again["run"]["sourceSnapshot"] == out["run"]["sourceSnapshot"]
    with closing(store.connect()) as conn, conn:  # 資料集更新後 manifest 即過期
        conn.execute("UPDATE dataset_status SET fetched_at = '2099-01-01T00:00:00+08:00'")
    stale = get_candidates(store, config=CFG, as_of_date="2026-10-10")
    assert stale["run"]["sourceSnapshot"] is None


def test_financial_availability_is_labelled_as_an_estimated_cutoff(store):
    out = get_candidates(store, config=CFG, as_of_date="2026-10-10", limit=20)
    inputs = next(e for e in out["evidence"] if e["metric"] == "operatingMargin")["calculation"]["inputs"]
    assert inputs["availabilityCutoff"] == "2026-08-31"
    assert "availableDate" not in inputs
