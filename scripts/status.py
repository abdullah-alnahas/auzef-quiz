#!/usr/bin/env python3
"""Backwards-compatible entry point for the pipeline report.

The state model lives in scripts/state.py; this wrapper keeps
`python3 scripts/status.py` working for existing notes and muscle memory.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from state import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
