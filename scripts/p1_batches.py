#!/usr/bin/env python3
"""Write translation batch files for the remaining Phase 1 sets.

The batches contain only exams whose next action is `translate`; agents read
the file and never need a hand-typed id. Files are regenerated on each run.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "config/p1_batches"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from state import Pipeline  # noqa: E402

P1 = {
    "anne-baba-egitimi",
    "cocuk-gelisimi-uygulamalari-i",
    "cocuk-haklari-ve-hukuku",
    "cocuklukta-yabanci-dil-olarak-turkce-ogretimi",
    "ilkokula-hazirlik",
    "okul-oncesi-donemde-duyu-egitimi",
    "oyun-ve-oyun-terapisi",
    "psikometrik-gelisimsel-olcme-ve-degerlendirme",
    "sosyal-duygusal-gelisim",
}


def main() -> None:
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    snap = Pipeline().snapshot()
    rows = [
        e for e in snap["exams"]
        if e["course_slug"] in P1 and e["next_action"] == "translate"
    ]
    rows.sort(key=lambda e: (e["course_slug"], e["exam_slug"]))
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("batch_*.txt"):
        old.unlink()
    batches = [rows[i:i + size] for i in range(0, len(rows), size)]
    for index, batch in enumerate(batches, 1):
        ids = [f"{e['course_slug']}__{e['exam_slug']}" for e in batch]
        (OUT / f"batch_{index:02d}.txt").write_text(
            "\n".join(ids) + "\n", encoding="utf-8")
        print(f"batch_{index:02d}: {len(ids)} exams, "
              f"{sum(e['questions'] or 0 for e in batch)} questions")
    print(f"total pending: {len(rows)} exams in {len(batches)} batches")


if __name__ == "__main__":
    main()
