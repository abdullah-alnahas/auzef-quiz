#!/usr/bin/env python3
"""Legacy (pre-hd-quiz) exam pages: plain text questions in the article body.

Format:
    1. stem
    A) ...
    ...
    Cevap : C) ...
"""
import re

from bs4 import BeautifulSoup, NavigableString, Tag


def _lines(node: Tag):
    """Text split into logical lines, <br> and block tags becoming newlines."""
    parts = []

    def walk(n):
        if isinstance(n, NavigableString):
            parts.append(str(n))
            return
        if not isinstance(n, Tag):
            return
        if n.name == "br":
            parts.append("\n")
            return
        if n.name in ("script", "style"):
            return
        if n.name=="img":
            return
        if n.name in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"):
            parts.append("\n")
        for c in n.children:
            walk(c)
        if n.name in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"):
            parts.append("\n")

    for c in node.children:
        walk(c)
    raw = "".join(parts).replace("\xa0", " ")
    # A textual "<br>" is a line break, not content.
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    out = []
    for ln in raw.split("\n"):
        ln = re.sub(r"[ \t]+", " ", ln).strip()
        if ln and not AD_NOISE.search(ln):
            out.append(ln)
    return out


Q_RE = re.compile(r"^(\d{1,3})\s*[\.\)\-]\s*(.+)$")
C_RE = re.compile(r"^([A-E])\s*[\)\.\-]\s*(.+)$")
ANS_RE = re.compile(r"^(?:Cevap|CEVAP|Doğru Cevap|Doğru Yanıt)\s*[:\-]\s*([A-E])\s*[\)\.\-]?\s*(.*)$")

STOP = re.compile(r"^(İlgili|Benzer|Önerilen|Yorumlar|Paylaş|Etiketler|Bu yazı|Sonraki|Önceki)\b", re.I)

# The site injects ad-controller text as literal text nodes on some legacy
# pages ("No ad requested because of display:none on the adsbygoogle tag").
# It is not exam content and must never enter a stem or an option.
AD_NOISE = re.compile(r"adsbygoogle|No ad requested|display\s*:\s*none|^lolonolo$", re.I)


def parse_legacy(article: Tag, ) -> list:
    lines = _lines(article)
    questions: list = []
    cur: dict | None = None

    def starts_here(i: int) -> bool:
        """A numbered line starts a question only if options follow nearby.

        Legacy pages embed numbered lists in answer notes ("1. basamak: ..."),
        and those must not become questions. Real stems are followed by A)
        within a few wrapped lines.
        """
        j = i + 1
        for _ in range(8):
            if j >= len(lines):
                return False
            if C_RE.match(lines[j]):
                return True
            if Q_RE.match(lines[j]) or ANS_RE.match(lines[j]):
                return False
            j += 1
        return False

    i = 0
    while i < len(lines):
        ln = lines[i]
        if STOP.match(ln):
            break
        m = Q_RE.match(ln)
        if m and not C_RE.match(ln):
            n = int(m.group(1))
            # A numbered line is a question only at the start of the page or
            # when the previous question is complete AND options follow.
            if cur is None or (cur["choices"] and starts_here(i)):
                if cur and (cur["choices"]):
                    questions.append(cur)
                cur = {"n": n, "type": "legacy_text", "stem": m.group(2).strip(),
                       "stem_images": [], "tables": [], "choices": [],
                       "answer": "UNKNOWN"}
                i += 1
                continue
        if cur is not None:
            am = ANS_RE.match(ln)
            if am:
                cur["answer"] = am.group(1)
                i += 1
                continue
            cm = C_RE.match(ln)
            # Some pages state the answer by repeating the correct option
            # instead of writing "Cevap :". Accept it only on an exact match
            # with an option already listed, so nothing is ever guessed.
            if (cm and cur["answer"] == "UNKNOWN" and len(cur["choices"]) >= 4
                    and any(c["letter"] == cm.group(1)
                            and c["text"].strip() == cm.group(2).strip()
                            for c in cur["choices"])):
                cur["answer"] = cm.group(1)
                i += 1
                continue
            if cm and not cur["choices"] or (cm and len(cur["choices"]) < 5):
                cur["choices"].append({"letter": cm.group(1),
                                       "text": cm.group(2).strip(), "images": []})
                i += 1
                # continuation lines of a choice until the next marker
                while i < len(lines) and not C_RE.match(lines[i]) \
                        and not Q_RE.match(lines[i]) and not ANS_RE.match(lines[i]) \
                        and not STOP.match(lines[i]):
                    cur["choices"][-1]["text"] += " " + lines[i]
                    i += 1
                continue
            # continuation of the stem (wrapped lines before choices)
            if not cur["choices"]:
                if not Q_RE.match(ln):
                    cur["stem"] += "\n" + ln
                    i += 1
                    continue
        i += 1
    if cur and cur["choices"]:
        questions.append(cur)

    # Page defect seen in older exports: two options collapsed onto one line,
    # e.g. "A) Demokratik tutum b) Tutartız tutum" with the rest C/D/E.
    # Split it back so the exam has its full five options; wording is untouched.
    for q in questions:
        ch = q["choices"]
        if len(ch) == 4 and [c["letter"] for c in ch] == ["A", "C", "D", "E"]:
            m = re.match(r"^(.*?)\s+[bB]\s*[\)\.\-]\s*(.+)$", ch[0]["text"], re.S)
            if m:
                ch[0]["text"] = m.group(1).strip()
                ch.insert(1, {"letter": "B", "text": m.group(2).strip(), "images": []})
    return questions


def parse_bare(article: Tag, titles=()) -> list:
    """Legacy pages whose questions carry no numbers at all.

    Shape:
        stem (possibly wrapped over several lines)
        A) ...
        ...
        E) ...
        Cevap : C) ...

    The page title is repeated above the first stem on these pages, so any line
    equal to a known title is dropped. A question ends at its answer line; a
    block without 4-5 options and a non-empty stem is not a question (this is
    how notes and captions are ignored).
    """
    lines = _lines(article)
    titles = {t.strip() for t in titles if t and t.strip()}
    questions: list = []
    cur: dict | None = None
    for ln in lines:
        if STOP.match(ln):
            break
        am = ANS_RE.match(ln)
        if am:
            if cur and 4 <= len(cur["choices"]) <= 5 and cur["stem"].strip():
                cur["answer"] = am.group(1)
                questions.append(cur)
            cur = None
            continue
        cm = C_RE.match(ln)
        if cm:
            if cur is None:
                continue
            if len(cur["choices"]) < 5:
                cur["choices"].append({"letter": cm.group(1),
                                       "text": cm.group(2).strip(), "images": []})
            continue
        if ln in titles:
            continue
        if cur is None and any(t and ln.startswith(t) for t in titles):
            # Title block repeated above the first stem, sometimes with a
            # "… 2021-2022 Kitabından" suffix on a separate line.
            continue
        if cur is None:
            cur = {"n": 0, "type": "legacy_text", "stem": ln, "stem_images": [],
                   "tables": [], "choices": [], "answer": "UNKNOWN"}
        elif not cur["choices"]:
            cur["stem"] += "\n" + ln
        else:
            cur["choices"][-1]["text"] += " " + ln
    for i, q in enumerate(questions, 1):
        q["n"] = i
    return questions


def extract(html: str) -> list:
    soup = BeautifulSoup(html, "lxml")
    art = (soup.select_one(".cm-entry-summary")
           or soup.select_one(".entry-content")
           or soup.find("article"))
    if art is None:
        return []
    questions = parse_legacy(art)
    if questions:
        return questions
    # Older pages omit question numbers entirely; fall back to splitting on the
    # answer lines. Nothing is inferred: the same stems/options/answers are read.
    titles = []
    h1 = soup.find("h1")
    if h1:
        titles.append(h1.get_text(" ", strip=True))
    if soup.title:
        titles.append(soup.title.get_text(" ", strip=True))
    return parse_bare(art, titles)
