"""Translation carry-over when canonical JSON is rebuilt from HTML."""
from parse_all import (carry_translations, is_compilation_body,
                       is_compilation_title, is_other_programme)


def doc(stem="Soru?", a="bir", answer="A", n=1):
    """A freshly parsed page: source fields only, no Arabic."""
    return {
        "questions": [{
            "n": n, "stem": stem, "answer": answer,
            "choices": [{"letter": "A", "text": a},
                        {"letter": "B", "text": "iki"}],
            "tables": ["| t |"],
        }],
    }


def with_ar(**over):
    """The previous JSON for the same page, with Arabic attached."""
    d = doc(**over)
    q = d["questions"][0]
    q["stem_ar"] = "سؤال؟"
    q["tables_ar"] = ["| جدول |"]
    q["review"] = ["q1.stem: note"]
    q["choices"][0]["text_ar"] = "واحد"
    q["choices"][1]["text_ar"] = "اثنان"
    d["review_notes"] = {"q9": "leftover"}
    return d


def test_identical_page_keeps_translations_and_notes():
    new = doc()
    carry_translations(new, with_ar())
    q = new["questions"][0]
    assert q["stem_ar"] == "سؤال؟"
    assert [c["text_ar"] for c in q["choices"]] == ["واحد", "اثنان"]
    assert q["tables_ar"] == ["| جدول |"]
    assert q["review"] == ["q1.stem: note"]
    assert new["review_notes"] == {"q9": "leftover"}


def test_changed_stem_is_not_paired_with_stale_translation():
    new = doc(stem="Değişti?")
    carry_translations(new, with_ar())
    assert "stem_ar" not in new["questions"][0]


def test_changed_option_text_is_not_paired_with_stale_translation():
    new = doc(a="değişti")
    carry_translations(new, with_ar())
    assert "text_ar" not in new["questions"][0]["choices"][0]


def test_missing_old_question_is_ignored():
    new = doc(n=2)
    carry_translations(new, with_ar())
    assert "stem_ar" not in new["questions"][0]


def test_other_programme_detection():
    assert is_other_programme("Anatomi (TDS) 2023 Vize", "anatomi")
    assert not is_other_programme("Anatomi (TDS) 2023 Vize", "anatomi-tds")
    assert not is_other_programme("Anatomi 2023 Vize", "anatomi")


def test_compilation_title_needs_no_term():
    assert is_compilation_title("Çocuk Hakları ve Hukuku Vize Ve Final Soruları")
    assert not is_compilation_title("2020-2021 Vize Ve Final Soruları")
    assert not is_compilation_title("2020-2021 Vize Soruları")


def test_compilation_body_markers():
    def q(stem):
        return {"stem": stem}

    assert is_compilation_body([q("Soru?\nDoğru\nYanlış")])
    assert is_compilation_body([q("Soru?\nCevap : Yanlış")])
    assert is_compilation_body([q("Soru?\n-------")])
    assert not is_compilation_body([q("Normal soru?\nII. öncül")])
