from .base import infer_type, parse_organization, parse_location

DOMAIN = "devpost.com"
DEFAULT_URLS = ["https://devpost.com/hackathons"]


def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "devpost.com"
    # Devpost is hackathons-first, but its software-project listings are
    # internships and its sponsor pages are conferences, so content still wins.
    return {
        "opportunity_type": infer_type(domain, title_text),
        "organization": parse_organization(soup, source_url, fallback="Devpost"),
        "location": parse_location(soup, source_url, default="Global / Online"),
        "source_domain": domain,
    }
