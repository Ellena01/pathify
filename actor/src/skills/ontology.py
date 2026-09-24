import json
import re
from pathlib import Path
from typing import Dict, List

TAXONOMY_PATH = Path(__file__).with_name("taxonomy.json")

_canonical_map: Dict[str, dict] = {}
_alias_to_canonical: Dict[str, str] = {}

def load_taxonomy() -> List[dict]:
    global _canonical_map, _alias_to_canonical
    if _canonical_map:
        return list(_canonical_map.values())
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    for entry in data:
        canon = entry["canonical"]
        _canonical_map[canon.lower()] = entry
        _alias_to_canonical[canon.lower()] = canon
        for alias in entry.get("aliases", []):
            _alias_to_canonical[alias.lower()] = canon
    return data

def normalize_skill(raw: str) -> str | None:
    if not _alias_to_canonical:
        load_taxonomy()
    key = raw.strip().lower()
    if key in _alias_to_canonical:
        return _alias_to_canonical[key]
    # fuzzy: try stripping punctuation
    key2 = re.sub(r"[^a-z0-9+#/. ]", "", key)
    return _alias_to_canonical.get(key2)

def get_entry(canonical: str) -> dict | None:
    if not _canonical_map:
        load_taxonomy()
    return _canonical_map.get(canonical.lower())

def all_canonicals() -> List[str]:
    if not _canonical_map:
        load_taxonomy()
    return [_alias_to_canonical[k] for k in _canonical_map]

def weight_for(canonical: str) -> float:
    e = get_entry(canonical)
    return float(e.get("weight", 1.0)) if e else 1.0

def category_for(canonical: str) -> str:
    e = get_entry(canonical)
    return e.get("category", "tech") if e else "tech"
