"""
Opportunity enrichment — extraction, not scoring.

WHY THERE IS NO `compute_match` HERE ANY MORE
---------------------------------------------
This module used to contain `compute_match(skills_required, user_skills,
weights)`, a third implementation of Pathify's match score alongside
`frontend/lib/matching.ts` and `frontend/app/utils/score.ts`. The three
disagreed — the Python one was taxonomy-weighted, the TypeScript shim was not —
so the same listing showed different percentages in the dataset, in the browser
and in the digest email.

`frontend/lib/matching.ts` is now the only implementation. It runs server-side
per *user* (it needs `yearsExperience`, `preferredLocations` and `preferredTypes`,
none of which exist at scrape time) and persists to `user_opportunity_matches`.
The actor's job is to describe the opportunity accurately; scoring it is the
application's job.

`/api/sync` still accepts a legacy `match_score` column, but nothing writes one
any more.

WHAT THIS MODULE DOES NOW
-------------------------
Turns raw scraped HTML into the fields Pathify's schema needs, with an explicit
confidence and provenance for each:

  * `extract_deadline` — real closing dates from JSON-LD, <time>, meta tags and
    prose ("Apply by 15 March 2026", "closes in 2 weeks"). Every source site
    expresses deadlines differently and the crawler previously gave up and wrote
    NULL, so `deadline` was empty for essentially the whole catalog and the
    deadline-based sort and the "closing soon" urgency in the tracker had
    nothing to work with.
  * `extract_amount` — grant/prize/funding amounts ("$25,000", "up to R2.5M").
  * `extract_summary` — a bounded, script-stripped description for the detail
    view and for skill extraction.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")
# <script>/<style> bodies are never prose and dominate the character count.
_SCRIPT = re.compile(r"<(script|style|noscript|template)\b[^>]*>.*?</\1>", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")
_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&apos;": "'", "&rsquo;": "'", "&lsquo;": "'",
    "&ndash;": "-", "&mdash;": "-", "&hellip;": "...",
}

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
# "15 Mar", "Mar 15", "15th March 2026" -> a regex fragment
_MONTH_ALT = "|".join(sorted(MONTHS, key=len, reverse=True))


def strip_html(html: str) -> str:
    """Readable text from a fragment. Never returns None."""
    if not html:
        return ""
    text = _SCRIPT.sub(" ", html)
    text = _TAG.sub(" ", text)
    for entity, replacement in _ENTITIES.items():
        text = text.replace(entity, replacement)
    return _WS.sub(" ", text).strip()


def clean_title(text: str, max_len: int = 180) -> str:
    return _WS.sub(" ", strip_html(text or "")).strip()[:max_len]


# ---------------------------------------------------------------------------
# Deadline extraction
# ---------------------------------------------------------------------------

# Words that mean "there is no deadline", which must beat a bare date match.
# "Rolling applications" pages are full of event dates (the conference itself)
# that are not the application deadline.
_ROLLING = re.compile(
    r"\b(rolling|open until filled|until filled|whenever|anytime|"
    r"no (deadline|closing date)|deadline[:\s]+n/?a)\b",
    re.I,
)

# "apply by", "applications close", "submit by", "deadline", "closing date"
_DEADLINE_LABEL = re.compile(
    r"(?:applications?\s+)?(?:close|closes|closing|closes\s+on|deadline|due|"
    r"apply\s+by|apply\s+before|submit\s+by|applications?\s+due|last\s+date|"
    r"cut[ -]?off|registration\s+closes)\s*"
    r"[:\-–—]?\s*",
    re.I,
)

# `(?!\d)` rather than `\b`: in "2026-11-30T23:59" there is no word boundary
# between "0" and "T" (both are word characters), so a trailing `\b` silently
# failed on every ISO *datetime* — which is the most common spelling.
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})(?!\d)")
# 15/03/2026 or 03/15/2026 — day-first is the overwhelming majority worldwide
_SLASH = re.compile(r"\b(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{2,4})\b")
# 15 March 2026 / March 15, 2026 / 15th March 2026
_TEXTUAL = re.compile(
    rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\.?,?\s*(\d{{4}})?\b"
    rf"|\b({_MONTH_ALT})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s*(\d{{4}})?\b",
    re.I,
)
# "in 2 weeks", "within 30 days", "next 3 months"
_RELATIVE = re.compile(
    r"\b(?:in|within|over\s+the\s+next)\s+(\d{1,3})\s*(day|days|week|weeks|month|months)\b",
    re.I,
)
# "until 30 June", "through 2026-08-01"
_UNTIL = re.compile(rf"\b(?:until|through|up\s+to)\s+((?:\d{{1,2}}\s+)?{_MONTH_ALT}\.?\s*(?:\d{{4}})?|\d{{4}}-\d{{2}}-\d{{2}})", re.I)

# JSON-LD keys that actually mean "you can still apply".
_DEADLINE_LD_KEYS = ("validThrough", "applicationDeadline", "deadline", "acceptsApplicationsUntil")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _iso(d: date) -> str:
    return d.isoformat()


def _mk(year: int, month: int, day: int) -> Optional[date]:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _resolve_year(month: int, day: int, year: Optional[int], today: date) -> Optional[date]:
    """Infer the year for a date that did not state one.

    A deadline that already passed this year is almost always next year's
    edition ("applications close 15 March" in November), so roll forward rather
    than discarding the record.
    """
    if year is not None:
        return _mk(year, month, day)
    for candidate_year in (today.year, today.year + 1):
        candidate = _mk(candidate_year, month, day)
        if candidate and candidate >= today - timedelta(days=1):
            return candidate
    return _mk(today.year, month, day)


def _parse_text_date(fragment: str, today: date) -> Optional[date]:
    """Parse any of the supported date spellings out of a short fragment."""
    fragment = fragment.strip()

    m = _ISO.search(fragment)
    if m:
        return _mk(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    m = _SLASH.search(fragment)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        # Disambiguate: a value > 12 in the first position can only be a day.
        if a > 12:
            return _mk(y, b, a)
        if b > 12:
            return _mk(y, a, b)
        # Ambiguous (03/04/2026). Day-first is the global default outside the US;
        # if that reading is impossible, fall back to month-first.
        return _mk(y, b, a) or _mk(y, a, b)

    m = _TEXTUAL.search(fragment)
    if m:
        if m.group(2):  # "15 March 2026"
            month = MONTHS[m.group(2).lower().rstrip(".")]
            return _resolve_year(month, int(m.group(1)), int(m.group(3)) if m.group(3) else None, today)
        # "March 15, 2026"
        month = MONTHS[m.group(4).lower().rstrip(".")]
        return _resolve_year(month, int(m.group(5)), int(m.group(6)) if m.group(6) else None, today)

    return None


def deadline_from_text(text: str, today: Optional[date] = None) -> Optional[str]:
    """
    Find a real application deadline in prose. Returns `YYYY-MM-DD` or None.

    Order matters. A page that says "rolling applications" alongside a date is
    describing something else (an event, a cohort start), so the rolling marker
    wins and we return None rather than a confident wrong date.
    """
    if not text:
        return None
    today = today or _today()
    clean = strip_html(text)

    if _ROLLING.search(clean):
        return None

    # 1) Labelled dates are the most reliable: "apply by 15 March 2026".
    for label in _DEADLINE_LABEL.finditer(clean):
        tail = clean[label.end(): label.end() + 60]
        parsed = _parse_text_date(tail, today)
        if parsed:
            return _iso(parsed)

    # 2) "until 30 June" / "through 2026-08-01"
    for m in _UNTIL.finditer(clean):
        parsed = _parse_text_date(m.group(1), today)
        if parsed:
            return _iso(parsed)

    # 3) Relative windows: "closes in 2 weeks".
    m = _RELATIVE.search(clean)
    if m:
        amount = int(m.group(1))
        unit = m.group(2).lower().rstrip("s")
        if 0 < amount <= 365:
            days = amount * {"day": 1, "week": 7, "month": 30}[unit]
            return _iso(today + timedelta(days=days))

    # 4) Last resort: any parseable date. A bare date in an opportunity page is
    #    more often the deadline than not, so this is worth taking.
    parsed = _parse_text_date(clean, today)
    return _iso(parsed) if parsed else None


def deadline_from_iso_string(value: Any) -> Optional[str]:
    """`<time datetime="...">`, JSON-LD `validThrough`, and friends."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None

    # Datetime first, then plain date: `2026-03-15T23:59:59+00:00`.
    try:
        return _iso(datetime.fromisoformat(text.replace("Z", "+00:00")).date())
    except ValueError:
        pass
    try:
        return _iso(datetime.strptime(text[:10], "%Y-%m-%d").date())
    except ValueError:
        pass
    return _parse_text_date(text, _today()).isoformat() if _parse_text_date(text, _today()) else None


def _walk(node: Any, depth: int = 0):
    """Yield every dict in a nested JSON-LD structure, bounded."""
    if depth > 6:
        return
    if isinstance(node, list):
        for item in node[:50]:
            yield from _walk(item, depth + 1)
    elif isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value, depth + 1)


def deadline_from_json_ld(soup) -> Optional[str]:
    """
    Read the deadline out of schema.org JSON-LD.

    `JobPosting.validThrough` is the field Google Jobs requires and every
    serious ATS emits it, so this is both the most precise and the cheapest
    source. It is tried before prose because structured data is not ambiguous.
    """
    if soup is None:
        return None
    for script in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)})[:5]:
        raw = script.string or script.get_text() or ""
        try:
            import json

            data = json.loads(raw)
        except Exception:
            continue
        for node in _walk(data):
            node_type = str(node.get("@type", "")).lower()
            if node_type and not any(
                t in node_type for t in ("jobposting", "event", "scholarship", "grant", "course")
            ):
                continue
            for key in _DEADLINE_LD_KEYS:
                parsed = deadline_from_iso_string(node.get(key))
                if parsed:
                    return parsed
    return None


def deadline_from_soup(soup) -> Optional[str]:
    """
    Best available deadline from a parsed page, in descending order of trust.

    1. schema.org JSON-LD  (structured, unambiguous)
    2. <time datetime>     (usually the event or the closing date)
    3. labelled prose      ("applications close on ...")
    """
    if soup is None:
        return None

    parsed = deadline_from_json_ld(soup)
    if parsed:
        return parsed

    # <time datetime="2026-03-15"> — a <time> with a real datetime attribute is
    # almost always the date that matters on an opportunity page.
    for element in soup.find_all("time")[:20]:
        candidate = element.get("datetime") or element.get("data-datetime")
        parsed = deadline_from_iso_string(candidate)
        if parsed:
            return parsed

    # Common meta conventions.
    for selector in (
        {"itemprop": "validThrough"},
        {"property": "og:updated_time"},
        {"name": "application-deadline"},
        {"name": "deadline"},
        {"name": "closing-date"},
    ):
        element = soup.find("meta", attrs=selector)
        parsed = deadline_from_iso_string(element.get("content") if element else None)
        if parsed:
            return parsed

    # Finally, the card's own text — scope it so an unrelated date elsewhere on
    # the page cannot win.
    return deadline_from_text(soup.get_text(" ", strip=True)[:2000])


# ---------------------------------------------------------------------------
# Amount extraction
# ---------------------------------------------------------------------------

_AMOUNT = re.compile(
    r"(?:(?:US|USD|\$|€|EUR|£|GBP|R|ZAR|KES|NGN|GHS|ZMW|EUR)\s?)?"
    r"(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)\s*"
    r"(k|thousand|m|million|b|billion)?\b",
    re.I,
)
_AMOUNT_CONTEXT = re.compile(
    r"(funding|grant|prize|award|budget|investment|equity| stipend|"
    r"fellowship|up to|worth|valued at|total funding|seed)",
    re.I,
)
# A bare year or a page count is not money.
_AMOUNT_REJECT = re.compile(r"^\d{4}$")


def extract_amount(text: str) -> Optional[str]:
    """
    A grant/prize/funding figure, e.g. "$25,000" or "up to R2.5 million".

    Requires monetary context in the surrounding text, so a listing that merely
    contains "2026" or "3 rounds" does not acquire a fictional amount.
    """
    if not text:
        return None
    clean = strip_html(text)
    for m in _AMOUNT.finditer(clean):
        raw = m.group(0).strip()
        digits = m.group(1).replace(",", "").replace(" ", "")
        if _AMOUNT_REJECT.match(digits):
            continue
        window = clean[max(0, m.start() - 80): m.end() + 80]
        if not _AMOUNT_CONTEXT.search(window):
            continue
        return raw[:40]
    return None


# ---------------------------------------------------------------------------
# Description
# ---------------------------------------------------------------------------

_SUMMARY_MAX = 600


def extract_summary(soup, fallback: str = "") -> str:
    """
    A bounded description for the detail view and for skill extraction.

    Prefers a real description element over the whole page text, because feeding
    3000 characters of site chrome into the skill extractor produced confident
    matches for skills that appear in a footer, not in the job.
    """
    if soup is not None:
        for selector in (
            {"class": re.compile(r"(job|opp|listing|post|event)[-_]?(description|details|body)", re.I)},
            {"itemprop": "description"},
            {"id": re.compile(r"(job|listing|opportunity)[-_]?(description|details)", re.I)},
            {"class": "description"},
        ):
            try:
                element = soup.find(attrs=selector)
            except Exception:
                element = None
            if element:
                text = strip_html(element.get_text(" ", strip=True))
                if len(text) >= 40:
                    return text[:_SUMMARY_MAX]
    return strip_html(fallback)[:_SUMMARY_MAX]


# ---------------------------------------------------------------------------
# Skill bridging
# ---------------------------------------------------------------------------


def merge_skills_with_weights(rich_skills: List[Dict[str, Any]]) -> tuple:
    """
    From rich `Skill` dicts to the legacy flat list + weights map.

    Kept because `skills_required` is a `text[]` column and the taxonomy weight
    is needed to rank the skills that survive. `lib/matching.ts` re-applies the
    canonical weights server-side; this map is only used for ordering here.
    """
    legacy = [s["canonical"] for s in rich_skills if s.get("canonical")]
    weights = {
        s["canonical"]: float(s.get("weight", 1.0))
        for s in rich_skills
        if s.get("canonical")
    }
    return legacy, weights
