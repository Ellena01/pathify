from .base import infer_type, parse_organization, parse_location

DOMAIN = "eventbrite.com"
DEFAULT_URLS = ["https://www.eventbrite.com/d/online/all-events/"]

def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "eventbrite.com"
    t = title_text.lower()
    opp_type = "conferences" if "conference" in t else "events"
    if "hackathon" in t: opp_type = "hackathons"
    return {
        "opportunity_type": opp_type,
        "organization": parse_organization(soup, source_url, fallback="Eventbrite"),
        "location": parse_location(soup, source_url, default="Online / Global"),
        "source_domain": domain,
    }
