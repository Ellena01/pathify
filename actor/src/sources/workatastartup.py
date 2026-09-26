from .base import infer_type, parse_organization, parse_location

DOMAIN = "workatastartup.com"
DEFAULT_URLS = ["https://www.workatastartup.com/jobs"]


def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "workatastartup.com"
    return {
        "opportunity_type": infer_type(domain, title_text),
        "organization": parse_organization(soup, source_url, fallback="YC Startup"),
        "location": parse_location(soup, source_url, default="Remote / On-site"),
        "source_domain": domain,
    }
