from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

from .bootstrap import build_snapshot, refresh_manifest
from .db import DEFAULT_DB_ENV, DataStore
from .distribution import DEFAULT_SOURCE, KINDS, create_snapshot, download_snapshot
from .service import BACKFILL_START, RefreshService

REFRESH_TARGETS = ("all", "market", "stocks", "revenue", "financials", "margin",
                   "dividends", "disposition", "delisted", "industries")
BACKFILL_TARGETS = ("all", "financials", "disposition", "margin", "institutional", "delisted")


def _date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("日期格式必須是 YYYY-MM-DD") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="taiwan-data")
    sub = parser.add_subparsers(dest="command", required=True)

    bootstrap = sub.add_parser("bootstrap", help="從舊 research.db 與 Parquet 建立新 snapshot")
    bootstrap.add_argument("--source-db", required=True)
    bootstrap.add_argument("--parquet-dir", required=True)
    bootstrap.add_argument("--out", required=True)
    bootstrap.add_argument("--manifest")

    refresh = sub.add_parser("refresh", help="從官方來源增量更新 SQLite")
    refresh.add_argument("target", choices=REFRESH_TARGETS)
    refresh.add_argument("--db", default=os.getenv(DEFAULT_DB_ENV))
    refresh.add_argument("--since", type=_date, help="market／margin 起始日（預設從資料庫最後一天續抓）")
    refresh.add_argument("--until", type=_date)
    refresh.add_argument("--delay", type=float, default=0.8)
    refresh.add_argument("--lookback-days", type=int, default=0,
                         help="market／margin 額外重抓最近 N 天，補回暫時性失敗的缺口")

    backfill = sub.add_parser("backfill", help="從官方來源回補歷史缺口，可依 checkpoint 續跑")
    backfill.add_argument("target", choices=BACKFILL_TARGETS)
    backfill.add_argument("--db", default=os.getenv(DEFAULT_DB_ENV))
    backfill.add_argument("--since", type=_date, default=BACKFILL_START)
    backfill.add_argument("--until", type=_date)
    backfill.add_argument("--delay", type=float, default=0.2,
                          help="每次官方請求間隔秒數")
    backfill.add_argument("--market", choices=("TWSE", "TPEX"),
                          help="margin／institutional 可只回補單一市場")

    status = sub.add_parser("status", help="顯示各資料表筆數與日期範圍")
    status.add_argument("--db", default=os.getenv(DEFAULT_DB_ENV))
    status.add_argument("--json", action="store_true")

    manifest = sub.add_parser("manifest", help="更新 snapshot manifest 與 SHA-256")
    manifest.add_argument("--db", default=os.getenv(DEFAULT_DB_ENV))
    manifest.add_argument("--out")
    manifest.add_argument("--artifact", action="append", default=[])

    snapshot = sub.add_parser("snapshot", help="建立可分發的壓縮快照（full 或 demo）與 manifest")
    snapshot.add_argument("--db", default=os.getenv(DEFAULT_DB_ENV))
    snapshot.add_argument("--out-dir", required=True)
    snapshot.add_argument("--kind", choices=KINDS, default="full")
    snapshot.add_argument("--version", help="預設為今天日期 YYYY-MM-DD")

    download = sub.add_parser("download", help="下載並驗證快照到本機 SQLite（版本相同則跳過）")
    download.add_argument("--db", default=os.getenv(DEFAULT_DB_ENV))
    download.add_argument("--kind", choices=KINDS, default="full")
    download.add_argument("--demo", action="store_true", help="等同 --kind demo")
    download.add_argument("--source", default=DEFAULT_SOURCE,
                          help="manifest 所在的 URL 或本機資料夾")
    download.add_argument("--force", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if args.command == "bootstrap":
        result = build_snapshot(
            args.source_db, args.parquet_dir, args.out, manifest_path=args.manifest
        )
    elif args.command == "status":
        store = DataStore(args.db)
        store.ensure_schema()
        result = store.status()
        if not args.json:
            _print_status(result)
            return
    elif args.command == "manifest":
        if not args.db:
            raise ValueError(f"請用 --db 或 {DEFAULT_DB_ENV} 指定 SQLite 路徑")
        result = refresh_manifest(args.db, args.out, args.artifact)
    elif args.command == "snapshot":
        result = create_snapshot(args.db, args.out_dir, kind=args.kind, version=args.version)
    elif args.command == "download":
        if not args.db:
            raise ValueError(f"請用 --db 或 {DEFAULT_DB_ENV} 指定 SQLite 路徑")
        result = download_snapshot(args.db, kind="demo" if args.demo else args.kind,
                                   source=args.source, force=args.force)
    elif args.command == "backfill":
        result = _backfill(RefreshService(DataStore(args.db)), args)
    else:
        result = _refresh(RefreshService(DataStore(args.db)), args)
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    if _result_failed(result):
        sys.exit(1)


def _result_failed(result: object) -> bool:
    if not isinstance(result, dict):
        return False
    return bool(result.get("errors")) or result.get("status") == "partial"


def _refresh(service: RefreshService, args: argparse.Namespace) -> dict[str, object]:
    window = {"since": args.since, "until": args.until, "delay": args.delay,
              "lookback_days": args.lookback_days}
    if args.target == "all":
        return service.refresh_all(**window)
    if args.target == "market":
        return service.refresh_market(**window)
    if args.target == "margin":
        return service.refresh_margin(**window)
    if args.target == "revenue":
        return service.refresh_revenue(delay=args.delay)
    if args.target == "financials":
        return service.refresh_financials()
    if args.target == "dividends":
        return service.refresh_dividends(until=args.until, delay=args.delay)
    if args.target == "disposition":
        return service.refresh_disposition(until=args.until, delay=args.delay)
    if args.target == "delisted":
        return service.refresh_delisted()
    if args.target == "industries":
        return service.refresh_industries()
    return service.refresh_stocks_and_latest_prices()


def _backfill(service: RefreshService, args: argparse.Namespace) -> dict[str, object]:
    window = {"since": args.since, "until": args.until, "delay": args.delay}
    if args.market and args.target not in {"margin", "institutional"}:
        raise ValueError("--market 只適用於 margin／institutional")
    if args.target == "all":
        return service.backfill_all(**window)
    if args.target == "financials":
        return service.backfill_financials(**window)
    if args.target == "disposition":
        return service.backfill_disposition(**window)
    if args.target == "margin":
        return service.backfill_margin(**window, market=args.market)
    if args.target == "institutional":
        return service.backfill_institutional(**window, market=args.market)
    return service.backfill_delisted(until=args.until, delay=args.delay)


def _print_status(result: dict[str, object]) -> None:
    print(f"Database: {result['database']}")
    for table, info in result["tables"].items():
        if not info.get("exists"):
            print(f"- {table}: missing")
            continue
        bounds = f" [{info.get('min')} .. {info.get('max')}]" if "min" in info else ""
        stocks = f", {info['stocks']} stocks" if "stocks" in info else ""
        print(f"- {table}: {info['rows']} rows{stocks}{bounds}")
    if result.get("dataset_status"):
        print("Refresh status:")
        for item in result["dataset_status"]:
            print(f"- {item['dataset']}: {item['status']} as_of={item['as_of_value']} "
                  f"fetched_at={item['fetched_at']}")


if __name__ == "__main__":
    main()
