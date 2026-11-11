"""Translation carry-over when canonical JSON is rebuilt from HTML."""
from parse_all import (apply_quality_gate, carry_translations,
                       is_compilation_body, is_compilation_title,
                       is_other_programme, normalise_numbering)


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


def question(n=1, letters="ABCDE", stem="Yeterince uzun bir soru metni?"):
    return {"n": n, "stem": stem, "answer": "A",
            "choices": [{"letter": c, "text": f"seçenek {c}"} for c in letters]}


def doc_with(count, letters="ABCDE"):
    return {"questions": [question(i, letters) for i in range(1, count + 1)],
            "question_count": count}


def test_small_defect_is_dropped_and_renumbered():
    d = doc_with(20)
    d["questions"][5] = question(6, letters="ABC")
    bad, dropped = apply_quality_gate(d)
    assert bad == []
    assert [q["n"] for q in d["questions"]] == list(range(1, 20))
    assert d["question_count"] == 19
    assert dropped[0]["n"] == 6
    assert d["omitted_questions"][0]["reason"] == "choice_count"


def test_missing_option_letter_is_a_defect():
    d = doc_with(20)
    d["questions"][0] = question(1, letters="ABDE")
    bad, dropped = apply_quality_gate(d)
    assert bad == []
    assert d["omitted_questions"][0]["reason"] == "option_letters"


def test_too_many_defects_reject_the_exam():
    d = doc_with(10)
    for i in range(5):
        d["questions"][i] = question(i + 1, letters="AB")
    bad, dropped = apply_quality_gate(d)
    assert dropped == []
    assert "choice_count" in bad
    assert d["question_count"] == 10


def test_numbering_gaps_are_closed_and_recorded():
    d = doc_with(10)
    for i, q in enumerate(d["questions"], 1):
        q["n"] = i if i < 6 else i + 1
    nums = normalise_numbering(d)
    assert nums == list(range(1, 11))
    assert d["source_numbers"] == [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]


def test_repeated_label_is_renumbered_in_page_order():
    d = doc_with(10)
    d["questions"][6]["n"] = 1
    nums = normalise_numbering(d)
    assert nums == list(range(1, 11))
