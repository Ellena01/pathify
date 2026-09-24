from typing import List, Dict, Any

def compute_match(skills_required: List[str], user_skills: List[str], weights: Dict[str, float] | None = None) -> Dict[str, Any]:
    """
    Weighted match scoring.
    skills_required: list of canonical strings
    user_skills: list of user skills
    weights: dict canonical -> weight (default 1.0)
    Returns {match_score, matched_skills, skill_gap, match_breakdown}
    """
    weights = weights or {}
    lower_user = [s.lower() for s in user_skills]

    matched: List[str] = []
    gaps: List[str] = []
    by_category: Dict[str, Dict[str, int]] = {}
    total_weight = 0.0
    matched_weight = 0.0

    # Import category lazily to avoid circular
    try:
        from .skills.ontology import category_for
    except Exception:
        def category_for(_): return "tech"

    for skill in skills_required:
        w = float(weights.get(skill, weights.get(skill.lower(), 1.0)))
        total_weight += w
        if skill.lower() in lower_user:
            matched.append(skill)
            matched_weight += w
            cat = category_for(skill)
            by_category.setdefault(cat, {"matched": 0, "total": 0, "weight_matched": 0, "weight_total": 0})
            by_category[cat]["matched"] += 1
            by_category[cat]["total"] += 1
            by_category[cat]["weight_matched"] += w
            by_category[cat]["weight_total"] += w
        else:
            gaps.append(skill)
            cat = category_for(skill)
            by_category.setdefault(cat, {"matched": 0, "total": 0, "weight_matched": 0, "weight_total": 0})
            by_category[cat]["total"] += 1
            by_category[cat]["weight_total"] += w

    match_score = round((matched_weight / total_weight) * 100) if total_weight > 0 else 0

    # Build breakdown with percentages per category
    breakdown = {
        "weighted": match_score,
        "by_category": {
            cat: {
                "matched": vals["matched"],
                "total": vals["total"],
                "pct": round((vals["weight_matched"] / vals["weight_total"] * 100)) if vals["weight_total"] else 0
            }
            for cat, vals in by_category.items()
        },
        "total_weight": total_weight,
        "matched_weight": matched_weight,
    }

    return {
        "match_score": match_score,
        "matched_skills": matched,
        "skill_gap": gaps,
        "match_breakdown": breakdown,
    }

def merge_skills_with_weights(rich_skills: List[Dict[str, Any]]) -> tuple[List[str], Dict[str, float]]:
    """From rich Skill dicts to legacy list + weights map."""
    legacy = [s["canonical"] for s in rich_skills]
    weights = {s["canonical"]: float(s.get("weight", 1.0)) for s in rich_skills}
    return legacy, weights
