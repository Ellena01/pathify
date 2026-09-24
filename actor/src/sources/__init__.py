from . import ycombinator, workatastartup, devpost, opportunitydesk, eventbrite
from .base import infer_type

REGISTRY = {
    "ycombinator.com": ycombinator,
    "workatastartup.com": workatastartup,
    "devpost.com": devpost,
    "opportunitydesk.org": opportunitydesk,
    "eventbrite.com": eventbrite,
}

DEFAULT_URLS_BY_DOMAIN = {
    "ycombinator.com": ycombinator.DEFAULT_URLS,
    "workatastartup.com": workatastartup.DEFAULT_URLS,
    "devpost.com": devpost.DEFAULT_URLS,
    "opportunitydesk.org": opportunitydesk.DEFAULT_URLS,
    "eventbrite.com": eventbrite.DEFAULT_URLS,
}

# Map opportunityTypes enum → domain
TYPE_TO_DOMAINS = {
    "jobs_remote": ["ycombinator.com", "workatastartup.com"],
    "jobs_hybrid": ["ycombinator.com", "workatastartup.com"],
    "jobs_onsite": ["ycombinator.com", "workatastartup.com"],
    "internships": ["ycombinator.com", "workatastartup.com"],
    "hackathons": ["devpost.com"],
    "fellowships": ["opportunitydesk.org"],
    "grants": ["opportunitydesk.org"],
    "scholarships": ["opportunitydesk.org"],
    "startup_funding": ["opportunitydesk.org"],
    "conferences": ["eventbrite.com"],
    "events": ["eventbrite.com"],
}

def get_default_urls(opportunity_types: list | None) -> list[str]:
    if not opportunity_types:
        # All MVP 5 defaults
        urls: list[str] = []
        for vs in DEFAULT_URLS_BY_DOMAIN.values():
            urls.extend(vs)
        return urls
    seen = set()
    urls = []
    for typ in opportunity_types:
        for dom in TYPE_TO_DOMAINS.get(typ, []):
            for u in DEFAULT_URLS_BY_DOMAIN.get(dom, []):
                if u not in seen:
                    urls.append(u)
                    seen.add(u)
    return urls or get_default_urls(None)

def resolve_enricher(source_url: str, request_url: str):
    # Match by netloc containing domain
    host = (source_url or request_url or "").lower()
    for dom, mod in REGISTRY.items():
        if dom in host:
            return mod
    # Fallback try request_url host
    host2 = (request_url or "").lower()
    for dom, mod in REGISTRY.items():
        if dom in host2:
            return mod
    return None
