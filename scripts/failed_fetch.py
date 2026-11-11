#!/usr/bin/env python3
"""Print the exam URLs that need a retry, one per line.

A URL is retried only when its page is still not cached and its last fetch
record is a failure. The state model owns that decision, so this stays
consistent with `state.py` (`next_action: retry_fetch`).

Usage:
    failed_fetch.py                 # print URLs
    failed_fetch.py --write FILE    # write them to a fetch_many input file
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from state import Pipeline  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", help="write the list to this file instead of stdout")
    args = ap.parse_args()

    snap = Pipeline().snapshot()
    urls = [e["source_url"] for e in snap["exams"]
            if e["next_action"] == "retry_fetch" and e["source_url"]]
    text = "".join(u + "\n" for u in urls)
    if args.write:
        Path(args.write).write_text(text, encoding="utf-8")
        print(f"{len(urls)} failed URLs -> {args.write}")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
