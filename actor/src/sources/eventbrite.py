from .base import infer_type, parse_organization, parse_location

DOMAIN = "eventbrite.com"
DEFAULT_URLS = [
    "https://www.eventbrite.com/d/online/all-events/",
    "https://www.eventbrite.com/d/ca--san-francisco/tech-conference/",
]


def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "eventbrite.com"
    return {
        "opportunity_type": infer_type(domain, title_text),
        "organization": parse_organization(soup, source_url, fallback="Eventbrite"),
        "location": parse_location(soup, source_url, default="Online / Global"),
        "source_domain": domain,
    }
