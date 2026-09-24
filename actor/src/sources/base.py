import re
from urllib.parse import urlparse

# Map domain -> default opportunity_type inference
DOMAIN_TO_TYPE = {
    "ycombinator.com": "jobs_remote",
    "workatastartup.com": "jobs_remote",
    "devpost.com": "hackathons",
    "opportunitydesk.org": "fellowships",
    "opportunitydesk": "fellowships",
    "eventbrite.com": "conferences",
    "eventbrite": "conferences",
}

def infer_type(source_domain: str, text: str) -> str:
    t = text.lower()
    if "hackathon" in t: return "hackathons"
    if "scholarship" in t: return "scholarships"
    if "fellowship" in t: return "fellowships"
    if "grant" in t or "funding" in t: return "grants"
    if "intern" in t: return "internships"
    if "conference" in t: return "conferences"
    if "event" in t: return "events"
    if "startup" in t and ("fund" in t or "grant" in t): return "startup_funding"
    # domain fallback
    if source_domain:
        for dom, typ in DOMAIN_TO_TYPE.items():
            if dom in source_domain:
                return typ
    return "jobs_remote"

def clean_title(text: str, max_len: int = 120) -> str:
    return re.sub(r"\s+", " ", text or "").strip()[:max_len]

def parse_organization(soup, url: str, fallback: str = "Verified Partner Source") -> str:
    # Try common selectors for org
    for sel in ["[data-org]", ".company", ".organization", ".employer", "meta[property='og:site_name']"]:
        try:
            if "meta" in sel:
                m = soup.select_one(sel)
                if m and m.get("content"):
                    return m["content"].strip()[:60]
            else:
                el = soup.select_one(sel)
                if el and el.get_text().strip():
                    return el.get_text().strip()[:60]
        except Exception:
            pass
    # domain as org fallback
    try:
        return urlparse(url).netloc.replace("www.", "").split(".")[0].title() or fallback
    except Exception:
        return fallback

def parse_location(soup, url: str, default: str = "Global / Remote") -> str:
    for sel in [".location", "[data-location]", ".job-location"]:
        try:
            el = soup.select_one(sel)
            if el and el.get_text().strip():
                return el.get_text().strip()[:40]
        except Exception:
            pass
    # Heuristic from URL
    if any(x in url.lower() for x in ["remote", "global", "worldwide"]):
        return "Global / Remote"
    return default

def dedupe_key(url: str) -> str:
    # Normalize for dedupe: strip query utm, trailing slash
    try:
        p = urlparse(url)
        base = f"{p.scheme}://{p.netloc}{p.path.rstrip('/')}"
        return base.lower()
    except Exception:
        return url.lower()
