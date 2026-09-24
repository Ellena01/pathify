from .base import infer_type, parse_organization, parse_location

DOMAIN = "opportunitydesk.org"
DEFAULT_URLS = ["https://opportunitydesk.org/"]

def enrich(soup, source_url: str, title_text: str) -> dict:
    domain = "opportunitydesk.org"
    t = title_text.lower()
    # OpportunityDesk covers fellowships, scholarships, grants, contests
    opp_type = infer_type(domain, title_text)
    # If generic, default to fellowships for OD
    if opp_type == "jobs_remote" and domain in source_url:
        opp_type = "fellowships"
    return {
        "opportunity_type": opp_type,
        "organization": parse_organization(soup, source_url, fallback="Opportunity Desk"),
        "location": parse_location(soup, source_url, default="Global"),
        "source_domain": domain,
    }
