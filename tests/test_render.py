"""Characterisation tests for the Markdown renderer.

These pin the exact on-disk format the PWA consumes: front matter, question
line, choice separator, tables and inline review comments.
"""
from render_md import esc_line, render


def exam(**over):
    d = {
        "course": "ANNE BABA EĞİTİMİ",
        "exam": "2024-2025 Final Soruları",
        "source_url": "https://lolonolo.com/x/",
        "question_count": 1,
        "scraped_at": "2026-01-01T00:00:00+03:00",
        "questions": [{
            "n": 1,
            "stem": "Soru?",
            "stem_ar": "سؤال؟",
            "choices": [
                {"letter": "A", "text": "bir", "text_ar": "واحد"},
                {"letter": "B", "text": "iki", "text_ar": "اثنان"},
                {"letter": "C", "text": "üç", "text_ar": "ثلاثة"},
                {"letter": "D", "text": "dört", "text_ar": "أربعة"},
            ],
            "answer": "B",
        }],
    }
    d.update(over)
    return d


def test_minimal_exam():
    assert render(exam()) == (
        "---\n"
        "course: ANNE BABA EĞİTİMİ\n"
        "exam: 2024-2025 Final Soruları\n"
        "source_url: https://lolonolo.com/x/\n"
        "question_count: 1\n"
        "scraped_at: 2026-01-01T00:00:00+03:00\n"
        "---\n"
        "\n"
        "### Q1\n"
        "**Question:** Soru? | سؤال؟\n"
        "**Choices:**\n"
        "- A) bir — واحد\n"
        "- B) iki — اثنان\n"
        "- C) üç — ثلاثة\n"
        "- D) dört — أربعة\n"
        "**Answer:** B\n"
    )


def test_newlines_become_br_and_pipes_are_kept():
    d = exam()
    d["questions"][0]["stem"] = "bir\niki | üç"
    out = render(d)
    assert "**Question:** bir<br>iki | üç |" in out


def test_images_tables_and_review_comments():
    d = exam()
    q = d["questions"][0]
    q["stem_images"] = [{"path": "assets/a.png"}, {"path": None}]
    q["choices"][0]["images"] = [{"path": "assets/b.png"}]
    q["tables"] = ["| a | b |"]
    q["review"] = ["q1.stem: reason"]
    out = render(d)
    assert "**Question:** Soru? [IMAGE](assets/a.png) |" in out
    assert "- A) bir [IMAGE](assets/b.png) — واحد" in out
    assert "[TABLE]\n```\n| a | b |\n```" in out
    assert "<!-- REVIEW: q1.stem: reason -->" in out


def test_missing_translation_and_answer_render_empty_and_unknown():
    d = exam()
    del d["questions"][0]["stem_ar"]
    del d["questions"][0]["answer"]
    out = render(d)
    assert "**Question:** Soru? | \n" in out
    assert "**Answer:** UNKNOWN" in out


def test_esc_line_is_lossless_for_windows_newlines():
    assert esc_line("a\r\nb\nc") == "a<br>b<br>c"
