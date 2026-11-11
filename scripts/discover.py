#!/usr/bin/env python3
"""Discover exams per course page from cached HTML.

Output: config/courses.json (Phase 1) and config/discovered.json (all).
Exam identity comes from the anchor text (type + period), never from URL
guessing; URL is only used to filter noise and to fetch.
"""
import hashlib
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "output/.cache/html"
CONFIG = ROOT / "config"

COURSES = [
    ("ANNE BABA EĞİTİMİ", "anne-baba-egitimi",
     "https://lolonolo.com/auzef/anne-baba-egitimi/",
     "https://lolonolo.com/auzef/anne-baba-egitimi/"),
    ("ÇOCUK GELİŞİMİ UYGULAMALARI I", "cocuk-gelisimi-uygulamalari-i",
     "https://lolonolo.com/auzef/cocuk-gelisimi-uygulamalari-i/",
     "https://lolonolo.com/auzef/cocuk-gelisimi-uygulamalari-i/"),
    ("ÇOCUK HAKLARI VE HUKUKU", "cocuk-haklari-ve-hukuku",
     "https://lolonolo.com/auzef/cocuk-haklari-ve-hukuku/",
     "https://lolonolo.com/auzef/cocuk-haklari-ve-hukuku/"),
    ("ÇOCUKLUKTA YABANCI DİL OLARAK TÜRKÇE ÖĞRETİMİ",
     "cocuklukta-yabanci-dil-olarak-turkce-ogretimi",
     "https://lolonolo.com/auzef/cocuklukta-yabanci-dil-olarak-turkce-ogretimi/",
     "https://lolonolo.com/auzef/cocuklukta-yabanci-dil-olarak-turkce-ogretimi/"),
    ("İLKOKULA HAZIRLIK", "ilkokula-hazirlik",
     "https://lolonolo.com/auzef/ilkokula-hazirlik/",
     "https://lolonolo.com/auzef/ilkokula-hazirlik/"),
    ("OKUL ÖNCESİ DÖNEMDE DUYU EĞİTİMİ", "okul-oncesi-donemde-duyu-egitimi",
     "https://lolonolo.com/auzef/okul-oncesi-donemde-duyu-egitimi/",
     "https://lolonolo.com/auzef/okul-oncesi-donemde-duyu-egitimi/"),
    ("OYUN VE OYUN TERAPİSİ", "oyun-ve-oyun-terapisi",
     "https://lolonolo.com/auzef/oyun-ve-oyun-terapisi/",
     "https://lolonolo.com/auzef/oyun-ve-oyun-terapisi/"),
    ("PSİKOMETRİK - GELİŞİMSEL ÖLÇME VE DEĞERLENDİRME",
     "psikometrik-gelisimsel-olcme-ve-degerlendirme",
     "https://lolonolo.com/auzef/psikometrik-ve-gelisimsel-olcme-ve-degerlendirme/",
     "https://lolonolo.com/auzef/psikometrik-ve-gelisimsel-olcme-ve-degerlendirme/"),
    ("SOSYAL-DUYGUSAL GELİŞİM", "sosyal-duygusal-gelisim",
     "https://lolonolo.com/auzef/sosyal-duygusal-gelisim/",
     "https://lolonolo.com/auzef/sosyal-duygusal-gelisim/"),
]


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def norm(s: str) -> str:
    s = s.replace("\xa0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", s).strip()


def classify(text: str):
    t = text.lower()
    if "ünite" in t or "unite" in t:
        return "unite"
    if "yaz okulu" in t or "yaz-okulu" in t:
        return "yaz-okulu"
    if "büt" in t or "but" in t:
        return "butunleme"
    if "vize" in t or "ara sınav" in t or "arasınav" in t:
        return "vize"
    if "final" in t:
        return "final"
    return None


def period_of(text: str):
    m = re.search(r"(20\d{2})\s*[-–/]\s*(\d{2,4})", text)
    if m:
        a = m.group(1)
        b = m.group(2)
        if len(b) == 2:
            b = a[:2] + b
        return f"{a}-{b}"
    m = re.search(r"(20\d{2})", text)
    return m.group(1) if m else None


def is_mock(text: str) -> bool:
    return "deneme" in text.lower()


def main() -> None:
    out = []
    for name, slug, page, canonical in COURSES:
        path = CACHE / (sha1(page) + ".html")
        html = path.read_text(encoding="utf-8")
        soup = BeautifulSoup(html, "lxml")
        exams, seen = [], set()
        for a in soup.find_all("a", href=True):
            href = a["href"].split("#")[0]
            if not re.match(r"^https://lolonolo\.com/20\d{2}/\d{2}/\d{2}/", href):
                continue
            if href in seen:
                continue
            text = norm(a.get_text(" ", strip=True))
            etype = classify(text)
            # Ignore unrelated "related posts" (other courses' slugs).
            path_slug = href.rstrip("/").split("/")[-1]
            if slug.split("-")[0] not in path_slug and slug[:12] not in path_slug:
                continue
            if not etype:
                continue
            seen.add(href)
            exams.append({
                "label": text,
                "type": etype,
                "period": period_of(text),
                "mock": is_mock(text),
                "url": href,
            })
        out.append({"course": name, "slug": slug, "page_url": page,
                    "page_file": str(path), "exams": exams})

    CONFIG.mkdir(parents=True, exist_ok=True)
    (CONFIG / "courses.json").write_text(
        json.dumps({"generated_at": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
                    "courses": out}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")

    for c in out:
        from collections import Counter
        print(f"{c['course']:<48} {c['slug']:<46} {len(c['exams']):>3}  "
              + str(dict(Counter(e['type'] for e in c['exams']))))
    print("TOTAL", sum(len(c['exams']) for c in out))


if __name__ == "__main__":
    main()
