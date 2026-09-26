"""
Shared per-source extraction helpers.

Deliberately dependency-free (stdlib + BeautifulSoup, which the caller already
has) so every source module can import from here without creating a cycle, and
so a single source's failure cannot cascade.
"""

import re
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Type inference
# ---------------------------------------------------------------------------

#: Ordered ladder: the first marker found wins, so the more specific
#: opportunity types are tested before the broad "job" fallback.
_TYPE_MARKERS = (
    ("hackathons", ("hackathon", "hack ", "codefest", "jam ", "buildathon", "datathon")),
    ("scholarships", ("scholarship", "bursary", "tuition waiver", "financial aid", "fellowship fund")),
    ("fellowships", ("fellowship", "fellow program", "fellow programme", "cohort program", "residence program")),
    ("startup_funding", ("pre-seed", "seed round", "seed fund", "raise capital", "investment round", "vc round")),
    ("grants", ("grant", "call for applications", "funding call", "challenge fund", "innovation fund")),
    ("internships", ("internship", "intern ", "interns", "placement year", "traineeship", "apprenticeship", "work placement")),
    ("conferences", ("conference", "summit", "symposium", "congress", "expo")),
    ("events", ("meetup", "meet-up", "workshop", "webinar", "bootcamp", "info session")),
    ("jobs_hybrid", ("hybrid role", "hybrid job", "hybrid position")),
)

#: Domains that are unambiguously one vertical, used as a fallback.
DOMAIN_TO_TYPE = {
    "ycombinator.com": "jobs_remote",
    "workatastartup.com": "jobs_remote",
    "weworkremotely.com": "jobs_remote",
    "remoteok.com": "jobs_remote",
    "remotive.com": "jobs_remote",
    "remoteok.io": "jobs_remote",
    "himalayas.app": "jobs_remote",
    "workingnomads.com": "jobs_remote",
    "remote4you.com": "jobs_remote",
    "nodeskout.com": "jobs_remote",
    "jobicy.com": "jobs_remote",
    "remoteresources.com": "jobs_remote",
    "devpost.com": "hackathons",
    "hackathons.com": "hackathons",
    "mlh.io": "hackathons",
    "unstop.com": "hackathons",
    "eventbrite.com": "events",
    "opportunitydesk.org": "fellowships",
    "africa.careers": "jobs_remote",
    "techcabal.com": "fellowships",
    "afrilabs.com": "fellowships",
    "orenda.co.uk": "fellowships",
    "turing.com": "jobs_remote",
    "andela.com": "jobs_remote",
    "welcometothejungle.com": "jobs_remote",
    "jobberman.com": "jobs_remote",
    "myjobmag.com": "jobs_remote",
    "brightercountry.com": "jobs_remote",
    "droneacademy.com": "internships",
    "codebar.io": "internships",
    "nairabotics.com": "internships",
    "inecoonline.com": "internships",
}


def infer_type(source_domain: str, text: str) -> str:
    """
    Classify a listing into Pathify's `opportunity_type` enum.

    Content markers take priority over the domain: a Devpost page hosting a
    sponsor's conference link is still a hackathon, and an OpportunityDesk page
    linking a grant is still a grant. The domain is the tiebreaker for pages
    with no signal at all.
    """
    t = (text or "").lower()

    if "remote" in t and not any(
        marker in t for _, markers in _TYPE_MARKERS for marker in markers
    ):
        return "jobs_remote"

    for opp_type, markers in _TYPE_MARKERS:
        if any(marker in t for marker in markers):
            return opp_type

    if "remote" in t or "work from home" in t or "anywhere" in t:
        return "jobs_remote"
    if "job" in t or "role" in t or "position" in t or "vacancy" in t or "hiring" in t:
        return "jobs_remote"

    if source_domain:
        for dom, opp_type in DOMAIN_TO_TYPE.items():
            if dom in source_domain:
                return opp_type

    return "jobs_remote"


# ---------------------------------------------------------------------------
# Text / title / organization / location
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")
_SCRIPT = re.compile(r"<(script|style|noscript|template)\b[^>]*>.*?</\1>", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")

#: Link/label text that is a site's own furniture, never a listing title.
_CHROME_TEXT = re.compile(
    r"^(home|about|about us|contact( us)?|login|log in|sign in|sign up|register|"
    r"privacy( policy)?|terms( of( use| service)?)?|cookies?|cookie policy|"
    r"search|menu|next|prev|previous|back|more|read more|"
    r"view all|see all|show all|load more|apply now|view job|view details|"
    r"learn more|get started|subscribe|newsletter|filter|clear|share|"
    r"save|bookmark|report|reviews?|salary|benefits?)$",
    re.I,
)


def strip_tags(value: str) -> str:
    """Readable text from an HTML fragment."""
    if not value:
        return ""
    text = _SCRIPT.sub(" ", value)
    text = _TAG.sub(" ", text)
    return _WS.sub(" ", text).strip()


def clean_title(text: str, max_len: int = 180) -> str:
    """
    A listing title, or '' if the text is site furniture.

    Returning '' rather than a cleaned-up "Read more" matters: `main.py` treats a
    falsy title as "not an opportunity" and skips the record, which is the
    cheapest possible way to keep nav links out of the catalog.
    """
    cleaned = _WS.sub(" ", strip_tags(text)).strip()
    if not cleaned or _CHROME_TEXT.match(cleaned):
        return ""
    return cleaned[:max_len]


_ORG_SELECTORS = (
    "[data-organization]",
    "[data-org]",
    "[itemprop='hiringOrganization']",
    ".company",
    ".company-name",
    ".organization",
    ".employer",
    ".hiring-company",
    "h3 a",
)


def parse_organization(soup, url: str, fallback: str = "Verified Partner Source") -> str:
    """
    The hiring organisation.

    Prefers a semantic marker, then falls back to the host. A host-derived name
    ("boards.example") is honest about being derived; inventing a nicer one is
    not, so the domain-derived form is kept.

    `soup` may be None — `main.py` calls this before a page has parsed, and a
    source module that raised here would take down the whole handler.
    """
    if soup is not None:
        for selector in _ORG_SELECTORS:
            try:
                element = soup.select_one(selector)
            except Exception:
                continue
            if not element:
                continue
            if element.name == "meta" and element.get("content"):
                value = element["content"].strip()
            else:
                value = element.get_text(" ", strip=True).strip()
            if value:
                return value[:80]

    try:
        netloc = urlparse(url).netloc.lower()
        if netloc:
            return netloc.replace("www.", "").split(".")[0].title()
    except Exception:
        pass
    return fallback


_LOCATION_SELECTORS = (
    "[data-location]",
    "[itemprop='jobLocation']",
    ".location",
    ".job-location",
    ".locations",
    "[class*='location']",
)

_REMOTE_MARKERS = (
    "remote", "global", "worldwide", "anywhere", "distributed",
    "work from home", "wfh", "virtual",
)


def parse_location(soup, url: str, default: str = "Global / Remote") -> str:
    """
    Location text, or a remote/global label.

    Falls back to scanning the URL, which is how most boards encode it
    (`/jobs/remote-nigeria`), and finally to the source's own default so a record
    is never left locationless — `lib/matching.ts` scores location out of 20.

    `soup` may be None; see `parse_organization`.
    """
    if soup is not None:
        for selector in _LOCATION_SELECTORS:
            try:
                element = soup.select_one(selector)
            except Exception:
                continue
            if not element:
                continue
            value = element.get_text(" ", strip=True).strip()
            if not value and element.get("content"):
                value = str(element.get("content")).strip()
            if value:
                return value[:80]

    href = (url or "").lower()
    if any(marker in href for marker in _REMOTE_MARKERS):
        return "Global / Remote"
    return default


# ---------------------------------------------------------------------------
# Dedupe
# ---------------------------------------------------------------------------

#: Campaign parameters. Stripped for the dedupe key only — never from the stored
#: `application_url`, which is what the user clicks.
_TRACKING = ("utm_", "fbclid", "gclid", "mc_", "ref", "referrer", "source", "src", "trk")

#: Parameters that carry the resource identity and must be preserved. On several
#: boards the entire job identity lives in the query string; stripping these
#: would collapse every listing on the board into one row.
_IDENTITY = ("gh_jid", "jobid", "jid", "vacancyid", "opportunityid", "offeringid", "postingid", "id")


def _is_tracking(key: str) -> bool:
    lowered = key.lower()
    if lowered in _IDENTITY:
        return False
    return any(lowered == t or lowered.startswith(t) for t in _TRACKING)


def dedupe_key(url: str) -> str:
    """
    Normalised identity for a URL: scheme + lowercased host + path + identity
    query parameters.

    Mirrors `dedupeKey` in `frontend/app/api/sync/normalize.ts`. Both sides need
    the same key so the actor's in-run dedupe and the sync's cross-run dedupe
    agree.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return str(url).lower()

    kept = [
        (k.lower(), v)
        for k, v in _pairs(parsed.query)
        if not _is_tracking(k)
    ]
    kept.sort()
    query = "&".join(f"{k}={v}" for k, v in kept)
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc.lower()}{path}{'?' + query if query else ''}"


def _pairs(query: str):
    for part in (query or "").split("&"):
        if not part:
            continue
        key, _, value = part.partition("=")
        yield key, value
