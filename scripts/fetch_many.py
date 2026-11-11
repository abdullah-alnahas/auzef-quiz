#!/usr/bin/env python3
"""Polite sequential fetcher over Obscura CDP.

Reads URLs (one per line) from a file or argv, writes each settled HTML to
output/.cache/html/<sha1>.html and prints a JSON line per URL.

- 1 navigation at a time (N=1)
- 2.0s +/- 0.5s jitter between navigations
- retries: 3, backoff 5/20/60s, honours Retry-After
- aborts on 401/403/407 after the retry budget, never bypasses a challenge
"""
import argparse
import json
import random
import time
from pathlib import Path

from common import sha1

from playwright.sync_api import sync_playwright

CDP = "http://127.0.0.1:9222"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "output/.cache/html"
LOGS = ROOT / "output/logs"
CHALLENGE_MARKERS = ("__challenge/probes.js", "HASHCASH_CONFIG", "Checking your browser")


def is_challenge(html: str) -> bool:
    return any(m in html for m in CHALLENGE_MARKERS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--file")
    ap.add_argument("--wait", type=float, default=2.0)
    ap.add_argument("--timeout", type=float, default=45.0)
    # The CDP proxy enforces a 30s navigation deadline, so heavy pages need
    # "commit" (return as soon as navigation starts) plus a settle wait.
    ap.add_argument("--until", default="domcontentloaded",
                    choices=["load", "domcontentloaded", "commit", "networkidle"])
    ap.add_argument("--block", default="",
                    help="comma-separated Playwright resource types to abort, "
                         "e.g. media,image,font (the article HTML does not need them)")
    args = ap.parse_args()

    urls = list(args.urls)
    if args.file:
        urls += [line.strip() for line in open(args.file, encoding="utf-8")
                 if line.strip() and not line.startswith("#")]

    CACHE.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    retry_log = open(LOGS / "retries.jsonl", "a", encoding="utf-8")
    err_log = open(LOGS / "errors.jsonl", "a", encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()
        # Never let a hung content()/evaluate() block the whole queue; the CDP
        # proxy already caps navigation at 30s.
        page.set_default_timeout(15000)
        page.set_extra_http_headers({
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        })
        if args.block:
            blocked = {t.strip() for t in args.block.split(",") if t.strip()}
            page.route("**/*", lambda route: (
                route.abort() if route.request.resource_type in blocked
                else route.continue_()))

        for idx, url in enumerate(urls, 1):
            dest = CACHE / (sha1(url) + ".html")
            if dest.exists() and dest.stat().st_size > 2000:
                rec = {"url": url, "status": "cached", "file": str(dest), "bytes": dest.stat().st_size}
                print(json.dumps(rec, ensure_ascii=False))
                continue

            last_err = None
            for attempt in range(1, 4):
                t0 = time.time()
                try:
                    resp = page.goto(url, wait_until=args.until, timeout=int(args.timeout * 1000))
                    status = resp.status if resp else None
                    if args.until == "commit":
                        # Navigation has started; give the document time to
                        # arrive and any interstitial to clear.
                        page.wait_for_timeout(6000)
                    # Let a JS proof-of-work interstitial clear itself.
                    deadline = time.time() + args.timeout
                    html = ""
                    while time.time() < deadline:
                        try:
                            html = page.content()
                        except Exception:
                            time.sleep(0.5)
                            continue
                        if not is_challenge(html):
                            break
                        time.sleep(0.5)
                    # Ads/analytics keep the network busy forever on this site;
                    # a short fixed settle is both faster and sufficient.
                    time.sleep(args.wait)
                    html = page.content()
                    # The site answers with a 403 + JS proof-of-work page that
                    # reloads itself. Once the markers are gone the document is
                    # the real page, so trust content over the initial status.
                    if is_challenge(html) or len(html) < 3000:
                        raise RuntimeError(f"http {status} challenge={is_challenge(html)} len={len(html)}")
                    dest.write_text(html, encoding="utf-8")
                    rec = {"url": url, "status": "ok", "http": status,
                           "file": str(dest), "bytes": len(html),
                           "title": page.title(), "seconds": round(time.time() - t0, 2)}
                    print(json.dumps(rec, ensure_ascii=False))
                    last_err = None
                    break
                except Exception as e:  # noqa: BLE001
                    last_err = str(e)
                    retry_log.write(json.dumps({"url": url, "attempt": attempt,
                                                "error": last_err[:300]}, ensure_ascii=False) + "\n")
                    retry_log.flush()
                    if attempt < 3:
                        time.sleep([5, 20, 60][attempt - 1] + random.uniform(0, 2))
            if last_err:
                err_log.write(json.dumps({"url": url, "error": last_err[:300]}, ensure_ascii=False) + "\n")
                err_log.flush()
                print(json.dumps({"url": url, "status": "failed", "error": last_err[:300]}, ensure_ascii=False))
            time.sleep(2.0 + random.uniform(-0.5, 0.5))
        page.close()
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
