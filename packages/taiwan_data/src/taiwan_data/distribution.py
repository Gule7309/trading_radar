"""Build and fetch verified SQLite snapshots (full or demo) for sharing between machines.

雲端只存放壓縮後的快照與 manifest；每位開發者在本機各自持有一份 SQLite，
不直接共用遠端或同步資料夾中的資料庫檔案。
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import sqlite3
import sys
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from .db import DataStore, dataset_status_digest, now_iso

MANIFEST_FORMAT = "taiwan-stock-data-distribution-v1"
KINDS = ("full", "demo")
DEFAULT_SOURCE = "https://github.com/Gule7309/trading_radar/releases/download/data-latest/"

DEMO_PRICE_DAYS = 120
DEMO_REVENUE_MONTHS = 24
DEMO_QUARTERS = 8
DEMO_EVENT_DAYS = 365

# demo 不帶回補進度：它是唯讀開發用資料，續跑回補只該在完整資料庫上做。
_DEMO_CLEARED_TABLES = ("backfill_checkpoints", "backfill_progress")


def manifest_name(kind: str) -> str:
    return f"manifest-{kind}.json"


def create_snapshot(
    db: str | os.PathLike[str],
    out_dir: str | os.PathLike[str],
    *,
    kind: str = "full",
    version: str | None = None,
) -> dict[str, object]:
    if kind not in KINDS:
        raise ValueError(f"kind 必須是 {KINDS}")
    source = DataStore(db).path
    if not source.is_file():
        raise FileNotFoundError(source)
    out = Path(out_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    version = version or date.today().isoformat()
    stem = f"taiwan_stock_{kind}_{version}"
    db_file, gz_file = out / f"{stem}.sqlite", out / f"{stem}.sqlite.gz"
    if db_file.exists() or gz_file.exists():
        raise FileExistsError(f"為避免覆寫，請換 --version 或 --out-dir：{gz_file}")

    try:
        with closing(sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True, timeout=600)) as conn:
            conn.execute("VACUUM INTO ?", (str(db_file),))
        if kind == "demo":
            _trim_to_demo(db_file)
        counts, as_of = _inspect(db_file)
        db_sha = sha256_file(db_file)
        _gzip(db_file, gz_file)
        manifest = {
            "format": MANIFEST_FORMAT,
            "kind": kind,
            "version": version,
            "as_of": as_of,
            "created_at": now_iso(),
            "file": gz_file.name,
            "bytes": gz_file.stat().st_size,
            "sha256": sha256_file(gz_file),
            "database": "taiwan_stock.sqlite",
            "database_bytes": db_file.stat().st_size,
            "database_sha256": db_sha,
            "table_row_counts": counts,
        }
        (out / manifest_name(kind)).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return manifest
    except BaseException:
        gz_file.unlink(missing_ok=True)
        raise
    finally:
        db_file.unlink(missing_ok=True)


def download_snapshot(
    db: str | os.PathLike[str],
    *,
    kind: str = "full",
    source: str = DEFAULT_SOURCE,
    force: bool = False,
) -> dict[str, object]:
    if kind not in KINDS:
        raise ValueError(f"kind 必須是 {KINDS}")
    dest = Path(db).expanduser().resolve()
    base = source if "://" in source else Path(source).expanduser().resolve().as_uri() + "/"
    if not base.endswith("/"):
        base += "/"
    manifest = json.loads(_read_bytes(urljoin(base, manifest_name(kind))))
    if manifest.get("format") != MANIFEST_FORMAT or manifest.get("kind") != kind:
        raise ValueError("manifest 格式或 kind 不符")

    if dest.is_file() and not force:
        if _is_current(dest, manifest, kind):
            return {"status": "up_to_date", "database": str(dest), "version": manifest["version"]}
        # 舊版下載沒有本機 manifest：退回比對整個檔案的雜湊。
        if not dest.with_suffix(".manifest.json").is_file() and sha256_file(dest) == manifest["database_sha256"]:
            _write_local_manifest(dest, manifest, base)
            return {"status": "up_to_date", "database": str(dest), "version": manifest["version"]}
    # 有未合併的 WAL 代表可能有程序正在寫入；此時直接替換主檔會讓舊 WAL 套用到新檔而毀損。
    wal = dest.with_name(dest.name + "-wal")
    if wal.is_file() and wal.stat().st_size > 0:
        raise RuntimeError(f"{wal.name} 尚有內容，可能有程序正在使用此資料庫；請先關閉後再下載")

    dest.parent.mkdir(parents=True, exist_ok=True)
    part_gz = dest.with_name(dest.name + ".download.gz")
    part_db = dest.with_name(dest.name + ".partial")
    try:
        _fetch_file(urljoin(base, manifest["file"]), part_gz)
        if sha256_file(part_gz) != manifest["sha256"]:
            raise ValueError("下載檔 SHA-256 與 manifest 不符，已放棄替換")
        with gzip.open(part_gz, "rb") as src, part_db.open("wb") as dst:
            shutil.copyfileobj(src, dst, 8 * 1024 * 1024)
        if sha256_file(part_db) != manifest["database_sha256"]:
            raise ValueError("解壓後資料庫 SHA-256 與 manifest 不符，已放棄替換")
        with closing(sqlite3.connect(f"file:{part_db.as_posix()}?mode=ro", uri=True)) as conn:
            if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("下載的資料庫未通過 quick_check，已放棄替換")
        for suffix in ("-wal", "-shm"):
            dest.with_name(dest.name + suffix).unlink(missing_ok=True)
        os.replace(part_db, dest)
    finally:
        part_gz.unlink(missing_ok=True)
        part_db.unlink(missing_ok=True)
    _write_local_manifest(dest, manifest, base)
    return {"status": "downloaded", "database": str(dest), "version": manifest["version"],
            "as_of": manifest["as_of"], "kind": kind}


def _data_version_read_only(db: Path) -> str:
    """以唯讀連線計算 data_version。一般連線會把資料庫切成 WAL 模式並改寫檔頭，使檔案雜湊改變。"""
    try:
        with closing(sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)) as conn:
            return dataset_status_digest(conn)
    except sqlite3.OperationalError:  # 已是 WAL 模式且無法唯讀開啟時；此時切換模式不會再改檔頭
        return DataStore(db).data_version()


def _is_current(dest: Path, manifest: dict[str, Any], kind: str) -> bool:
    """本機資料是否就是 manifest 這一版。

    不比對整個檔案的雜湊：下載後只要開過資料庫（status、screen），WAL 模式與 screening 結果就會改變檔案，
    但原始資料仍是同一版。改以下載時寫下的本機 manifest 與目前的 data_version 判斷。
    """
    try:
        local = json.loads(dest.with_suffix(".manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    dist = local.get("distribution") or {}
    return (dist.get("kind") == kind and dist.get("version") == manifest["version"]
            and local.get("sha256") == manifest["database_sha256"]
            and local.get("data_version") == _data_version_read_only(dest))


def _write_local_manifest(dest: Path, manifest: dict[str, Any], source: str) -> None:
    """在資料庫旁寫入 <db>.manifest.json，讓之後的 screening run 能以 sourceSnapshot 引用此版本。

    格式與 `taiwan-data manifest` 相容；SHA-256 直接沿用已驗證過的 manifest 值，不重新雜湊。
    """
    local = {
        "format": "taiwan-stock-data-snapshot-v1",
        "updated_at": now_iso(),
        "database": dest.name,
        "database_bytes": dest.stat().st_size,
        "sha256": manifest["database_sha256"],
        "data_version": _data_version_read_only(dest),
        "distribution": {"kind": manifest["kind"], "version": manifest["version"],
                         "as_of": manifest["as_of"], "source": source},
    }
    dest.with_suffix(".manifest.json").write_text(
        json.dumps(local, ensure_ascii=False, indent=2), encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _gzip(src: Path, dst: Path) -> None:
    # mtime=0 讓相同內容產生相同的 .gz，雜湊可重現。
    with src.open("rb") as fin, dst.open("wb") as raw, \
            gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=6, mtime=0) as fout:
        shutil.copyfileobj(fin, fout, 8 * 1024 * 1024)


def _inspect(db_file: Path) -> tuple[dict[str, int], str | None]:
    with closing(sqlite3.connect(f"file:{db_file.as_posix()}?mode=ro", uri=True)) as conn:
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1")]
        counts = {t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}
        as_of = conn.execute("SELECT MAX(trade_date) FROM daily_prices").fetchone()[0]
    return counts, as_of


def _trim_to_demo(db_file: Path) -> None:
    with closing(sqlite3.connect(db_file, timeout=600)) as conn:
        as_of = conn.execute("SELECT MAX(trade_date) FROM daily_prices").fetchone()[0]
        if not as_of:
            raise ValueError("daily_prices 為空，無法建立 demo")
        latest = date.fromisoformat(as_of)
        event_cutoff = (latest - timedelta(days=DEMO_EVENT_DAYS)).isoformat()

        price_cutoff = _nth_distinct(conn, "daily_prices", "trade_date", DEMO_PRICE_DAYS)
        for table in ("daily_prices", "institutional_trading", "margin_trading"):
            conn.execute(f"DELETE FROM {table} WHERE trade_date < ?", (price_cutoff,))

        last_month = conn.execute("SELECT MAX(year_month) FROM monthly_revenue").fetchone()[0]
        if last_month:
            year, month = int(last_month[:4]), int(last_month[5:7])
            index = year * 12 + (month - 1) - (DEMO_REVENUE_MONTHS - 1)
            revenue_cutoff = f"{index // 12:04d}-{index % 12 + 1:02d}"
            conn.execute("DELETE FROM monthly_revenue WHERE year_month < ?", (revenue_cutoff,))

        quarter_cutoff = _nth_distinct(conn, "quarterly_financials", "year * 10 + quarter", DEMO_QUARTERS)
        if quarter_cutoff is not None:
            conn.execute("DELETE FROM quarterly_financials WHERE year * 10 + quarter < ?", (quarter_cutoff,))

        conn.execute("DELETE FROM notice_events WHERE notice_date < ?", (event_cutoff,))
        conn.execute("DELETE FROM disposition_events WHERE end_date < ?", (event_cutoff,))
        conn.execute("DELETE FROM dividend_events WHERE ex_date < ?", (event_cutoff,))
        for table in _DEMO_CLEARED_TABLES:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
            if exists:
                conn.execute(f"DELETE FROM {table}")
        conn.commit()
        conn.execute("VACUUM")


def _nth_distinct(conn: sqlite3.Connection, table: str, expr: str, n: int):
    """第 n 新的相異值；資料不足 n 個時回傳最舊值（等於全部保留）。"""
    rows = conn.execute(
        f"SELECT DISTINCT {expr} AS v FROM {table} ORDER BY v DESC LIMIT ?", (n,)).fetchall()
    return rows[-1][0] if rows else None


def _read_bytes(url: str) -> bytes:
    if urlparse(url).scheme == "file":
        return Path(_file_path(url)).read_bytes()
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.content


def _fetch_file(url: str, target: Path) -> None:
    if urlparse(url).scheme == "file":
        shutil.copyfile(_file_path(url), target)
        return
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        with target.open("wb") as handle:
            for chunk in response.iter_content(8 * 1024 * 1024):
                handle.write(chunk)
                done += len(chunk)
                if total and sys.stderr.isatty():
                    print(f"\r下載 {done / 1e6:,.0f} / {total / 1e6:,.0f} MB", end="", file=sys.stderr)
    if total and sys.stderr.isatty():
        print(file=sys.stderr)


def _file_path(url: str) -> str:
    from urllib.request import url2pathname
    return url2pathname(urlparse(url).path)
