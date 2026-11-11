"""Pure helpers shared by the pipeline stages.

These existed in five or six copies (with subtly different names), which made
it easy to change one call site and forget another. Anything here is pure and
safe to import from any script.
"""
import hashlib
import json
import re


def sha1(text: str) -> str:
    """Cache key for a URL: output/.cache/html/<sha1(url)>.html."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def sha256_json(obj) -> str:
    """Canonical digest of a JSON value (stable key order, UTF-8)."""
    return hashlib.sha256(
        json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def fold(text: str) -> str:
    """Case- and punctuation-insensitive key with Turkish-aware folding.

    "İ" folds to "i" and "I" to "ı", then everything outside letters/digits is
    a space. Used for duplicate detection and course-name matching; never for
    display text.
    """
    s = text.replace("İ", "i").replace("I", "ı").lower()
    return re.sub(r"[^0-9a-zçğıöşüâîû]+", " ", s).strip()


def exam_id(course_slug: str, exam_slug: str) -> str:
    """The stable `<course>__<exam>` id used by JSON, queues and done files."""
    return f"{course_slug}__{exam_slug}"
