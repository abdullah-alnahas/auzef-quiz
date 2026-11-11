#!/usr/bin/env python3
"""Run one pipeline pass over whatever pages are cached.

    parse_all -> translate_io --build -> render_all (merge+render+manifest)
              -> validate -> state

This is exactly the manual sequence, in the only safe order: canonical JSON is
rebuilt first, translations are merged into it, and only then is Markdown
rendered. Running it while pages are still being fetched is fine; the next pass
picks up the new pages.

Exit code is non-zero when validation finds a problem, so a caller can stop.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
PY = sys.executable


def run(*args: str) -> int:
    return subprocess.run([PY, *map(str, args)], cwd=ROOT).returncode


def main() -> int:
    run(SCRIPTS / "parse_all.py")
    run(SCRIPTS / "translate_io.py", "--build")
    run(SCRIPTS / "render_all.py")
    bad = run(SCRIPTS / "validate.py")
    run(SCRIPTS / "state.py")
    if bad:
        print("\nvalidation failed — fix before advancing further", file=sys.stderr)
    return bad


if __name__ == "__main__":
    raise SystemExit(main())
