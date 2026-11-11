"""Rules for a translation result, shared by the merger and the state model.

The merge decision (may I write these Arabic fields into canonical JSON?) and
the derived translation state (is this exam queued/stale/incomplete?) must use
exactly the same rules. Keeping them here prevents the two from drifting.
"""


def hash_matches(queue: dict, result: dict) -> bool:
    """The result was produced from the current queue, not an older source."""
    return result.get("source_hash") == queue.get("source_hash")


def missing_items(queue: dict, result: dict) -> list:
    """Queue ids with no non-empty Arabic in the result."""
    got = {item.get("id"): item.get("ar", "")
           for item in result.get("items", [])}
    return [item["id"] for item in queue.get("items", [])
            if not str(got.get(item["id"], "")).strip()]


def is_translated(doc: dict) -> bool:
    """Every question and option already carries its Arabic field."""
    return all(q.get("stem_ar") and all(c.get("text_ar") for c in q["choices"])
               for q in doc.get("questions", []))
