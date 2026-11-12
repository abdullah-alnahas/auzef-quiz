#!/usr/bin/env python3
"""Fetch a URL list with a hard per-URL watchdog.

fetch_many.py is one long-lived browser session. If a single navigation wedges
the CDP connection, the whole queue stalls indefinitely (observed on a few
heavy posts). This driver runs one fetch per subprocess with a wall-clock
timeout, so a stuck page costs the cap and nothing more; the cache is on disk,
so restarting at any point resumes exactly where it stopped.

Still N=1: one fetch subprocess at a time.

Usage:
    fetch_batch.py config/fetch_p2.txt [--cap 90]
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from common import sha1

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "output/.cache/html"
LOGS = ROOT / "output/logs"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("list")
    ap.add_argument("--cap", type=float, default=90.0)
    ap.add_argument("--wait", type=float, default=1.0)
    args = ap.parse_args()

    urls = [line.strip() for line in open(args.list, encoding="utf-8")
            if line.strip() and not line.startswith("#")]
    LOGS.mkdir(parents=True, exist_ok=True)
    out = open(LOGS / "fetch_batch.jsonl", "a", encoding="utf-8")
    ok = failed = skipped = 0
    t0 = time.time()

    for i, url in enumerate(urls, 1):
        dest = CACHE / (sha1(url) + ".html")
        if dest.exists() and dest.stat().st_size > 2000:
            skipped += 1
            continue
        try:
            r = subprocess.run(
                [sys.executable, str(ROOT / "scripts/fetch_many.py"), url,
                 "--until", "commit", "--block", "media,image,font",
                 "--timeout", "90", "--wait", "4"],
                capture_output=True, text=True, timeout=args.cap, cwd=ROOT)
            rec = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
            if dest.exists() and dest.stat().st_size > 2000:
                ok += 1
                print(f"[{i}/{len(urls)}] ok   {url}", flush=True)
            else:
                failed += 1
                out.write(json.dumps({"url": url, "status": "failed",
                                      "error": (rec or r.stderr.strip())[:300]},
                                     ensure_ascii=False) + "\n")
                out.flush()
                print(f"[{i}/{len(urls)}] FAIL {url}", flush=True)
        except subprocess.TimeoutExpired:
            failed += 1
            out.write(json.dumps({"url": url, "status": "failed",
                                  "error": f"watchdog {args.cap}s"},
                                 ensure_ascii=False) + "\n")
            out.flush()
            print(f"[{i}/{len(urls)}] HANG {url}", flush=True)
        time.sleep(args.wait)

    print(f"done: ok={ok} failed={failed} cached={skipped} "
          f"in {round(time.time() - t0)}s", flush=True)
    out.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
