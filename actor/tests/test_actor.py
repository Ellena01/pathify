"""
Unit tests for the actor's pure logic.

Run with:  python -m tests.test_actor

No Apify, no network, no crawlee — these cover the parts that decide whether a
record is correct: deadline parsing, amount extraction, type inference, query
expansion and cross-source dedupe. The crawl orchestration is exercised by
`apify run` against a staging dataset, not here.
"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.discovery import (  # noqa: E402
    PLATFORM_GOOGLE,
    PLATFORM_LINKEDIN,
    PLATFORM_TELEGRAM,
    PLATFORM_WEBSITE,
    build_task,
    build_tasks,
    expand_queries,
    platform_for_query,
    sanitize_query_term,
)
from src.enrichment import (  # noqa: E402
    deadline_from_iso_string,
    deadline_from_text,
    extract_amount,
    strip_html,
)
from src.sources import (  # noqa: E402
    DEFAULT_URLS_BY_DOMAIN,
    REGISTRY,
    get_default_urls,
    resolve_enricher,
)
from src.sources.base import DOMAIN_TO_TYPE, clean_title, dedupe_key, infer_type  # noqa: E402

TODAY = date(2026, 9, 26)


class TestDeadlineExtraction(unittest.TestCase):
    """`deadline` was empty for the whole catalog; these are the spellings."""

    def test_iso_date(self):
        self.assertEqual(deadline_from_text("Apply by 2026-11-30", TODAY), "2026-11-30")

    def test_iso_datetime_is_truncated_to_a_date(self):
        self.assertEqual(deadline_from_text("Deadline: 2026-11-30T23:59:59Z", TODAY), "2026-11-30")

    def test_day_month_year_words(self):
        self.assertEqual(deadline_from_text("Applications close on 15 March 2026", TODAY), "2026-03-15")
        self.assertEqual(deadline_from_text("Apply by 3rd December 2026", TODAY), "2026-12-03")

    def test_month_day_year_words(self):
        self.assertEqual(deadline_from_text("Deadline: March 15, 2026", TODAY), "2026-03-15")

    def test_missing_year_rolls_forward_rather_than_discarding(self):
        # In September, a deadline written as "15 March" is next year's cohort.
        self.assertEqual(deadline_from_text("Applications close 15 March", TODAY), "2027-03-15")
        # A date still ahead this year stays this year.
        self.assertEqual(deadline_from_text("Applications close 15 November", TODAY), "2026-11-15")

    def test_slash_dates_default_to_day_first(self):
        # 03/04/2026 is ambiguous; day-first is the global default.
        self.assertEqual(deadline_from_text("Deadline 03/04/2026", TODAY), "2026-04-03")
        # 25/04/2026 can only be day-first.
        self.assertEqual(deadline_from_text("Deadline 25/04/2026", TODAY), "2026-04-25")
        # 04/25/2026 can only be month-first.
        self.assertEqual(deadline_from_text("Deadline 04/25/2026", TODAY), "2026-04-25")

    def test_two_digit_years(self):
        self.assertEqual(deadline_from_text("Deadline 15/03/27", TODAY), "2027-03-15")

    def test_relative_windows(self):
        self.assertEqual(deadline_from_text("Applications close in 2 weeks", TODAY), "2026-10-10")
        self.assertEqual(deadline_from_text("Apply within 30 days", TODAY), "2026-10-26")
        # A month is 30 days. Approximate on purpose: "3 months" is never exact
        # and a calendar-month calculation would need a reference date that
        # changes the answer depending on when the crawl ran.
        self.assertEqual(deadline_from_text("Register in 3 months", TODAY), "2026-12-25")

    def test_until_phrase(self):
        self.assertEqual(deadline_from_text("Open until 30 June 2026", TODAY), "2026-06-30")

    def test_rolling_announcements_return_none(self):
        # A rolling page is full of dates that are not the deadline. Returning
        # a confident wrong date is worse than returning nothing.
        self.assertIsNone(deadline_from_text("Rolling applications, apply any time", TODAY))
        self.assertIsNone(deadline_from_text("Open until filled. Starts 2026-01-10", TODAY))
        self.assertIsNone(deadline_from_text("No deadline — ongoing", TODAY))

    def test_no_deadline_returns_none(self):
        self.assertIsNone(deadline_from_text("We are looking for a React engineer", TODAY))
        self.assertIsNone(deadline_from_text("", TODAY))
        self.assertIsNone(deadline_from_text(None, TODAY))

    def test_iso_string_parser(self):
        self.assertEqual(deadline_from_iso_string("2026-03-15"), "2026-03-15")
        self.assertEqual(deadline_from_iso_string("2026-03-15T10:00:00+01:00"), "2026-03-15")
        self.assertIsNone(deadline_from_iso_string(None))
        self.assertIsNone(deadline_from_iso_string(""))
        self.assertIsNone(deadline_from_iso_string("not a date"))

    def test_impossible_dates_are_rejected(self):
        self.assertIsNone(deadline_from_text("Deadline 2026-02-31", TODAY))
        self.assertIsNone(deadline_from_text("Deadline 32 January 2026", TODAY))

    def test_strip_html_removes_script_bodies(self):
        html = "<div>Hello<script>var a = 'apply by 2026-01-01';</script>World</div>"
        self.assertNotIn("apply by", strip_html(html))
        self.assertIn("Hello", strip_html(html))


class TestAmountExtraction(unittest.TestCase):
    def test_grant_figures_with_context(self):
        self.assertEqual(extract_amount("Up to $25,000 in grant funding"), "$25,000")
        self.assertEqual(extract_amount("Total funding of R2.5 million"), "R2.5 million")

    def test_bare_numbers_are_not_money(self):
        # A year or a round count must not acquire a currency.
        self.assertIsNone(extract_amount("Applications open in 2026 for 3 rounds"))
        self.assertIsNone(extract_amount("About the programme"))
        self.assertIsNone(extract_amount(""))

    def test_without_monetary_context_nothing_is_returned(self):
        self.assertIsNone(extract_amount("The role has 5000 applicants"))


class TestTypeInference(unittest.TestCase):
    def test_content_beats_domain(self):
        self.assertEqual(infer_type("devpost.com", "AI Innovation Hackathon 2026"), "hackathons")
        self.assertEqual(infer_type("opportunitydesk.org", "Cheap Software Grants 2026"), "grants")

    def test_domain_is_the_fallback(self):
        self.assertEqual(infer_type("weworkremotely.com", "Some Opportunity"), "jobs_remote")
        self.assertEqual(infer_type("hackathons.com", "Some Opportunity"), "hackathons")

    def test_specific_markers_beat_broad_ones(self):
        self.assertEqual(infer_type("", "Tech Internship Programme"), "internships")
        self.assertEqual(infer_type("", "Scholarship for African developers"), "scholarships")
        self.assertEqual(infer_type("", "Pre-seed round open"), "startup_funding")

    def test_defaults_to_remote_job(self):
        self.assertEqual(infer_type("", "We are hiring"), "jobs_remote")
        self.assertEqual(infer_type("", ""), "jobs_remote")


class TestLinkHygiene(unittest.TestCase):
    def test_chrome_titles_are_rejected(self):
        # Returning '' makes main.py skip the record entirely.
        for text in ("Read more", "Privacy Policy", "See all", "Sign up"):
            self.assertEqual(clean_title(text), "", f"{text!r} should be rejected")
        self.assertEqual(clean_title("Senior React Engineer"), "Senior React Engineer")

    def test_html_is_stripped_from_titles(self):
        self.assertEqual(clean_title("<b>Staff</b>  Engineer"), "Staff Engineer")


class TestDedupeKey(unittest.TestCase):
    def test_tracking_params_are_stripped_identity_params_are_kept(self):
        self.assertEqual(
            dedupe_key("https://boards.example.com/jobs/42?utm_source=x&fbclid=y"),
            "https://boards.example.com/jobs/42",
        )
        # gh_jid IS the job identity on YC's board; stripping it would collapse
        # every YC job into one row.
        self.assertEqual(
            dedupe_key("https://www.ycombinator.com/jobs/42?gh_jid=abc"),
            "https://www.ycombinator.com/jobs/42?gh_jid=abc",
        )

    def test_trailing_slash_and_host_case_are_normalised(self):
        self.assertEqual(
            dedupe_key("https://Example.com/Jobs/42/"),
            dedupe_key("https://example.com/Jobs/42"),
        )

    def test_different_jobs_stay_distinct(self):
        self.assertNotEqual(dedupe_key("https://a.test/jobs/1"), dedupe_key("https://a.test/jobs/2"))


class TestQueryDiscovery(unittest.TestCase):
    def test_query_terms_are_sanitised(self):
        self.assertEqual(sanitize_query_term('react"; DROP TABLE'), "react DROP TABLE")
        self.assertEqual(sanitize_query_term(None), "")
        self.assertEqual(sanitize_query_term("x" * 200), "x" * 80)

    def test_platform_routing(self):
        self.assertEqual(platform_for_query("site:linkedin.com/jobs react"), PLATFORM_LINKEDIN)
        self.assertEqual(platform_for_query("site:t.me jobs africa"), PLATFORM_TELEGRAM)
        self.assertEqual(platform_for_query('site:google.com/search "tech grant"'), PLATFORM_GOOGLE)
        self.assertEqual(platform_for_query("site:africa.careers/jobs react"), PLATFORM_WEBSITE)
        # No scope at all is treated as an open-web search.
        self.assertEqual(platform_for_query("react jobs nigeria"), PLATFORM_GOOGLE)

    def test_linkedin_task_prefers_the_direct_guest_search_url(self):
        task = build_task("site:linkedin.com/jobs react developer nigeria")
        self.assertIsNotNone(task)
        self.assertEqual(task.platform, PLATFORM_LINKEDIN)
        self.assertIn("linkedin.com/jobs/search", task.url)
        self.assertIn("react%20developer%20nigeria", task.url.replace("+", "%20"))

    def test_expansion_is_multi_platform_and_deduplicated(self):
        queries = expand_queries(
            categories=["software internship"],
            locations=["Nigeria", "Kenya"],
            opportunity_types=["jobs_remote"],
        )
        self.assertGreater(len(queries), 4)
        self.assertEqual(len(queries), len(set(queries)))
        platforms = {platform_for_query(q) for q in queries}
        self.assertIn(PLATFORM_LINKEDIN, platforms)
        self.assertIn(PLATFORM_GOOGLE, platforms)

    def test_grant_queries_carry_the_current_year(self):
        # Cohort-based verticals return last cycle's page for a bare query.
        queries = expand_queries(categories=["tech grant"], locations=["Africa"])
        self.assertTrue(any("2026" in q for q in queries), queries)

    def test_empty_input_still_produces_a_regional_sweep(self):
        queries = expand_queries()
        self.assertGreater(len(queries), 0)
        self.assertTrue(any("Africa" in q for q in queries))

    def test_max_tasks_is_respected(self):
        queries = expand_queries(
            categories=["a", "b", "c", "d", "e", "f", "g", "h"],
            locations=["Nigeria", "Kenya", "Ghana", "Rwanda", "Egypt"],
            opportunity_types=["jobs_remote", "internships", "grants", "hackathons"],
            max_tasks=10,
        )
        self.assertLessEqual(len(queries), 10)

    def test_build_tasks_drops_unusable_queries(self):
        tasks = build_tasks(extra=["", "   ", "site:linkedin.com/jobs react"])
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0].platform, PLATFORM_LINKEDIN)


class TestRegistry(unittest.TestCase):
    def test_registry_includes_african_and_global_remote_sources(self):
        for domain in (
            "africa.careers", "jobberman.com", "myjobmag.com", "techcabal.com",
            "afrilabs.com", "orenda.co.uk", "nairabotics.com",
            "weworkremotely.com", "remotive.com", "remoteok.com", "himalayas.app",
        ):
            self.assertIn(domain, REGISTRY, f"{domain} missing from REGISTRY")

    def test_original_five_are_retained(self):
        for domain in (
            "ycombinator.com", "workatastartup.com", "devpost.com",
            "opportunitydesk.org", "eventbrite.com",
        ):
            self.assertIn(domain, REGISTRY)

    def test_enricher_resolution_matches_subdomains(self):
        self.assertIsNotNone(resolve_enricher("https://www.remotive.com/remote-jobs/123", ""))
        self.assertIsNotNone(resolve_enricher("https://jobs.africa.careers/x", ""))
        self.assertIsNone(resolve_enricher("https://unknown-board.test/x", ""))

    def test_enricher_falls_back_to_the_referring_page(self):
        # A syndicated listing on an unknown company careers page still gets
        # the aggregator's vertical default.
        self.assertIsNotNone(resolve_enricher("https://careers.acme.test/x", "https://remotive.com/remote-jobs"))

    def test_registry_entries_are_uniformly_callable(self):
        # The original five are modules; the new sources are closures. Anything
        # that calls a registry entry must not have to branch on the type.
        for domain, enricher in REGISTRY.items():
            self.assertTrue(callable(enricher), f"{domain} is not callable")
            result = enricher(None, f"https://{domain}/some/path", "Senior React Engineer")
            self.assertIsInstance(result, dict, domain)
            for key in ("opportunity_type", "organization", "location", "source_domain"):
                self.assertIn(key, result, f"{domain} missing {key}")

    def test_enrichers_tolerate_a_missing_soup(self):
        # main.py can reach an enricher before a page has parsed.
        for domain, enricher in REGISTRY.items():
            self.assertIsNotNone(enricher(None, f"https://{domain}/p", "Grant for Founders"))

    def test_default_urls_exclude_editorial_hosts(self):
        urls = get_default_urls(None)
        self.assertGreater(len(urls), 5)
        self.assertFalse(any("techcrunch" in u for u in urls), urls)

    def test_type_specific_urls_are_type_specific(self):
        grants = get_default_urls(["grants"])
        self.assertTrue(grants)
        self.assertFalse(any("devpost" in u for u in grants), grants)

    def test_unknown_type_falls_back_rather_than_returning_nothing(self):
        self.assertTrue(get_default_urls(["not_a_real_type"]))

    def test_ghana_kenya_and_eu_us_boards_are_registered(self):
        # Onboarding names Ghana and Kenya in its geography presets, and the
        # org universe searches the UK/US markets it hires in. A registry that
        # only knows Nigeria and South Africa answers neither.
        for domain in (
            "ghanajobs.com", "jobwebghana.com", "brightermonday.co.ke",
            "careerpointkenya.com", "fuzu.com", "ngcareers.com",
            "eurojobs.com", "reed.co.uk", "totaljobs.com", "builtin.com",
            "simplyhired.com", "ziprecruiter.com", "monster.com",
        ):
            self.assertIn(domain, REGISTRY, f"{domain} missing from REGISTRY")
            self.assertIn(domain, DEFAULT_URLS_BY_DOMAIN, f"{domain} has no index URL")

    def test_every_registry_host_is_seeded_and_typed(self):
        # Both halves of the expansion, as one invariant: a host can be
        # registered and still be invisible to a URL-driven run (no seed URL),
        # or reachable but typed nowhere (infer_type then answers jobs_remote
        # and the record lands in the wrong ladder step upstream).
        for domain in REGISTRY:
            self.assertIn(domain, DEFAULT_URLS_BY_DOMAIN, domain)
            self.assertIn(domain, DOMAIN_TO_TYPE, domain)

    def test_national_boards_are_not_typed_as_remote(self):
        for domain in (
            "jobberman.com", "ghanajobs.com", "brightermonday.co.ke",
            "careerpointkenya.com", "reed.co.uk", "eurojobs.com",
        ):
            self.assertEqual(DOMAIN_TO_TYPE[domain], "jobs_onsite", domain)
            # Domain is the fallback: a bare listing title carries no signal.
            self.assertEqual(infer_type(domain, "Senior React Engineer"), "jobs_onsite", domain)


class TestLinkAdmission(unittest.TestCase):
    """
    The link filters decide what reaches the dataset at all.

    With query-driven discovery the crawler is fed search result pages, which are
    almost entirely chrome, so these predicates do most of the work. Getting them
    wrong is how "Privacy Policy" ends up in a job feed.
    """

    def admits(self, text: str, url: str) -> bool:
        import main as actor_main

        lower = text.lower()
        return (
            not actor_main._is_chrome_link(lower, url)
            and actor_main._looks_like_detail_link(url)
            and actor_main._is_vertical_link(lower, url)
        )

    def test_real_listings_are_admitted(self):
        for text, url in (
            ("Senior Backend Engineer", "https://www.linkedin.com/jobs/view/4123456789"),
            ("Software Engineering Intern", "https://linkedin.com/jobs/view/3999?trk=public"),
            ("Software Engineer role", "https://t.me/s/devjobsnigeria/812"),
            ("Remote React Engineer", "https://remotive.com/remote-jobs/react-123"),
            ("AI Hackathon 2026", "https://devpost.com/hackathon/abc-def"),
            ("Grant for African founders", "https://tolu.co/grant/xyz"),
            ("Apply now", "https://boards.acme.com/apply/eng-123"),
        ):
            self.assertTrue(self.admits(text, url), f"{text!r} @ {url} should be admitted")

    def test_platform_chrome_is_rejected(self):
        for text, url in (
            ("Sign in", "https://www.linkedin.com/login"),
            ("Your feed", "https://www.linkedin.com/feed/"),
            ("Channel preview", "https://t.me/devjobsnigeria"),
            ("Privacy Policy", "https://acme.com/privacy"),
            ("Sign up", "https://acme.com/signup"),
            ("Read more", "https://tolu.co/blog/post-1"),
        ):
            self.assertFalse(self.admits(text, url), f"{text!r} @ {url} should be rejected")

    def test_search_engines_and_link_aggregators_are_rejected(self):
        for text, url in (
            ("Engineer", "https://www.google.com/search?q=eng"),
            ("Engineer", "https://www.bing.com/search?q=eng"),
            ("Engineer", "https://news.ycombinator.com/item?id=1"),
            ("Engineer", "https://www.youtube.com/watch?v=abc"),
            ("Engineer", "https://github.com/some/repo"),
        ):
            self.assertFalse(self.admits(text, url), f"{text!r} @ {url} should be rejected")

    def test_bare_listing_pages_are_not_items(self):
        for url in (
            "https://acme.com/jobs",
            "https://acme.com/hackathons",
            "https://acme.com/opportunities",
        ):
            self.assertFalse(self.admits("Engineer", url), url)

    def test_short_anchor_text_is_admitted_when_the_url_identifies_a_record(self):
        import main as actor_main

        # "Apply now" is 9 characters, under MIN_LINK_TEXT_LEN, so the handler
        # used to drop every application link on a board — "Apply now" is what
        # the button says. The length check is now a floor, not a gate.
        self.assertLess(len("Apply now"), actor_main.MIN_LINK_TEXT_LEN)
        self.assertTrue(actor_main._has_identifier_slug("https://acme.com/apply/eng-123"))
        self.assertTrue(actor_main._has_identifier_slug("https://acme.com/jobs/view/4123456789"))
        self.assertTrue(actor_main._has_identifier_slug("https://t.me/s/devjobs/812"))

        # A short anchor on a *section* URL is still rejected.
        self.assertFalse(actor_main._has_identifier_slug("https://acme.com/about/team"))
        self.assertFalse(actor_main._has_identifier_slug("https://acme.com/jobs"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
