#!/usr/bin/env python3
"""Shared, pure helpers for label classification.

Discovery used to also write config/courses.json from a hard-coded Phase 1
course list. That path is gone: it would overwrite the merged Phase 1 + Phase 2
config. Course pages are discovered by discover_courses.py from cached HTML.
"""
import re


def norm(s: str) -> str:
    """Collapse site whitespace without touching words."""
    s = s.replace("\xa0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", s).strip()


def classify(text: str):
    """Exam type from a link label, or None when the label is not an exam."""
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
    """Term as YYYY-YYYY (or a single year), or None."""
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
