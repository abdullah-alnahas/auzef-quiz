#!/usr/bin/env python3
"""Fetch a single URL through Obscura and print/save the settled HTML.

Usage: fetch1.py <url> [--out PATH] [--text] [--wait N] [--screenshot PATH]
Handles JS proof-of-work interstitials by waiting for the challenge to clear.
"""
import argparse
import sys
import time

from playwright.sync_api import sync_playwright

CDP = "http://127.0.0.1:9222"
CHALLENGE_MARKERS = ("__challenge", "Checking your browser", "HASHCASH_CONFIG")


def is_challenge(html: str) -> bool:
    return any(m in html for m in CHALLENGE_MARKERS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--out")
    ap.add_argument("--text", action="store_true")
    ap.add_argument("--screenshot")
    ap.add_argument("--wait", type=float, default=2.0)
    ap.add_argument("--timeout", type=float, default=45.0)
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()
        page.set_extra_http_headers({
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        })
        page.goto(args.url, wait_until="domcontentloaded", timeout=int(args.timeout * 1000))
        # Let a JS challenge solve itself.
        deadline = time.time() + args.timeout
        last = ""
        while time.time() < deadline:
            time.sleep(1.0)
            try:
                last = page.content()
            except Exception:
                continue
            if not is_challenge(last):
                break
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        time.sleep(args.wait)
        html = page.content()
        if args.screenshot:
            page.screenshot(path=args.screenshot, full_page=True)
        print(f"FINAL_URL: {page.url}", file=sys.stderr)
        print(f"TITLE: {page.title()}", file=sys.stderr)
        print(f"CHALLENGE_STILL: {is_challenge(html)}", file=sys.stderr)
        print(f"BYTES: {len(html)}", file=sys.stderr)
        if args.text:
            out = page.inner_text("body")
        else:
            out = html
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                f.write(out)
        else:
            print(out)
        page.close()
        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
