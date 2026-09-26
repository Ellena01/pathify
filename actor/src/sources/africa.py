"""
African and pan-African opportunity sources.

WHY THIS FILE EXISTS
--------------------
Pathify positions itself as African-first, but until now not one crawled source
was African: the registry was YC, Work at a Startup, Devpost, OpportunityDesk
and Eventbrite — all US/EU/global. The regional positioning was copy, not data.

These modules are deliberately thin. A per-source module earns its place only if
it knows something the generic extractor cannot infer — a default vertical, an
index URL, a location convention. Everything else is handled by `base.py` and
the query-driven discovery engine in `src/discovery.py`, which is what actually
reaches these boards: most of them have no public API, and the ones that do rate
limit aggressively.

Grouped by vertical so the registry reads as a statement of what Pathify covers.
"""

from .base import infer_type, parse_organization, parse_location


# ---------------------------------------------------------------------------
# Pan-African / regional job boards
# ---------------------------------------------------------------------------


def _regional_job_board(domain: str, fallback_org: str, default_location: str):
    """
    Build an enricher for a national/regional job board.

    These boards need no special parsing beyond a sane default, so a factory
    keeps the registry declarative and stops this file becoming 200 near-identical
    modules.
    """

    def enrich(soup, source_url: str, title_text: str) -> dict:
        return {
            "opportunity_type": infer_type(domain, title_text),
            "organization": parse_organization(soup, source_url, fallback=fallback_org),
            "location": parse_location(soup, source_url, default=default_location),
            "source_domain": domain,
        }

    return enrich


africa_careers = _regional_job_board("africa.careers", "Africa.Careers", "Africa / Remote")
jobberman = _regional_job_board("jobberman.com", "Jobberman", "Nigeria")
myjobmag = _regional_job_board("myjobmag.com", "MyJobMag", "Nigeria")
brightercountry = _regional_job_board(
    "brightercountry.com", "Brighter Country", "Africa / Remote"
)
jobcity = _regional_job_board("jobcity.co.za", "JobCity", "South Africa")
careers24 = _regional_job_board("careers24.com", "Careers24", "South Africa")
pnet = _regional_job_board("pnet.co.za", "PNet", "South Africa")
jumia_jobs = _regional_job_board("jumia.com", "Jumia", "Africa / Remote")
turing = _regional_job_board("turing.com", "Turing", "Global / Remote")
welcometothejungle = _regional_job_board(
    "welcometothejungle.com", "Welcome to the Jungle", "Global / Remote"
)

# Regional defaults per board, so a record from Jobberman says "Nigeria" rather
# than the generic "Global / Remote".
DOMAIN_DEFAULTS = {
    "jobberman.com": ["https://jobberman.com/jobs"],
    "myjobmag.com": ["https://www.myjobmag.com/jobs/"],
    "africa.careers": ["https://africa.careers/", "https://africa.careers/jobs"],
    "brightercountry.com": ["https://www.brightercountry.com/jobs/"],
    "jobcity.co.za": ["https://www.jobcity.co.za/jobs/"],
    "careers24.com": ["https://www.careers24.com/jobs/"],
    "pnet.co.za": ["https://www.pnet.co.za/jobs"],
    "jumia.com": ["https://www.jumia.com/careers/"],
    "turing.com": ["https://www.turing.com/jobs"],
    "welcometothejungle.com": ["https://www.welcometothejungle.com/en/jobs/"],
}


# ---------------------------------------------------------------------------
# Pan-African fellowships, grants and accelerators
# ---------------------------------------------------------------------------


def _fellowship_or_fund(domain: str, fallback_org: str, default_vertical: str, default_location: str):
    """
    Build an enricher for a fellowship / grant / accelerator aggregator.

    These sites mix verticals on one index page, so the domain default is a
    *fallback only*: a page whose text says "grant" is labelled a grant.
    """

    def enrich(soup, source_url: str, title_text: str) -> dict:
        opp_type = infer_type(domain, title_text)
        if opp_type == "jobs_remote" or opp_type == "events":
            opp_type = default_vertical
        return {
            "opportunity_type": opp_type,
            "organization": parse_organization(soup, source_url, fallback=fallback_org),
            "location": parse_location(soup, source_url, default=default_location),
            "source_domain": domain,
        }

    return enrich


techcabal = _fellowship_or_fund(
    "techcabal.com", "TechCabal", "fellowships", "Africa"
)
afrilabs = _fellowship_or_fund("afrilabs.com", "AfricaLabs", "fellowships", "Africa")
orenda = _fellowship_or_fund("orenda.co.uk", "Orenda", "fellowships", "Africa")
african_leadership = _fellowship_or_fund(
    "africanleadership.net", "African Leadership Network", "fellowships", "Africa"
)
mastercard_foundation = _fellowship_or_fund(
    "mastercardfdn.org", "Mastercard Foundation", "scholarships", "Africa"
)
mtn_moove = _fellowship_or_fund("moove.africa", "MTN Moove", "hackathons", "Africa")
flare = _fellowship_or_fund("flare.co.za", "Flare", "grants", "South Africa")
black_enterprise = _fellowship_or_fund(
    "blackenterprise.com", "Black Enterprise", "grants", "USA / Africa"
)

FELLOWSHIP_DEFAULTS = {
    "techcabal.com": ["https://techcabal.com/"],
    "afrilabs.com": ["https://afrilabs.com/"],
    "orenda.co.uk": ["https://www.orenda.co.uk/"],
    "africanleadership.net": ["https://www.africanleadership.net/"],
    "mastercardfdn.org": ["https://mastercardfdn.org/en/"],
    "moove.africa": ["https://moove.africa/"],
    "flare.co.za": ["https://flare.co.za/"],
    "blackenterprise.com": ["https://www.blackenterprise.com/"],
}


# ---------------------------------------------------------------------------
# African tech hubs, developer communities and social surfaces
# ---------------------------------------------------------------------------


def _community(domain: str, fallback_org: str, default_location: str = "Africa / Remote"):
    """
    Build an enricher for a community/news site.

    A hub's front page is mostly editorial, so the vertical defaults to a job
    only when the individual page says so. `main.py`'s link filters do the real
    admission work.
    """

    def enrich(soup, source_url: str, title_text: str) -> dict:
        return {
            "opportunity_type": infer_type(domain, title_text),
            "organization": parse_organization(soup, source_url, fallback=fallback_org),
            "location": parse_location(soup, source_url, default=default_location),
            "source_domain": domain,
        }

    return enrich


techcrunch_africa = _community("techcrunch.com", "TechCrunch", "Global")
disrupt_africa = _community("disrupt-africa.com", "Disrupt Africa", "Africa")
africa_tech = _community("africa.tech", "Africa.Tech", "Africa")
nairabotics = _community("nairabotics.com", "Nairabotics", "Nigeria")
inecoonline = _community("inecoonline.com", "iNecoOnline", "Nigeria")
codebar = _community("codebar.io", "Code Bar", "Nigeria")
droneacademy = _community("droneacademy.com", "Drone Academy", "Nigeria")
tolu = _community("tolu.co", "Tolu", "Africa")

COMMUNITY_DEFAULTS = {
    "techcrunch.com": ["https://techcrunch.com/africa/"],
    "disrupt-africa.com": ["https://disrupt-africa.com/"],
    "africa.tech": ["https://africa.tech/"],
    "nairabotics.com": ["https://nairabotics.com/"],
    "inecoonline.com": ["https://inecoonline.com/"],
    "codebar.io": ["https://codebar.io/"],
    "droneacademy.com": ["https://droneacademy.com/"],
    "tolu.co": ["https://tolu.co/"],
}


# ---------------------------------------------------------------------------
# Global remote aggregators
# ---------------------------------------------------------------------------

weworkremotely = _regional_job_board(
    "weworkremotely.com", "We Work Remotely", "Global / Remote"
)
remoteok = _regional_job_board("remoteok.com", "Remote OK", "Global / Remote")
remotive = _regional_job_board("remotive.com", "Remotive", "Global / Remote")
remote_r = _regional_job_board("remote-r.com", "Remote-R", "Global / Remote")
himalayas = _regional_job_board("himalayas.app", "Himalayas", "Global / Remote")
workingnomads = _regional_job_board("workingnomads.com", "Working Nomads", "Global / Remote")
nodeskout = _regional_job_board("nodeskout.com", "NodeSkout", "Global / Remote")
jobicy = _regional_job_board("jobicy.com", "Jobicy", "Global / Remote")
remoteresources = _regional_job_board(
    "remoteresources.com", "Remote Resources", "Global / Remote"
)
justremote = _regional_job_board("justremote.com", "JustRemote", "Global / Remote")
otta = _regional_job_board("otta.com", "Otta", "Global / Remote")
wellfound = _regional_job_board("wellfound.com", "Wellfound", "Global / Remote")
hackathons_com = _regional_job_board("hackathons.com", "Hackathons", "Global / Online")
mlh = _regional_job_board("mlh.io", "MLH", "Global / Online")
unstop = _regional_job_board("unstop.com", "Unstop", "Global / Online")
devpost_com_events = _regional_job_board("devpost.com", "Devpost", "Global / Online")
datahub = _regional_job_board("datahub.io", "DataHub", "Global / Remote")
undocumented = _regional_job_board("undocumented.dev", "Undocumented", "Global / Remote")

GLOBAL_REMOTE_DEFAULTS = {
    "weworkremotely.com": ["https://weworkremotely.com/remote-jobs"],
    "remoteok.com": ["https://remoteok.com/remote-jobs"],
    "remotive.com": ["https://remotive.com/remote-jobs"],
    "remote-r.com": ["https://remote-r.com/"],
    "himalayas.app": ["https://himalayas.app/jobs"],
    "workingnomads.com": ["https://www.workingnomads.com/jobs"],
    "nodeskout.com": ["https://nodeskout.com/jobs/"],
    "jobicy.com": ["https://jobicy.com/jobs"],
    "remoteresources.com": ["https://remoteresources.com/"],
    "justremote.com": ["https://justremote.com/remote-jobs"],
    "otta.com": ["https://jobs.otta.com/"],
    "wellfound.com": ["https://wellfound.com/remote-jobs"],
    "hackathons.com": ["https://hackathons.com/hackathons/"],
    "mlh.io": ["https://mlh.io/seasons/"],
    "unstop.com": ["https://unstop.com/opportunities"],
    "datahub.io": ["https://datahub.io/jobs"],
    "undocumented.dev": ["https://undocumented.dev/"],
}
