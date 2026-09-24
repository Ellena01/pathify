"""
Hybrid skill extractor — Stage 1 taxonomy regex/rapidfuzz (fast, deterministic) + Stage 3 normalization.
Stage 2 LLM fallback (BEST) is feature-flagged behind useLLM + low confidence.
"""
import hashlib
import json
import os
import re
from typing import List, Dict, Any

try:
    from rapidfuzz import fuzz
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False

from .ontology import load_taxonomy, normalize_skill, category_for, weight_for

# Cache for LLM results by description hash
_LLM_CACHE: Dict[str, List[Dict[str, Any]]] = {}

TAXONOMY = load_taxonomy()

# Pre-compile patterns for speed — alias + canonical → canonical
_ALIAS_PATTERNS: list[tuple[re.Pattern, str]] = []

def _build_patterns():
    global _ALIAS_PATTERNS
    if _ALIAS_PATTERNS:
        return
    for entry in TAXONOMY:
        canon = entry["canonical"]
        variants = [canon] + entry.get("aliases", [])
        for var in variants:
            var_stripped = var.strip()
            if len(var_stripped) <= 2:
                # Short aliases like "js", "AI" cause false positives (Next.js contains js). Require whitespace/punct delimiters
                pat = re.compile(r"(?:^|[\s/,;:\(\)\"'›»])" + re.escape(var_stripped) + r"(?:$|[\s/,;:\(\)\"'›»\.])", re.IGNORECASE)
            else:
                pat = re.compile(r"\b" + re.escape(var_stripped) + r"\b", re.IGNORECASE)
            _ALIAS_PATTERNS.append((pat, canon))

_build_patterns()

def _clean_text(text: str) -> str:
    # Normalize whitespace, truncate to 6000 chars for safety
    t = re.sub(r"\s+", " ", text or "").strip()
    return t[:6000]

def extract_skills_stage1(text: str) -> List[Dict[str, Any]]:
    """Regex + fuzzy stage. Returns List[Skill dict] with canonical, raw, category, confidence, source, weight."""
    clean = _clean_text(text)
    found: Dict[str, Dict[str, Any]] = {}

    # 1) Exact regex matches (confidence 1.0)
    for pat, canon in _ALIAS_PATTERNS:
        m = pat.search(clean)
        if m:
            raw = m.group(0)
            if canon not in found:
                found[canon] = {
                    "canonical": canon,
                    "raw": raw,
                    "category": category_for(canon),
                    "confidence": 1.0,
                    "source": "regex",
                    "weight": weight_for(canon),
                }

    # 2) Fuzzy fallback for multi-word skills if <3 found and rapidfuzz available
    if len(found) < 3 and HAS_RAPIDFUZZ:
        # Check each canonical against clean text sliding windows via token_set_ratio
        lower = clean.lower()
        for entry in TAXONOMY:
            canon = entry["canonical"]
            if canon in found:
                continue
            # Only fuzzy for longer canonicals to avoid noise
            if len(canon) < 4:
                continue
            score = fuzz.partial_ratio(canon.lower(), lower)
            if score >= 92:
                found[canon] = {
                    "canonical": canon,
                    "raw": canon,
                    "category": category_for(canon),
                    "confidence": round(score / 100 * 0.85, 2),  # fuzzy capped at 0.85
                    "source": "embedding",
                    "weight": weight_for(canon),
                }
            if len(found) >= 12:
                break

    # Sort by weight desc then confidence
    skills = sorted(found.values(), key=lambda s: (s["weight"], s["confidence"]), reverse=True)
    return skills[:12]

def _llm_api_call(text: str) -> List[Dict[str, Any]] | None:
    """BEST LLM fallback — tries Gemini Flash, then OpenAI gpt-4o-mini. Returns normalized skills or None."""
    api_key_gemini = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY") or os.getenv("GOOGLE_API_KEY")
    api_key_openai = os.getenv("OPENAI_API_KEY")

    # Gemini 1.5-flash is best price/performance for extraction
    if api_key_gemini:
        try:
            import urllib.request, urllib.error
            prompt = (
                "Extract skills from this opportunity description. Return JSON array of objects "
                '{"canonical": "React", "category": "tech|soft|domain|tool", "confidence": 0.0-1.0}. '
                "Only include real skills mentioned. Limit 12. No explanation.\n\nText: " + text[:3000]
            )
            body = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}
            }).encode()
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key_gemini}",
                data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
                text_out = data["candidates"][0]["content"]["parts"][0]["text"]
                # Parse JSON array from response
                arr = json.loads(text_out)
                if isinstance(arr, dict) and "skills" in arr:
                    arr = arr["skills"]
                normalized = []
                for item in arr[:12]:
                    canon = item.get("canonical") or item.get("name")
                    if not canon:
                        continue
                    norm = normalize_skill(canon) or canon
                    normalized.append({
                        "canonical": norm,
                        "raw": canon,
                        "category": item.get("category", category_for(norm)),
                        "confidence": float(item.get("confidence", 0.8)),
                        "source": "llm",
                        "weight": weight_for(norm),
                    })
                return normalized
        except Exception as e:
            print(f"Gemini LLM fallback failed: {e}")

    if api_key_openai:
        try:
            import urllib.request, json as j
            prompt = (
                "Extract skills JSON array [{canonical, category, confidence}] from opportunity text. "
                "Category tech|soft|domain|tool. Limit 12. Only JSON.\n\n" + text[:3000]
            )
            body = j.dumps({
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "response_format": {"type": "json_object"}
            }).encode()
            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=body, headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key_openai}"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = j.loads(resp.read().decode())
                content = data["choices"][0]["message"]["content"]
                obj = j.loads(content)
                arr = obj.get("skills") or obj.get("data") or obj
                if isinstance(arr, dict):
                    arr = list(arr.values())[0] if isinstance(list(arr.values())[0], list) else [arr]
                normalized = []
                for item in (arr if isinstance(arr, list) else [])[:12]:
                    canon = item.get("canonical") or item.get("name")
                    if not canon:
                        continue
                    norm = normalize_skill(canon) or canon
                    normalized.append({
                        "canonical": norm,
                        "raw": canon,
                        "category": item.get("category", category_for(norm)),
                        "confidence": float(item.get("confidence", 0.8)),
                        "source": "llm",
                        "weight": weight_for(norm),
                    })
                return normalized
        except Exception as e:
            print(f"OpenAI LLM fallback failed: {e}")

    return None

def extract_skills(text: str, use_llm: bool = False) -> List[Dict[str, Any]]:
    """
    Hybrid entrypoint.
    - Stage1 regex (always)
    - If use_llm and (len<3 or avg_confidence<0.6) → Stage2 LLM (BEST)
    - Returns up to 12 skills.
    """
    stage1 = extract_skills_stage1(text)
    avg_conf = sum(s["confidence"] for s in stage1) / len(stage1) if stage1 else 0

    should_llm = use_llm and (len(stage1) < 3 or avg_conf < 0.6)
    if not should_llm:
        return stage1

    h = hashlib.md5(text.encode()).hexdigest()
    if h in _LLM_CACHE:
        return _LLM_CACHE[h]

    llm = _llm_api_call(text)
    if llm and len(llm) > 0:
        # Merge — prefer LLM if it found more, but dedupe canonical
        merged: Dict[str, Dict[str, Any]] = {s["canonical"]: s for s in stage1}
        for s in llm:
            if s["canonical"] not in merged:
                merged[s["canonical"]] = s
        result = sorted(merged.values(), key=lambda s: (s["weight"], s["confidence"]), reverse=True)[:12]
        _LLM_CACHE[h] = result
        return result

    return stage1

def to_legacy_list(skills: List[Dict[str, Any]]) -> List[str]:
    return [s["canonical"] for s in skills]
