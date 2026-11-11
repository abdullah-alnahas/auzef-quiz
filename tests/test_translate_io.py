"""Characterisation tests for translation queue construction."""
import hashlib
import json

from translate_io import build, exam_id


DOC = {
    "course": "ANATOMİ",
    "course_slug": "anatomi",
    "exam": "2024-2025 Vize Soruları",
    "exam_slug": "vize-2024-2025",
    "questions": [
        {"n": 1, "stem": "Soru?", "choices": [
            {"letter": "A", "text": "bir"},
            {"letter": "B", "text": "iki"},
        ], "tables": ["| x |"]},
        {"n": 2, "stem": "Başka?", "choices": [
            {"letter": "A", "text": "üç"},
            {"letter": "B", "text": "dört"},
        ]},
    ],
}


def test_exam_id():
    assert exam_id(DOC) == "anatomi__vize-2024-2025"


def test_item_order_and_ids():
    q = build(DOC)
    assert [i["id"] for i in q["items"]] == [
        "q1.stem", "q1.A", "q1.B", "q1.table0",
        "q2.stem", "q2.A", "q2.B",
    ]


def test_hash_is_stable_and_content_addressed():
    q = build(DOC)
    expected = hashlib.sha256(json.dumps(
        q["items"], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    assert q["source_hash"] == expected

    other = json.loads(json.dumps(DOC))
    other["questions"][0]["choices"][0]["text"] = "değişti"
    assert build(other)["source_hash"] != q["source_hash"]


def test_reordering_questions_changes_hash_but_not_length():
    other = json.loads(json.dumps(DOC))
    other["questions"] = list(reversed(other["questions"]))
    q = build(other)
    assert len(q["items"]) == 7
    assert q["source_hash"] != build(DOC)["source_hash"]
