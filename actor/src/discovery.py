"""
Query-driven discovery across Google, LinkedIn, generic websites and Telegram.

WHY THIS MODULE EXISTS
----------------------
The actor used to crawl five hardcoded listing pages (YC, Work at a Startup,
Devpost, OpportunityDesk, Eventbrite). That is a fixed set of URLs, so:

  * it structurally cannot find a listing on a company career page, a national
    job board, a Telegram channel, or anything posted in the last hour;
  * "African-first" was a positioning claim, not a data property — not one of
    the five boards is African.

The engine turns a *query* ("software internship Nigeria", "remote developer
fellowship", "tech grant Africa", "global design competition") into concrete
`site:`-scoped search tasks, one per platform, which `main.py` hands to the
crawler. That is what makes discovery query-driven rather than URL-driven, and
it is how regional and pan-African sources get into the catalog at all.

PLATFORMS
---------
  google     open-web SERP. The long tail: company career sites, national job
              boards, grant portals, anything with an indexable page.
  linkedin   the professional-network feed. Most senior African tech roles are
              posted here first, often before the company's own careers page.
  telegram   the channels African developer communities actually post in.
              Public web previews, no auth.
  website    aggregators with no public API that must be read as plain HTML.

Each platform is deliberately narrow: a single `site:` operator per task, so the
crawler knows which parser to run and a task can never silently become a
whole-domain crawl.
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional
from urllib.parse import quote_plus

# ---------------------------------------------------------------------------
# Platform registry
# ---------------------------------------------------------------------------

PLATFORM_GOOGLE = "google"
PLATFORM_LINKEDIN = "linkedin"
PLATFORM_TELEGRAM = "telegram"
PLATFORM_WEBSITE = "website"

ALL_PLATFORMS = (PLATFORM_GOOGLE, PLATFORM_LINKEDIN, PLATFORM_TELEGRAM, PLATFORM_WEBSITE)

#: Keyword -> the `site:` scope that platform should be searched on. Order is
#: significant: the first scope wins, so LinkedIn is checked before the generic
#: web search.
_PLATFORM_SCOPES: Dict[str, str] = {
    PLATFORM_LINKEDIN: "linkedin.com/jobs",
    PLATFORM_TELEGRAM: "t.me",
    PLATFORM_GOOGLE: "google.com",
}

_SITE_RE = re.compile(r"\bsite:([^\s]+)", re.I)


class SearchTask:
    """
    One unit of discovery work: a query bound to one platform.

    `url` is a fully-formed, crawlable search URL. `platform` selects the
    parser. `query` is kept for provenance so a pushed record can be traced back
    to the query that found it.
    """

    __slots__ = ("platform", "query", "url", "seed")

    def __init__(self, platform: str, query: str, url: str, seed: bool = False):
        self.platform = platform
        self.query = query
        self.url = url
        self.seed = seed

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"SearchTask({self.platform}, {self.query!r})"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, SearchTask) and (self.platform, self.url) == (other.platform, other.url)

    def __hash__(self) -> int:
        return hash((self.platform, self.url))


# ---------------------------------------------------------------------------
# Query construction
# ---------------------------------------------------------------------------

#: Characters that break a search-engine query string or a `site:` operator.
#: `:` must survive — stripping it turns `site:linkedin.com/jobs` into
#: `site linkedin.com/jobs`, which silently degrades every platform-scoped query
#: to an unscoped web search.
_UNSAFE_QUERY_CHARS = re.compile(r"[^\w\s+#./@:-]+")
_MULTISPACE = re.compile(r"\s+")


def sanitize_query_term(value: object, max_len: int = 80) -> str:
    """Reduce arbitrary input to a safe search term. Returns '' if nothing is left."""
    if not isinstance(value, str):
        return ""
    cleaned = _UNSAFE_QUERY_CHARS.sub(" ", value)
    cleaned = _MULTISPACE.sub(" ", cleaned).strip()
    return cleaned[:max_len]


def platform_for_query(query: str) -> str:
    """Which platform a `site:`-scoped query is aimed at."""
    match = _SITE_RE.search(query or "")
    if not match:
        return PLATFORM_GOOGLE
    host = match.group(1).lower()
    if "linkedin." in host:
        return PLATFORM_LINKEDIN
    if host in ("t.me", "telegram.me") or host.endswith(".t.me"):
        return PLATFORM_TELEGRAM
    if "google." in host:
        return PLATFORM_GOOGLE
    return PLATFORM_WEBSITE


def build_task(query: str) -> Optional[SearchTask]:
    """Turn one `site:`-scoped query into a crawlable task, or None if unusable."""
    query = (query or "").strip()
    if not query:
        return None
    platform = platform_for_query(query)
    scope_match = _SITE_RE.search(query)
    scope = scope_match.group(1) if scope_match else None
    terms = _SITE_RE.sub("", query).strip()

    encoded = quote_plus(query)
    if platform == PLATFORM_GOOGLE:
        # A `site:google.com/search` query is a SERP fetch; the scope is the
        # engine, not a site to restrict to, so it is stripped from the terms.
        url = f"https://www.google.com/search?q={encoded}&num=30"
    elif platform == PLATFORM_LINKEDIN:
        path = scope or "linkedin.com/jobs"
        url = f"https://www.google.com/search?q={encoded}&num=30"
        # LinkedIn's own guest job search is more reliable than a SERP when
        # reachable, so record the direct URL for the crawler to prefer.
        direct = f"https://www.{path}/search?keywords={quote_plus(terms)}&location={quote_plus('Africa')}"
        return SearchTask(platform, query, direct, seed=True)
    elif platform == PLATFORM_TELEGRAM:
        url = f"https://www.google.com/search?q={encoded}&num=30"
    else:
        url = f"https://{scope}?q={quote_plus(terms)}" if scope else f"https://duckduckgo.com/?q={encoded}"

    return SearchTask(platform, query, url)


# ---------------------------------------------------------------------------
# Query expansion
# ---------------------------------------------------------------------------

#: Opportunity type -> search phrasing that actually appears in postings.
#: "jobs_remote" is not something anyone writes in a job title.
TYPE_PHRASES: Dict[str, List[str]] = {
    "jobs_remote": ["remote job", "remote jobs", "work from home"],
    "jobs_hybrid": ["hybrid job", "hybrid role"],
    "jobs_onsite": ["on-site job", "onsite engineer"],
    "internships": ["internship", "software engineering internship", "tech internship"],
    "conferences": ["tech conference", "developer conference"],
    "fellowships": ["fellowship", "developers fellowship", "tech fellowship"],
    "events": ["tech meetup", "developer event"],
    "startup_funding": ["seed funding", "pre-seed round", "startup investment"],
    "grants": ["tech grant", "innovation grant", "grant for startups"],
    "scholarships": ["scholarship", "tech scholarship", "engineering scholarship"],
    "hackathons": ["hackathon", "developer hackathon", "AI hackathon"],
}

#: African and pan-African geography, used when a run asks for regional coverage
#: but supplies no explicit location.
AFRICAN_REGIONS = [
    "Nigeria", "Kenya", "Ghana", "Rwanda", "South Africa", "Ethiopia", "Egypt",
    "Morocco", "Tunisia", "Senegal", "Uganda", "Tanzania", "Cameroon", "Zambia",
    "Zimbabwe", "Botswana", "Namibia", "Mozambique", "Angola", "Algeria",
    "Libya", "Sudan", "Africa", "Pan-African", "West Africa", "East Africa",
    "North Africa", "Southern Africa",
]

#: Current-year token, appended to grant/fellowship queries because those are
#: published per-cohort and last year's page is what a bare query returns.
def _year() -> str:
    from datetime import datetime, timezone

    return str(datetime.now(timezone.utc).year)


def expand_queries(
    categories: Optional[Iterable[str]] = None,
    locations: Optional[Iterable[str]] = None,
    opportunity_types: Optional[Iterable[str]] = None,
    extra: Optional[Iterable[str]] = None,
    max_tasks: int = 60,
) -> List[str]:
    """
    Expand structured input into concrete `site:`-scoped queries.

    Cross-product is deliberately *not* a full cartesian product: with 5 types x
    8 locations x 4 platforms that is 160 tasks and most of them are noise. The
    expansion is:

      * every explicit `extra` query, verbatim
      * every (category, location) pair, on LinkedIn and Google
      * every category on its own, scoped to Africa
      * every requested opportunity type, on Google and Telegram

    A cohort-year token is added to grants/fellowships/scholarships/hackathons
    and competitions, because those are the queries where last cycle's page
    dominates the results.

    The result is deduplicated and capped. Callers get a list, never a generator,
    so a run's total query count is knowable before it starts.
    """
    cats = [t for t in (sanitize_query_term(c) for c in (categories or [])) if t]
    locs = [t for t in (sanitize_query_term(l) for l in (locations or [])) if t]
    types = [t for t in (sanitize_query_term(t) for t in (opportunity_types or [])) if t]
    extras = [t for t in (sanitize_query_term(q) for q in (extra or [])) if t]

    out: List[str] = []
    seen = set()

    def push(value: str) -> None:
        text = " ".join(value.split())
        if text and text.lower() not in seen and len(out) < max_tasks:
            seen.add(text.lower())
            out.append(text)

    for query in extras:
        push(query)

    for category in cats:
        for location in locs:
            push(f"site:linkedin.com/jobs {category} {location}")
            push(f'site:google.com/search "{category}" "{location}" {_year()}')
        # Region-wide sweep even when specific locations were given: a
        # location-scoped query misses pan-African and "remote, must be in
        # Africa" listings, which is a large and real segment.
        push(f"site:linkedin.com/jobs {category} Africa")
        push(f'site:google.com/search "{category}" Africa {_year()}')
        push(f"site:t.me {category} Africa")

    for opp_type in types:
        for phrase in TYPE_PHRASES.get(opp_type, [opp_type])[:2]:
            push(f'site:google.com/search "{phrase}" Africa {_year()}')
            push(f"site:t.me {phrase} Africa")
            for location in locs[:3]:
                push(f"site:linkedin.com/jobs {phrase} {location}")

    # A run that asked for nothing still gets a standing regional sweep, so the
    # default behaviour backs the African-first positioning with real data.
    if not out:
        for location in AFRICAN_REGIONS[:6]:
            push(f"site:linkedin.com/jobs software engineer {location}")
        push(f'site:google.com/search "tech grant" Africa {_year()}')
        push(f'site:google.com/search "developers fellowship" Africa {_year()}')
        push(f"site:t.me tech jobs Africa")

    return out


def build_tasks(
    categories: Optional[Iterable[str]] = None,
    locations: Optional[Iterable[str]] = None,
    opportunity_types: Optional[Iterable[str]] = None,
    extra: Optional[Iterable[str]] = None,
    max_tasks: int = 60,
) -> List[SearchTask]:
    """`expand_queries` + `build_task`, with unusable queries dropped."""
    tasks: List[SearchTask] = []
    for query in expand_queries(
        categories, locations, opportunity_types, extra, max_tasks=max_tasks
    ):
        task = build_task(query)
        if task is not None and task not in tasks:
            tasks.append(task)
    return tasks


# ---------------------------------------------------------------------------
# Result extraction — turning a SERP into candidate detail URLs
# ---------------------------------------------------------------------------

#: SERP / aggregator chrome that is never an opportunity.
_SERP_CHROME = re.compile(
    r"^(images|videos|maps|news|shopping|more|sign in|log in|sign up|"
    r"settings|privacy|terms|help|feedback|jobs|home|cache|advanced search|"
    r"previous|next|page \d+)$",
    re.I,
)


def iter_result_links(soup, base_url: str) -> List[str]:
    """
    Candidate detail URLs from a search results page or an aggregator index.

    Deliberately permissive about *structure* and strict about *host*: the input
    is a SERP, a Telegram channel preview, a LinkedIn search page or a plain
    index page, and they share nothing but anchors. The real filtering happens
    downstream in `main.py`, which has the record context (title, card text) and
    can afford to be strict.
    """
    if soup is None:
        return []

    from urllib.parse import urljoin, urlparse

    seen = set()
    out: List[str] = []

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        label = " ".join(anchor.get_text(" ", strip=True).split())

        if not href or len(label) < 8:
            continue
        if _SERP_CHROME.match(label):
            continue
        if href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            continue

        # Strip fragments: they never identify a distinct document.
        absolute = absolute.split("#", 1)[0]
        key = absolute.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(absolute)

        if len(out) >= 200:
            break

    return out
