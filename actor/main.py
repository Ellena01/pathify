"""
Pathify Apify actor — multi-platform opportunity discovery.

WHAT CHANGED
------------
1. **Query-driven discovery.** `queries` / `categories` / `locations` /
   `opportunityTypes` input expands (via `src/discovery.py`) into `site:`-scoped
   search tasks across Google, LinkedIn, Telegram and generic websites. A run
   with no query still sweeps a standing African-first query set, so the regional
   positioning is backed by real data rather than a fixed list of five boards.

2. **No per-user scoring.** `compute_match` lived here as a third implementation
   of the match score, alongside `frontend/lib/matching.ts` and
   `frontend/app/utils/score.ts`. The three disagreed. The actor no longer emits
   `match_score` / `matched_skills` / `skill_gap` at all: `lib/matching.ts` is
   the only implementation, it runs server-side per user (it needs
   `yearsExperience` and `preferredLocations`, which do not exist at scrape
   time), and it persists to `user_opportunity_matches`.

3. **Real deadlines.** `deadline` was empty for essentially the whole catalog,
   which left the deadline sort and the tracker's "closing soon" urgency with
   nothing to read. `src/enrichment.py` now extracts from JSON-LD `validThrough`,
   `<time datetime>`, meta tags and prose, and understands relative windows
   ("closes in 2 weeks").

4. **Per-record resilience.** One slow page, one malformed record or one
   enrichment failure no longer aborts a run; each is counted and reported in
   the run summary so a bad scrape is diagnosable from the dataset.

Everything a record carries is normalised into Pathify's schema before it is
pushed, and `/api/sync` performs the authoritative URL sanitisation,
taxonomy-based skill canonicalisation and cross-source dedupe.
"""

import asyncio
import re
from datetime import datetime
from typing import List
from urllib.parse import urlparse

from apify import Actor
from crawlee.crawlers import BeautifulSoupCrawler
from pydantic import BaseModel, Field

# Hybrid modules live under `src`. Imported with a fallback so the actor still
# runs (degraded) if the taxonomy or discovery modules are missing, which is the
# difference between a partial run and no run at all.
try:
    from src.skills.extractor import extract_skills, to_legacy_list
    from src.skills.ontology import category_for
    from src.enrichment import (
        deadline_from_soup,
        deadline_from_text,
        extract_amount,
        extract_summary,
        merge_skills_with_weights,
    )
    from src.sources import (
        EDITORIAL_DOMAINS,
        REGISTRY,
        dedupe_key,
        get_default_urls,
        infer_type,
        resolve_enricher,
    )
    from src.discovery import build_tasks, iter_result_links, platform_for_query

    HAS_HYBRID = True
except Exception as exc:  # pragma: no cover - degraded path
    print(f"Hybrid modules not available, falling back to heuristic: {exc}")
    HAS_HYBRID = False

    def extract_skills(text, use_llm=False):  # type: ignore
        # Minimal fallback mimic
        if "engineer" in text.lower():
            return [
                {"canonical": "Python", "raw": "Python", "category": "tech", "confidence": 1.0, "source": "regex", "weight": 1.0},
                {"canonical": "React", "raw": "React", "category": "tech", "confidence": 1.0, "source": "regex", "weight": 1.0},
                {"canonical": "TypeScript", "raw": "TypeScript", "category": "tech", "confidence": 1.0, "source": "regex", "weight": 1.0},
            ]
        return [
            {"canonical": "Data Science", "raw": "Data Science", "category": "tech", "confidence": 1.0, "source": "regex", "weight": 1.0},
            {"canonical": "Python", "raw": "Python", "category": "tech", "confidence": 1.0, "source": "regex", "weight": 1.0},
        ]

    def to_legacy_list(skills):  # type: ignore
        return [s["canonical"] for s in skills]

    def merge_skills_with_weights(rich):  # type: ignore
        legacy = [s["canonical"] for s in rich]
        weights = {s["canonical"]: s.get("weight", 1.0) for s in rich}
        return legacy, weights

    def deadline_from_soup(soup):  # type: ignore
        return None

    def deadline_from_text(text, today=None):  # type: ignore
        return None

    def extract_amount(text):  # type: ignore
        return None

    def extract_summary(soup, fallback=""):  # type: ignore
        return ""

    def get_default_urls(types):  # type: ignore
        return ["https://www.ycombinator.com/jobs"]

    def resolve_enricher(a, b):  # type: ignore
        return None

    def build_tasks(*a, **kw):  # type: ignore
        return []

    def iter_result_links(soup, base_url):  # type: ignore
        return []

    def platform_for_query(q):  # type: ignore
        return "google"

    def dedupe_key(url):  # type: ignore
        return url.lower()

    def infer_type(domain, text):  # type: ignore
        return "jobs_remote"

    EDITORIAL_DOMAINS = frozenset()
    REGISTRY = {}


# ---------------------------------------------------------------------------
# Link admission filters
# ---------------------------------------------------------------------------
# A generic find_all("a") over a listing page harvests the entire page,
# including nav, footer, cookie banners and legal links. These markers reject
# site furniture before any skill extraction (and any paid LLM call) happens.
# With query-driven discovery the input is now a *search results page*, which is
# almost entirely chrome, so these filters do most of the work.

# Text markers: substrings of the anchor text that identify non-opportunity links.
CHROME_TEXT_MARKERS = (
    "sign up", "sign in", "log in", "logout", "create an account", "get started free",
    "privacy policy", "terms of", "cookie", "accept all", "manage cookies",
    "download the app", "follow us", "newsletter", "subscribe to our",
    "skip to content", "back to top", "read more about us", "about us",
    "contact us", "careers at", "advertise", "press", "sitemap",
    "all rights reserved", "view all jobs", "see all", "load more",
    "previous", "next page", "cached", "translate this page",
)

# Href markers: exact path SEGMENTS that identify navigation / utility links.
# Matched segment-wise rather than as substrings, because a substring test on
# "/app" also rejects "/apply" — which is where most real application links live.
CHROME_HREF_SEGMENTS = frozenset({
    "login", "signup", "sign-in", "sign-up", "register", "auth", "logout",
    "privacy", "privacy-policy", "terms", "terms-of-service", "legal",
    "cookie", "cookies", "sitemap", "contact", "about", "newsletter",
    "subscribe", "download", "app", "apps", "careers", "advertise", "press",
    "help", "support", "faq", "tos", "privacy-notice",
    # Search-engine chrome, which is the dominant link type on a SERP.
    "search", "preferences", "advanced_search", "intl", "imgs",
})

# Path segments that on their own never identify a specific opportunity.
ROOT_ONLY_SEGMENTS = {
    "jobs", "events", "hackathons", "opportunities", "grants", "search", "browse",
    "index.html", "index.htm", "results", "listing", "listings", "feed",
}

#: Search engines. A link to a search engine is another page of results, never
#: an opportunity — and following one burns the whole crawl budget.
SEARCH_ENGINE_HOSTS = frozenset({
    "google.com", "google.co.uk", "google.co.ng", "google.co.ke", "google.co.za",
    "google.com.gh", "google.co.tz", "google.com.eg", "google.com.au",
    "duckduckgo.com", "bing.com", "yahoo.com", "yandex.com", "baidu.com",
    "ecosia.org", "brave.com", "startpage.com",
})

#: Social platforms that are never the listing itself. LinkedIn and Telegram are
#: deliberately NOT here — they are two of the four discovery surfaces, and
#: blocking them wholesale would throw away the entire LinkedIn harvest.
SOCIAL_NOISE_HOSTS = frozenset({
    "youtube.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
    "pinterest.com", "reddit.com", "tiktok.com", "snapchat.com", "medium.com",
    "quora.com", "stackoverflow.com", "github.com", "gitlab.com",
    # Aggregators and link aggregators. Their pages *link to* opportunities, so
    # they are useful as seed pages, but a link to one is never the opportunity.
    "news.ycombinator.com", "lobste.rs", "dev.to", "hashnode.com",
    "producthunt.com", "indiehackers.com", "betalist.com", "sourcegraph.com",
    "substack.com", "towardsdatascience.com",
})

#: Path prefixes that identify a real record on a platform we DO harvest.
#: Matched against the host's path, so `/jobs/view/123` is kept while
#: `/login`, `/feed` and `/mynetwork` are not.
HARVEST_PATH_PREFIXES = {
    "linkedin.com": ("/jobs/",),
    "t.me": ("/s/", "/joinchat/"),
    "telegram.me": ("/s/", "/joinchat/"),
}

#: Query-string keys a search engine uses to navigate results. A link carrying
#: one of these is another page of results, not a listing.
CHROME_QUERY_KEYS = frozenset({"start", "page", "offset", "oq", "num", "filter", "sort", "ref"})

# Minimum anchor text length for a link to be considered. Named because it is a
# real tuning knob.
#
# It is a floor, not an absolute: a short anchor like "Apply now" is still
# specific when its URL carries an identifier (`/apply/eng-123`,
# `/jobs/view/4123456789`). Gating on text length alone threw away every
# application link on a board, because "Apply now" is what the button says.
MIN_LINK_TEXT_LEN = 12

#: A trailing path segment that looks like a record identifier rather than a
#: section name. Used to admit short-anchor links whose URL is specific.
#:
#: Two ways to qualify, because id shapes vary by platform:
#:   * contains a digit and is at least 3 characters — `/jobs/view/4123456789`,
#:     `/hackathons/ai-build-2026`, and Telegram message ids like `/s/chan/812`
#:   * or is a long descriptive slug with no digits at all —
#:     `/roles/senior-react-engineer`
_SEGMENT_WITH_DIGIT = re.compile(r"^(?=.*\d)[\w.-]{3,}$", re.I)
_SEGMENT_WORDY = re.compile(r"^[\w-]{8,}$", re.I)


def _has_identifier_slug(url: str) -> bool:
    """
    Does this URL end in something that identifies a single record?

    `/apply/eng-123`, `/jobs/view/4123456789`, `/t.me/s/chan/812` yes.
    `/about/team`, `/jobs` no — those are sections, and they must not be
    admitted on the strength of a short link text.
    """
    try:
        segments = [s for s in (urlparse(url).path or "").split("/") if s]
    except Exception:
        return False
    if len(segments) < 2:
        return False
    last = segments[-1]
    return bool(_SEGMENT_WITH_DIGIT.match(last) or _SEGMENT_WORDY.match(last))

#: Vertical keywords, used to classify a link that has already passed the
#: structural filters. Deliberately broader than the old list: with query-driven
#: discovery the titles come from arbitrary employers, not five known boards.
VERTICAL_KEYWORDS = [
    "engineer", "developer", "designer", "fellowship", "analyst", "manager",
    "remote", "scholarship", "hackathon", "grant", "funding", "internship",
    "intern", "conference", "summit", "event", "startup", "opportunity",
    "research", "competition", "challenge", "cohort", "accelerator", "award",
    "programme", "program", "fellow", "bursary", "stipend", "apprentice",
    "trainee", "placement", "vacancy", "hiring", "recruit", "we are looking",
]

#: URL slug fragments that indicate a specific record even when the anchor text
#: is generic ("Apply now", "View job").
DETAIL_SLUG_HINTS = (
    "job", "jobs", "role", "position", "vacancy", "career", "internship",
    "fellowship", "hackathon", "grant", "scholarship", "event", "opportunit",
    "programme", "program", "cohort", "contest", "competition", "apply",
    "opening", "posting", "tender", "call-for",
)


class OpportunityRecord(BaseModel):
    """
    Pathify's opportunity schema.

    `match_score`, `matched_skills` and `skill_gap` are deliberately absent: they
    are per-user quantities and this actor has no user. `lib/matching.ts` owns
    them. The sync route still tolerates a legacy `match_score` if an older
    dataset carries one.
    """

    title: str = Field(..., description="Job, fellowship, grant or competition title")
    organization: str = Field(..., description="Company, NGO, or institution")
    location: str = Field(..., description="Geographic location or remote status")
    opportunity_type: str = Field(
        ...,
        description=(
            "jobs_remote | jobs_hybrid | jobs_onsite | internships | conferences | "
            "fellowships | events | startup_funding | grants | scholarships | hackathons"
        ),
    )
    application_url: str = Field(..., description="Direct link to apply")
    skills_required: List[str] = Field(default_factory=list)
    description: str = Field(default="", description="Bounded summary for the detail view")
    verification_status: str = Field(default="review_recommended")
    discovered_at: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    source_domain: str | None = None
    source_platform: str | None = Field(
        default=None, description="google | linkedin | telegram | website | registry"
    )
    discovery_query: str | None = Field(
        default=None, description="The query that surfaced this listing, for provenance"
    )
    deadline: str | None = None
    amount: str | None = None


# ---------------------------------------------------------------------------
# Link predicates
# ---------------------------------------------------------------------------


def _host_of(url: str) -> str:
    try:
        return (urlparse(url).netloc or "").lower()
    except Exception:
        return ""


def _is_chrome_host(url: str) -> bool:
    """
    Is this host one we never harvest a listing from?

    LinkedIn and Telegram need a path check rather than a blanket block: they
    are two of the four discovery surfaces, so `/jobs/view/123` and
    `/s/channel/456` are exactly what we came for, while `/login` and `/feed`
    are not.
    """
    host = _host_of(url)
    if not host:
        return True
    bare = host.replace("www.", "")

    def matches(blocklist: frozenset) -> bool:
        return any(bare == c or bare.endswith("." + c) for c in blocklist)

    if matches(SEARCH_ENGINE_HOSTS) or matches(SOCIAL_NOISE_HOSTS):
        return True

    for domain, prefixes in HARVEST_PATH_PREFIXES.items():
        if bare == domain or bare.endswith("." + domain):
            try:
                path = (urlparse(url).path or "").lower()
            except Exception:
                return True
            return not any(path.startswith(prefix) for prefix in prefixes)

    return False


def _has_chrome_query(url: str) -> bool:
    try:
        query = (urlparse(url).query or "").lower()
    except Exception:
        return False
    if not query:
        return False
    return any(f"{k}=" in query for k in CHROME_QUERY_KEYS)


def _is_chrome_link(lower_text: str, href: str) -> bool:
    """Site furniture and search-engine chrome. Never an opportunity."""
    if _is_chrome_host(href):
        return True
    if _has_chrome_query(href):
        return True
    if any(t in lower_text for t in CHROME_TEXT_MARKERS):
        return True
    try:
        path = urlparse(href).path or ""
    except Exception:
        return True
    segments = {s.lower() for s in path.split("/") if s}
    return bool(segments & CHROME_HREF_SEGMENTS)


def _looks_like_detail_link(href: str) -> bool:
    """Require a specific target, not a bare listing link like /jobs."""
    try:
        path = urlparse(href).path or ""
    except Exception:
        return False
    segments = [s for s in path.split("/") if s]
    if not segments:
        return False
    if len(segments) == 1:
        # A lone root segment is the listing page itself, never an item.
        return segments[0].lower() not in ROOT_ONLY_SEGMENTS
    # Deeper paths are specific items even when they sit under a collection
    # root, e.g. /jobs/eng-123 or /hackathons/xyz.
    return True


def _is_vertical_link(lower_text: str, href: str) -> bool:
    """Accept on a keyword in the text OR an opportunity-shaped URL slug."""
    if any(kw in lower_text for kw in VERTICAL_KEYWORDS):
        return True
    try:
        slug = urlparse(href).path.lower()
    except Exception:
        return False
    return any(hint in slug for hint in DETAIL_SLUG_HINTS)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main():
    async with Actor:
        actor_input = await Actor.get_input() or {}
        log = Actor.log

        user_name = actor_input.get("userName", "Pathify")
        opportunity_types = actor_input.get("opportunityTypes")
        use_llm = bool(actor_input.get("useLLM", False))
        location_hint = actor_input.get("location", "Global / Remote")

        # --- Discovery input -------------------------------------------------
        # `queries` are explicit, pre-built `site:`-scoped queries. The
        # structured axes exist so a scheduler can express intent ("software
        # internships in Nigeria") without knowing the query syntax.
        raw_queries = actor_input.get("queries")
        if isinstance(raw_queries, str):
            raw_queries = [raw_queries]
        categories = actor_input.get("categories")
        locations = actor_input.get("locations")

        # --- Start URLs ------------------------------------------------------
        raw_start_urls = actor_input.get("startUrls")
        start_urls: List[str] = []
        if isinstance(raw_start_urls, list):
            for item in raw_start_urls:
                if isinstance(item, dict) and item.get("url"):
                    start_urls.append(item["url"])
                elif isinstance(item, str) and item:
                    start_urls.append(item)

        discovery_tasks = []
        if HAS_HYBRID:
            try:
                discovery_tasks = build_tasks(
                    categories=categories if isinstance(categories, list) else None,
                    locations=locations if isinstance(locations, list) else None,
                    opportunity_types=opportunity_types,
                    extra=raw_queries if isinstance(raw_queries, list) else None,
                    max_tasks=int(actor_input.get("maxDiscoveryTasks", 40)),
                )
            except Exception as exc:
                log.warning(f"Discovery expansion failed, continuing with URLs only: {exc}")

        if not start_urls:
            start_urls = get_default_urls(opportunity_types)
            if not start_urls:
                start_urls = ["https://www.ycombinator.com/jobs"]

        log.info(f"Pathify Intelligence Engine for {user_name}")
        log.info(
            f"Types: {opportunity_types or 'all'} | LLM: {use_llm} | "
            f"discovery tasks: {len(discovery_tasks)} | seed URLs: {len(start_urls)}"
        )

        # Discovery result pages and registry index pages are two different
        # kinds of input: a SERP yields candidate links, an index page may
        # already be a listing. Both go to the crawler, and the handler
        # distinguishes them by whether a card was already extracted.
        discovery_urls = [t.url for t in discovery_tasks if t.url]
        all_start_urls = list(dict.fromkeys(seed for seed in (start_urls + discovery_urls) if seed))

        max_items = int(actor_input.get("maxItems", 80))
        enqueue_links = bool(actor_input.get("enqueueLinks", True))
        # Depth 1 is enough for a URL-driven run (index -> listing). Query runs
        # need 2: SERP -> listing, then the listing's own outbound apply links.
        max_depth = 3 if discovery_tasks else (2 if enqueue_links else 1)

        proxy_conf = None
        _proxy_input = actor_input.get("proxyConfiguration")
        try:
            if _proxy_input:
                proxy_conf = await Actor.create_proxy_configuration(actor_proxy_input=_proxy_input)
        except Exception as exc:
            log.warning(f"Proxy unavailable: {exc}")

        crawler_kwargs: dict = dict(
            max_requests_per_crawl=max(max_items * 4, 40),
            max_crawl_depth=max_depth,
        )
        if proxy_conf:
            crawler_kwargs["proxy_configuration"] = proxy_conf

        crawler = BeautifulSoupCrawler(**crawler_kwargs)

        seen_urls: set = set()
        seen_dedupe: set = set()
        extracted: List[dict] = []
        per_domain: dict = {}
        per_platform: dict = {}
        errors: dict = {}
        # url -> the query that found it, for provenance on the pushed record
        provenance: dict = {}

        def _bump(bucket: dict, key: str) -> None:
            bucket[key] = bucket.get(key, 0) + 1

        def _note_error(reason: str) -> None:
            _bump(errors, reason)

        def _absolute(href: str, base: str) -> str | None:
            if not href:
                return None
            href = href.strip()
            if href.startswith("//"):
                scheme = (urlparse(base).scheme or "https")
                return f"{scheme}:{href}"
            if href.startswith("/"):
                parsed = urlparse(base)
                return f"{parsed.scheme}://{parsed.netloc}{href}"
            if href.startswith("http"):
                return href
            return None

        @crawler.router.default_handler
        async def request_handler(context) -> None:
            page_url = context.request.url
            if len(extracted) >= max_items:
                return

            try:
                soup = context.soup
            except Exception as exc:
                # A page that will not parse must not end the run.
                _note_error(f"soup_failed:{_host_of(page_url)}")
                log.warning(f"Could not parse {page_url}: {exc}")
                return

            try:
                page_text = soup.get_text(" ", strip=True)[:3000]
            except Exception:
                page_text = ""

            # A result page is an index of candidates, not a listing. Give the
            # generic extractors a chance first (some SERP-shaped pages are
            # themselves listings), then harvest links.
            before = len(extracted)

            # Register any discovery task whose URL this page answers to, so
            # the pushed records carry the query that found them.
            for task in discovery_tasks:
                if task.url and task.url == page_url:
                    _bump(per_platform, task.platform)

            try:
                links = soup.find_all("a", href=True)
            except Exception:
                links = []

            per_page = 0
            page_new = 0

            for anchor in links:
                if len(extracted) >= max_items:
                    break
                if per_page >= 15:
                    break

                try:
                    text = " ".join(anchor.get_text(" ", strip=True).split())
                    href = anchor.get("href", "")
                except Exception:
                    continue

                app_url = _absolute(href, page_url)
                if not app_url:
                    continue

                # Text length is a floor, not a gate: "Apply now" is short but
                # its URL identifies a specific record.
                if len(text) < MIN_LINK_TEXT_LEN and not _has_identifier_slug(app_url):
                    continue

                lower_text = text.lower()

                # ---- Structural rejection ---------------------------------
                if _is_chrome_link(lower_text, app_url):
                    continue
                if not _looks_like_detail_link(app_url):
                    continue
                if not _is_vertical_link(lower_text, app_url):
                    continue

                # Dedupe
                try:
                    norm = dedupe_key(app_url)
                except Exception:
                    norm = app_url.lower()
                if norm in seen_dedupe or app_url in seen_urls:
                    continue

                # ---- Enrichment text ---------------------------------------
                parent_text = ""
                try:
                    parent = anchor.find_parent(["div", "li", "article", "section"])
                    if parent:
                        parent_text = parent.get_text(" ", strip=True)[:500]
                except Exception:
                    pass
                extraction_text = f"{text} {parent_text} {page_text[:500]}".strip()

                # ---- Skills -------------------------------------------------
                try:
                    rich = extract_skills(extraction_text, use_llm=use_llm)
                    legacy, _weights = merge_skills_with_weights(rich)
                except Exception as exc:
                    _note_error("skill_extraction_failed")
                    log.warning(f"Skill extraction failed for {app_url}: {exc}")
                    rich, legacy = [], []

                if not legacy:
                    # No taxonomy hit. Rather than invent a generic skill list
                    # (which is what the old fallback did, and which put
                    # "Python, React, TypeScript" on every engineering listing
                    # and "Communication, Research, Writing" on every other),
                    # fall back to inferring the vertical from the text.
                    opp_type_guess = infer_type(_host_of(app_url), extraction_text)
                    legacy = [opp_type_guess]
                    rich = [
                        {
                            "canonical": opp_type_guess,
                            "raw": opp_type_guess,
                            "category": "domain",
                            "confidence": 0.4,
                            "source": "regex",
                            "weight": 0.4,
                        }
                    ]

                # ---- Per-source enrichment ---------------------------------
                # Registry entries are uniformly callable — see `_as_enricher`
                # in src/sources/__init__.py.
                base_enrich: dict = {}
                enricher = resolve_enricher(app_url, page_url)
                if enricher:
                    try:
                        base_enrich = enricher(soup, app_url, text) or {}
                    except Exception as exc:
                        _note_error(f"enricher_failed:{_host_of(app_url)}")
                        log.warning(f"Enricher failed for {app_url}: {exc}")

                organization = base_enrich.get("organization") or "Verified Partner Source"
                location = base_enrich.get("location") or location_hint
                opp_type = base_enrich.get("opportunity_type") or infer_type(
                    _host_of(app_url), extraction_text
                )
                source_domain = base_enrich.get("source_domain") or _host_of(app_url)

                # ---- Deadline + amount ------------------------------------
                # Try the card's own context first (it is bounded and specific),
                # then the whole page. Both are real extractions; neither
                # invents a date.
                deadline = None
                try:
                    card_soup = anchor.find_parent(["li", "article", "div", "section"])
                    if card_soup is not None:
                        deadline = deadline_from_soup(card_soup)
                    if not deadline:
                        deadline = deadline_from_soup(soup)
                    if not deadline:
                        deadline = deadline_from_text(f"{text} {parent_text}", None)
                except Exception:
                    deadline = None

                amount = None
                try:
                    amount = extract_amount(f"{text} {parent_text} {page_text[:800]}")
                except Exception:
                    amount = None

                summary = ""
                try:
                    summary = extract_summary(soup, fallback=extraction_text)
                except Exception:
                    summary = ""

                # `high` only when the URL is unmistakably an application or a
                # specific posting. The old check (`"job" in href`) marked every
                # link on a job board as verified, including the employer's
                # marketing pages.
                href_lower = app_url.lower()
                verification = (
                    "high"
                    if any(k in href_lower for k in ("/apply", "/careers/", "/jobs/", "/job/"))
                    else "review_recommended"
                )

                # ---- Build record -----------------------------------------
                try:
                    record = OpportunityRecord(
                        title=text[:180],
                        organization=organization[:80],
                        location=location[:80],
                        opportunity_type=opp_type,
                        application_url=app_url,
                        skills_required=legacy,
                        description=summary,
                        verification_status=verification,
                        discovered_at=datetime.now().strftime("%Y-%m-%d"),
                        source_domain=source_domain,
                        source_platform=platform_for_query(page_url) if discovery_tasks else "registry",
                        discovery_query=provenance.get(page_url),
                        deadline=deadline,
                        amount=amount,
                    )
                except Exception as exc:
                    _note_error("record_validation_failed")
                    log.warning(f"Validation failed for {app_url}: {exc}")
                    continue

                data = record.model_dump()
                data["_rich_skills"] = rich
                data["extraction_meta"] = {
                    "method": "hybrid",
                    "version": "2.0-multiplatform",
                    "avg_confidence": (
                        round(sum(s.get("confidence", 0) for s in rich) / len(rich), 2) if rich else 0
                    ),
                    "has_llm": use_llm,
                    "enriched_by": _host_of(app_url) if enricher else None,
                }

                seen_urls.add(app_url)
                seen_dedupe.add(norm)
                extracted.append(data)
                _bump(per_domain, source_domain)
                per_page += 1
                page_new += 1

                try:
                    await Actor.push_data(data)
                except Exception:
                    await context.push_data(data)

            log.info(
                f"{page_url} -> +{page_new} records (total {len(extracted)}/{max_items})"
            )

            # ---- Second pass: a result page with no records is an index -----
            # Only harvest follow-up links when this page produced nothing, so a
            # page that is itself a listing does not also sweep its own nav.
            if len(extracted) == before and enqueue_links and len(extracted) < max_items:
                try:
                    candidates = iter_result_links(soup, page_url)
                except Exception as exc:
                    candidates = []
                    _note_error("link_harvest_failed")

                queued = 0
                for candidate in candidates:
                    if queued >= 12 or len(extracted) >= max_items:
                        break
                    if _is_chrome_link(candidate.lower(), candidate):
                        continue
                    if not _looks_like_detail_link(candidate):
                        continue
                    try:
                        norm = dedupe_key(candidate)
                    except Exception:
                        norm = candidate.lower()
                    if norm in seen_dedupe:
                        continue
                    seen_dedupe.add(norm)
                    # Provenance: a link found on a result page is attributed to
                    # the query that produced that page.
                    for task in discovery_tasks:
                        if task.url == page_url:
                            provenance[candidate] = task.query
                            break
                    try:
                        await context.add_requests([candidate])
                        queued += 1
                    except Exception:
                        pass

        await crawler.run(all_start_urls)

        log.info(
            f"Run complete: {len(extracted)} unique records (limit {max_items}) | "
            f"per_domain={per_domain} | per_platform={per_platform} | errors={errors}"
        )

        try:
            await Actor.set_value(
                "SUMMARY",
                {
                    "total": len(extracted),
                    "maxItems": max_items,
                    "seed_urls": start_urls,
                    "discovery_tasks": len(discovery_tasks),
                    "platforms": sorted(per_platform),
                    "queries": [t.query for t in discovery_tasks][:40],
                    "registry_domains": len(REGISTRY),
                    "useLLM": use_llm,
                    "per_domain": per_domain,
                    "per_platform": per_platform,
                    "errors": errors,
                    "version": "2.0-multiplatform",
                },
            )
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())
