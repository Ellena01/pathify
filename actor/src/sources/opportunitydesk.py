from .base import infer_type, parse_organization, parse_location

DOMAIN = "opportunitydesk.org"
DEFAULT_URLS = [
    "https://opportunitydesk.org/",
    "https://opportunitydesk.org/fellowships/",
    "https://opportunitydesk.org/grants/",
]


def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "opportunitydesk.org"
    opp_type = infer_type(domain, title_text)
    if opp_type == "jobs_remote":
        # OpportunityDesk is fellowships/scholarships/grants only. Falling back
        # to "remote job" here was mislabelling every record on the site.
        opp_type = "fellowships"
    return {
        "opportunity_type": opp_type,
        "organization": parse_organization(soup, source_url, fallback="Opportunity Desk"),
        "location": parse_location(soup, source_url, default="Global"),
        "source_domain": domain,
    }
