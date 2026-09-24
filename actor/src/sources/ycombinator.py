from .base import infer_type, parse_organization, parse_location

DOMAIN = "ycombinator.com"
DEFAULT_URLS = ["https://www.ycombinator.com/jobs"]

def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "ycombinator.com"
    return {
        "opportunity_type": infer_type(domain, title_text),
        "organization": parse_organization(soup, source_url, fallback="YC Company"),
        "location": parse_location(soup, source_url, default="Global / Remote"),
        "source_domain": domain,
    }
