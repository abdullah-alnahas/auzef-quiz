"""Characterisation tests for the two legacy page shapes and page noise."""
from parse_legacy import extract


def page(body: str, h1: str = "") -> str:
    head = f"<h1>{h1}</h1>" if h1 else ""
    return (f"<html><body>{head}"
            f'<div class="cm-entry-summary">{body}</div>'
            "</body></html>")


def test_numbered_questions():
    html = page("""
1- Birinci soru nedir?
A) a
B) b
C) c
D) d
E) e
Cevap : B) b
2- İkinci soru nedir?
A) a
B) b
C) c
D) d
E) e
Cevap : E) e
""")
    qs = extract(html)
    assert [q["n"] for q in qs] == [1, 2]
    assert qs[0]["stem"] == "Birinci soru nedir?"
    assert [c["letter"] for c in qs[0]["choices"]] == list("ABCDE")
    assert qs[0]["answer"] == "B"
    assert qs[1]["answer"] == "E"


def test_bare_questions_without_numbers():
    html = page("""
Kurs 2020 Vize
Kurs 2020 Vize
Numarasız soru nedir?
A. bir
B. iki
C. üç
D. dört
E. beş
Cevap : A. bir
İkinci numarasız soru?
A. bir
B. iki
C. üç
D. dört
E. beş
Cevap : D. dört
""", h1="Kurs 2020 Vize")
    qs = extract(html)
    assert [q["n"] for q in qs] == [1, 2]
    assert qs[0]["stem"] == "Numarasız soru nedir?"
    assert qs[1]["answer"] == "D"


def test_answer_repeated_as_option_text():
    html = page("""
1- Hangisi doğrudur?
A) yanlış bir
B) doğru olan
C) yanlış iki
D) yanlış üç
E) yanlış dört
B) doğru olan
""")
    qs = extract(html)
    assert qs[0]["answer"] == "B"
    assert len(qs[0]["choices"]) == 5


def test_ad_controller_text_is_not_content():
    html = page("""
1- Hangisi doğrudur?
A) bir
No ad requested because of display:none on the adsbygoogle tag
B) iki
C) üç
D) dört
E) beş
Cevap : B) iki
""")
    q = extract(html)[0]
    assert "adsbygoogle" not in q["choices"][0]["text"]
    assert "adsbygoogle" not in q["stem"]


def test_numbered_list_in_a_note_is_not_a_question():
    html = page("""
1- Bir soru?
A) bir
B) iki
C) üç
D) dört
E) beş
Cevap : A) bir
NOT: süreç şöyledir:
1. birinci adım
2. ikinci adım
3. üçüncü adım
4. dördüncü adım
2- İkinci soru?
A) bir
B) iki
C) üç
D) dört
E) beş
Cevap : C) üç
""")
    qs = extract(html)
    assert [q["n"] for q in qs] == [1, 2]
    assert qs[1]["stem"] == "İkinci soru?"


def test_collapsed_b_option_is_split_back_out():
    html = page("""
1- Hangisi?
A) Demokratik tutum b) Tutarsız tutum
C) üç
D) dört
E) beş
Cevap : A) Demokratik tutum
""")
    q = extract(html)[0]
    assert [c["letter"] for c in q["choices"]] == list("ABCDE")
    assert q["choices"][0]["text"] == "Demokratik tutum"
    assert q["choices"][1]["text"] == "Tutarsız tutum"
