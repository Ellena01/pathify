"""
The source registry.

Three responsibilities:

  REGISTRY                host -> module, for per-source enrichment
  DEFAULT_URLS_BY_DOMAIN  host -> index pages, for URL-driven runs
  TYPE_TO_DOMAINS         opportunity type -> the boards that carry it

and two resolvers, `get_default_urls` and `resolve_enricher`.

WHY THE REGISTRY GREW
---------------------
It was five domains, none of them African: YC, Work at a Startup, Devpost,
OpportunityDesk, Eventbrite. Pathify's positioning is African-first, and a
crawler with no African sources cannot back that up. It is now 40+ hosts across
three groups:

  * the original five (kept: they are real, high-signal and global)
  * African and pan-African job boards, fellowship and grant aggregators, and
    developer communities — the regional core
  * global remote aggregators — the remote-first long tail

A note on how these are actually reached: this registry supplies *index URLs* for
a URL-driven run. Query-driven runs do not go through it at all — they go
through `src/discovery.py`, which is what finds the long tail (company career
pages, national boards, Telegram channels) that no fixed URL list can contain.
The registry and discovery are complementary, not alternatives: discovery widens
coverage, the registry supplies the reliable structural defaults.
"""

from . import (
    africa,
    devpost,
    eventbrite,
    opportunitydesk,
    workatastartup,
    ycombinator,
)
from .base import clean_title, dedupe_key, infer_type


def _as_enricher(source):
    """
    Normalise a registry entry to a callable ``enrich(soup, url, title) -> dict``.

    The original five are modules exposing `enrich`; the African and global
    sources are closures built by the factories in `africa.py`. Storing a raw
    module in REGISTRY meant `main.py` had to branch on the entry's type, and
    it did not — so calling a module entry raised `TypeError: 'module' object is
    not callable` and every record from the original five sources would have been
    dropped with a warning.

    Normalising here means callers just call the result.
    """
    enrich = getattr(source, "enrich", None)
    return enrich if callable(enrich) else source


# ---------------------------------------------------------------------------
# REGISTRY
# ---------------------------------------------------------------------------

#: host -> a callable `enrich(soup, source_url, title_text) -> dict`.
#: More specific hosts are listed before broader ones so "remoteok.com" wins
#: over a hypothetical parent-domain entry.
REGISTRY = {
    # --- Original five -----------------------------------------------------
    "ycombinator.com": _as_enricher(ycombinator),
    "workatastartup.com": _as_enricher(workatastartup),
    "devpost.com": _as_enricher(devpost),
    "opportunitydesk.org": _as_enricher(opportunitydesk),
    "eventbrite.com": _as_enricher(eventbrite),

    # --- African / pan-African job boards ----------------------------------
    "africa.careers": africa.africa_careers,
    "jobberman.com": africa.jobberman,
    "myjobmag.com": africa.myjobmag,
    "brightercountry.com": africa.brightercountry,
    "jobcity.co.za": africa.jobcity,
    "careers24.com": africa.careers24,
    "pnet.co.za": africa.pnet,
    "jumia.com": africa.jumia_jobs,
    "turing.com": africa.turing,
    "welcometothejungle.com": africa.welcometothejungle,

    # --- African fellowships, grants, accelerators -------------------------
    "techcabal.com": africa.techcabal,
    "afrilabs.com": africa.afrilabs,
    "orenda.co.uk": africa.orenda,
    "africanleadership.net": africa.african_leadership,
    "mastercardfdn.org": africa.mastercard_foundation,
    "moove.africa": africa.mtn_moove,
    "flare.co.za": africa.flare,
    "blackenterprise.com": africa.black_enterprise,

    # --- African tech communities -----------------------------------------
    "techcrunch.com": africa.techcrunch_africa,
    "disrupt-africa.com": africa.disrupt_africa,
    "africa.tech": africa.africa_tech,
    "nairabotics.com": africa.nairabotics,
    "inecoonline.com": africa.inecoonline,
    "codebar.io": africa.codebar,
    "droneacademy.com": africa.droneacademy,
    "tolu.co": africa.tolu,

    # --- Global remote aggregators ----------------------------------------
    "weworkremotely.com": africa.weworkremotely,
    "remoteok.com": africa.remoteok,
    "remotive.com": africa.remotive,
    "remote-r.com": africa.remote_r,
    "himalayas.app": africa.himalayas,
    "workingnomads.com": africa.workingnomads,
    "nodeskout.com": africa.nodeskout,
    "jobicy.com": africa.jobicy,
    "remoteresources.com": africa.remoteresources,
    "justremote.com": africa.justremote,
    "otta.com": africa.otta,
    "wellfound.com": africa.wellfound,
    "hackathons.com": africa.hackathons_com,
    "mlh.io": africa.mlh,
    "unstop.com": africa.unstop,
    "datahub.io": africa.datahub,
    "undocumented.dev": africa.undocumented,
}

DEFAULT_URLS_BY_DOMAIN = {
    "ycombinator.com": ycombinator.DEFAULT_URLS,
    "workatastartup.com": workatastartup.DEFAULT_URLS,
    "devpost.com": devpost.DEFAULT_URLS,
    "opportunitydesk.org": opportunitydesk.DEFAULT_URLS,
    "eventbrite.com": eventbrite.DEFAULT_URLS,
    **africa.DOMAIN_DEFAULTS,
    **africa.FELLOWSHIP_DEFAULTS,
    **africa.COMMUNITY_DEFAULTS,
    **africa.GLOBAL_REMOTE_DEFAULTS,
}

# ---------------------------------------------------------------------------
# Type -> domains
# ---------------------------------------------------------------------------

#: Boards that carry each vertical, most productive first. Used to build a
#: URL-driven seed list when the caller requests specific types, so a run asking
#: only for grants does not crawl Devpost.
TYPE_TO_DOMAINS = {
    "jobs_remote": [
        "weworkremotely.com", "remoteok.com", "remotive.com", "himalayas.app",
        "workingnomads.com", "remote-r.com", "nodeskout.com", "jobicy.com",
        "remoteresources.com", "justremote.com", "africa.careers",
        "brightercountry.com", "turing.com", "welcometothejungle.com",
        "ycombinator.com", "workatastartup.com",
    ],
    "jobs_hybrid": [
        "africa.careers", "brightercountry.com", "welcometothejungle.com",
        "ycombinator.com", "workatastartup.com",
    ],
    "jobs_onsite": [
        "jobberman.com", "myjobmag.com", "jobcity.co.za", "careers24.com",
        "pnet.co.za", "jumia.com", "africa.careers",
    ],
    "internships": [
        "nairabotics.com", "inecoonline.com", "codebar.io", "droneacademy.com",
        "ycombinator.com", "workatastartup.com", "africa.careers",
        "unstop.com",
    ],
    "hackathons": [
        "devpost.com", "hackathons.com", "mlh.io", "moove.africa", "unstop.com",
    ],
    "fellowships": [
        "opportunitydesk.org", "techcabal.com", "afrilabs.com", "orenda.co.uk",
        "africanleadership.net",
    ],
    "events": ["eventbrite.com", "disrupt-africa.com", "africa.tech"],
    "conferences": ["eventbrite.com", "disrupt-africa.com", "techcrunch.com"],
    "startup_funding": [
        "opportunitydesk.org", "blackenterprise.com", "flare.co.za", "tolu.co",
    ],
    "grants": [
        "opportunitydesk.org", "flare.co.za", "blackenterprise.com", "tolu.co",
    ],
    "scholarships": [
        "opportunitydesk.org", "mastercardfdn.org", "afrilabs.com",
    ],
}

#: Hosts that are editorial rather than a listings board. `main.py` still crawls
#: them, but they are only worth including when a query asked for that region —
#: a bare URL-driven run of the whole registry would spend most of its budget on
#: news pages.
EDITORIAL_DOMAINS = frozenset({
    "techcrunch.com", "disrupt-africa.com", "africa.tech", "nairabotics.com",
    "inecoonline.com", "codebar.io", "droneacademy.com", "tolu.co",
})


# ---------------------------------------------------------------------------
# Resolvers
# ---------------------------------------------------------------------------


def get_default_urls(opportunity_types: list | None = None) -> list[str]:
    """
    Seed index URLs for a URL-driven run.

    With no types: the global remote boards plus the African core. The
    editorial hosts are excluded — a run with no query has no reason to parse
    news pages, and including them was how the old five-source default spent its
    budget.

    With types: the boards that actually carry those verticals, falling back to
    the default set so a request for an unknown type still crawls something.
    """
    if not opportunity_types:
        urls: list[str] = []
        for domain, module_urls in DEFAULT_URLS_BY_DOMAIN.items():
            if domain in EDITORIAL_DOMAINS:
                continue
            urls.extend(module_urls)
        return urls

    seen = set()
    urls = []
    for opp_type in opportunity_types:
        for domain in TYPE_TO_DOMAINS.get(opp_type, []):
            for url in DEFAULT_URLS_BY_DOMAIN.get(domain, []):
                if url not in seen:
                    urls.append(url)
                    seen.add(url)
    return urls or get_default_urls(None)


def resolve_enricher(source_url: str, request_url: str):
    """
    The module that knows how to read a listing from this host.

    Both hosts are tried, the listing's own first. The second attempt is what
    makes syndicated listings work: a company careers page is not in the
    registry, but the aggregator that linked it may be, and the aggregator's
    vertical default beats the "remote job" fallback.
    """
    for candidate in (source_url, request_url):
        host = _host_of(candidate)
        if not host:
            continue
        for domain, module in REGISTRY.items():
            if host == domain or host.endswith("." + domain):
                return module
    return None


def _host_of(url: str) -> str:
    if not url:
        return ""
    from urllib.parse import urlparse

    try:
        return (urlparse(url).netloc or "").lower().replace("www.", "")
    except Exception:
        return ""


__all__ = [
    "REGISTRY",
    "DEFAULT_URLS_BY_DOMAIN",
    "TYPE_TO_DOMAINS",
    "EDITORIAL_DOMAINS",
    "get_default_urls",
    "resolve_enricher",
    "clean_title",
    "dedupe_key",
    "infer_type",
]
