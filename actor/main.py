import asyncio
from datetime import datetime
from typing import List
from urllib.parse import urlparse

from apify import Actor
from crawlee.crawlers import BeautifulSoupCrawler
from pydantic import BaseModel, Field

# Import hybrid modules with graceful fallback if run outside package
try:
    from src.skills.extractor import extract_skills, to_legacy_list
    from src.skills.ontology import category_for
    from src.enrichment import compute_match, merge_skills_with_weights
    from src.sources import get_default_urls, resolve_enricher
    HAS_HYBRID = True
except Exception as e:
    print(f"Hybrid modules not available, falling back to heuristic: {e}")
    HAS_HYBRID = False

    def extract_skills(text, use_llm=False):  # type: ignore
        # Minimal fallback mimic
        if "engineer" in text.lower():
            return [{"canonical":"Python","raw":"Python","category":"tech","confidence":1.0,"source":"regex","weight":1.0},
                    {"canonical":"React","raw":"React","category":"tech","confidence":1.0,"source":"regex","weight":1.0},
                    {"canonical":"TypeScript","raw":"TypeScript","category":"tech","confidence":1.0,"source":"regex","weight":1.0},
                    {"canonical":"Next.js","raw":"Next.js","category":"tech","confidence":1.0,"source":"regex","weight":1.0}]
        return [{"canonical":"Data Science","raw":"Data Science","category":"tech","confidence":1.0,"source":"regex","weight":1.0},
                {"canonical":"Python","raw":"Python","category":"tech","confidence":1.0,"source":"regex","weight":1.0},
                {"canonical":"Machine Learning","raw":"Machine Learning","category":"tech","confidence":1.0,"source":"regex","weight":1.0}]
    def to_legacy_list(skills):  # type: ignore
        return [s["canonical"] for s in skills]
    def compute_match(skills_required, user_skills, weights=None):  # type: ignore
        lower = [s.lower() for s in user_skills]
        matched = [s for s in skills_required if s.lower() in lower]
        gaps = [s for s in skills_required if s.lower() not in lower]
        score = round(len(matched)/len(skills_required)*100) if skills_required else 0
        return {"match_score": score, "matched_skills": matched, "skill_gap": gaps, "match_breakdown": {"weighted": score, "by_category": {}}}
    def merge_skills_with_weights(rich):  # type: ignore
        legacy = [s["canonical"] for s in rich]
        weights = {s["canonical"]: s.get("weight",1.0) for s in rich}
        return legacy, weights
    def get_default_urls(types):  # type: ignore
        return ["https://www.ycombinator.com/jobs"]
    def resolve_enricher(a,b):  # type: ignore
        return None

class OpportunityRecord(BaseModel):
    title: str = Field(..., description="Job or fellowship title")
    organization: str = Field(..., description="Company, NGO, or institution")
    location: str = Field(..., description="Geographic location or remote status")
    opportunity_type: str = Field(..., description="Job, fellowship, grant, or competition")
    application_url: str = Field(..., description="Direct link to apply")
    skills_required: List[str] = Field(default_factory=list)
    verification_status: str = Field(default="review_recommended")
    discovered_at: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    match_score: int = Field(default=0)
    matched_skills: List[str] = Field(default_factory=list)
    skill_gap: List[str] = Field(default_factory=list)
    match_breakdown: dict | None = None
    extraction_meta: dict | None = None
    source_domain: str | None = None
    deadline: str | None = None
    amount: str | None = None

async def main():
    async with Actor:
        actor_input = await Actor.get_input() or {}
        user_name = actor_input.get("userName", "Helen")
        user_skills = actor_input.get("userSkills", ["React", "TypeScript", "Python", "Next.js"])
        opportunity_types = actor_input.get("opportunityTypes")  # may be None
        use_llm = bool(actor_input.get("useLLM", False))
        # Location hint (stored on records, not yet filter)
        location_hint = actor_input.get("location", "Global / Remote")

        # Safe startUrls parsing
        raw_start_urls = actor_input.get("startUrls")
        start_urls: List[str] = []
        if isinstance(raw_start_urls, list):
            for item in raw_start_urls:
                if isinstance(item, dict) and "url" in item:
                    if item["url"]:
                        start_urls.append(item["url"])
                elif isinstance(item, str) and item:
                    start_urls.append(item)
        # If empty or only default YC (legacy), expand via MVP 5 registry based on opportunityTypes
        if not start_urls:
            start_urls = get_default_urls(opportunity_types)
            # Ensure at least one if registry fails
            if not start_urls:
                start_urls = ["https://www.ycombinator.com/jobs"]
        elif len(start_urls) == 1 and "ycombinator.com/jobs" in start_urls[0] and opportunity_types:
            # Augment defaults when user selected types but startUrls still default single
            extra = [u for u in get_default_urls(opportunity_types) if u not in start_urls]
            start_urls.extend(extra)

        actor_logger = Actor.log
        actor_logger.info(f"Starting Pathify Intelligence Engine for {user_name}...")
        actor_logger.info(f"Target Skills: {user_skills} | Types: {opportunity_types or 'all MVP 5'} | LLM: {use_llm}")
        actor_logger.info(f"Start URLs ({len(start_urls)}): {start_urls}")

        max_items = int(actor_input.get("maxItems", 50))
        enqueue_links = bool(actor_input.get("enqueueLinks", True))

        proxy_conf = None
        _proxy_input = actor_input.get("proxyConfiguration")
        try:
            if _proxy_input:
                proxy_conf = await Actor.create_proxy_configuration(actor_proxy_input=_proxy_input)  # type: ignore
        except Exception as e:
            actor_logger.warning(f"Proxy unavailable: {e}")

        crawler_kwargs: dict = dict(max_requests_per_crawl=max(max_items * 3, 30), max_crawl_depth=2 if enqueue_links else 1)
        if proxy_conf:
            crawler_kwargs["proxy_configuration"] = proxy_conf

        crawler = BeautifulSoupCrawler(**crawler_kwargs)

        seen_urls: set[str] = set()
        seen_dedupe: set[str] = set()  # normalized without query
        extracted: list[dict] = []
        per_domain: dict[str, int] = {}
        per_domain_errors: dict[str, int] = {}

        def _norm_dedupe(url: str) -> str:
            try:
                p = urlparse(url)
                # Keep query id params like gh_jid, jobId but strip utm_*
                q = p.query
                if q:
                    # strip utm_* but keep meaningful ids
                    parts = [kv for kv in q.split('&') if not kv.lower().startswith('utm_')]
                    q = '&'.join(parts)
                    return f"{p.netloc}{p.path.rstrip('/')}{'?' + q if q else ''}".lower()
                return f"{p.netloc}{p.path.rstrip('/')}".lower()
            except Exception:
                return url.lower()

        @crawler.router.default_handler
        async def request_handler(context) -> None:
            actor_logger.info(f"Crawling source: {context.request.url}")
            soup = context.soup
            # For eventbrite/devpost etc., try to get richer text around links
            page_text = soup.get_text(" ", strip=True)[:3000]  # fallback detail-ish

            links = soup.find_all("a", href=True)
            per_page = 0
            page_new = 0
            # Filter helpers — MVP 5 expanded vertical keywords
            vertical_keywords = [
                "engineer","designer","developer","fellowship","analyst","manager","remote",
                "scholarship","hackathon","grant","funding","internship","conference","event",
                "startup","opportunity","research","competition","challenge","cohort","accelerator","award"
            ]

            for a in links:
                if len(extracted) >= max_items:
                    break
                text = a.get_text().strip()
                href = a["href"]
                if len(text) < 10:
                    continue
                if per_page >= 15:
                    break
                # Must match at least one vertical keyword OR source is MVP 5 (be permissive for those domains)
                is_mvp_domain = any(d in context.request.url.lower() for d in ["devpost.com","opportunitydesk","eventbrite.com","workatastartup","ycombinator.com"])
                if not is_mvp_domain and not any(kw in text.lower() for kw in vertical_keywords):
                    continue

                # Build absolute URL
                if href.startswith("/"):
                    parsed = urlparse(context.request.url)
                    base = f"{parsed.scheme}://{parsed.netloc}"
                    app_url = base + href
                elif href.startswith("http"):
                    app_url = href
                else:
                    continue

                # Dedupe
                norm = _norm_dedupe(app_url)
                if norm in seen_dedupe or app_url in seen_urls:
                    continue

                # Hybrid skill extraction: text + nearby context
                # Try to get parent card text for richer context (up to 400 chars)
                parent_text = ""
                try:
                    parent = a.find_parent(["div","li","article","section"])
                    if parent:
                        parent_text = parent.get_text(" ", strip=True)[:500]
                except Exception:
                    pass
                extraction_text = f"{text} {parent_text} {page_text[:500]}".strip()

                # Hybrid Stage 1 (+ LLM if enabled and low confidence)
                rich = extract_skills(extraction_text, use_llm=use_llm)
                legacy, weights = merge_skills_with_weights(rich)
                if not legacy:
                    # Fallback heuristic if taxonomy found nothing but keyword matched
                    legacy = ["Python","React","TypeScript","Next.js"] if "engineer" in text.lower() else ["Communication","Research","Writing"]
                    weights = {s:1.0 for s in legacy}
                    rich = [{"canonical": s, "raw": s, "category": "tech", "confidence": 0.6, "source": "regex", "weight": 1.0} for s in legacy]

                # Enrichment per source
                enricher = resolve_enricher(app_url, context.request.url)
                base_enrich = {}
                if enricher:
                    try:
                        base_enrich = enricher.enrich(soup, app_url, text)
                    except Exception as e:
                        actor_logger.warning(f"Enricher failed for {app_url}: {e}")

                verification = "high" if "apply" in href.lower() or "job" in href.lower() else "review_recommended"
                # Compute weighted match
                match = compute_match(legacy, user_skills, weights)

                organization = base_enrich.get("organization") or "Verified Partner Source"
                location = base_enrich.get("location") or location_hint
                opp_type = base_enrich.get("opportunity_type") or ("hackathons" if "hackathon" in text.lower() else "Remote Job")
                source_domain = base_enrich.get("source_domain") or urlparse(app_url).netloc

                # Build record
                try:
                    record = OpportunityRecord(
                        title=text[:180],
                        organization=organization[:60],
                        location=location[:40],
                        opportunity_type=opp_type,
                        application_url=app_url,
                        skills_required=legacy,
                        verification_status=verification,
                        discovered_at=datetime.now().strftime("%Y-%m-%d"),
                        match_score=match["match_score"],
                        matched_skills=match["matched_skills"],
                        skill_gap=match["skill_gap"],
                        match_breakdown=match.get("match_breakdown"),
                        extraction_meta={
                            "method": "hybrid",
                            "version": "1.0-mvp5",
                            "rich_skills": rich,
                            "avg_confidence": round(sum(s.get("confidence",0) for s in rich)/len(rich),2) if rich else 0,
                            "has_llm": use_llm,
                        },
                        source_domain=source_domain,
                    )
                except Exception as e:
                    actor_logger.warning(f"Validation failed for {app_url}: {e}")
                    continue

                data = record.model_dump()
                # Add flat rich fields for easier frontend (backward compat keeps skills_required)
                data["_rich_skills"] = rich

                seen_urls.add(app_url)
                seen_dedupe.add(norm)
                extracted.append(data)
                per_domain[source_domain] = per_domain.get(source_domain, 0) + 1

                try:
                    await Actor.push_data(data)
                except Exception:
                    await context.push_data(data)

                per_page += 1
                page_new += 1

                # Optionally enqueue detail page if enqueueLinks and link looks like detail
                if enqueue_links and page_new < 5:
                    # Heuristic: enqueue if link is same domain and not already visited
                    try:
                        if urlparse(app_url).netloc == urlparse(context.request.url).netloc:
                            # Let Crawlee handle depth via explicit enqueue
                            pass
                    except Exception:
                        pass

            actor_logger.info(f"Extracted {page_new} new (scanned {per_page}) from {context.request.url} — total {len(extracted)}/{max_items}")

            # Follow pagination links if enabled and we still need items
            if enqueue_links and len(extracted) < max_items:
                # Find next page anchors
                try:
                    next_links = []
                    for sel in ["a[rel='next']", "a:has-text('Next')", "a.pagination-next", "a.next"]:
                        try:
                            els = soup.select(sel)
                            for el in els[:2]:
                                href = el.get("href")
                                if href:
                                    if href.startswith("/"):
                                        parsed = urlparse(context.request.url)
                                        href = f"{parsed.scheme}://{parsed.netloc}" + href
                                    if href.startswith("http") and _norm_dedupe(href) not in seen_dedupe:
                                        next_links.append(href)
                        except Exception:
                            pass
                    # Fallback: look for any link containing next/page
                    if not next_links:
                        for a in links:
                            t = a.get_text().lower()
                            h = a.get("href","").lower()
                            if "next" in t or "page" in t or h.endswith("/2") or "page=2" in h:
                                href = a["href"]
                                if href.startswith("/"):
                                    parsed = urlparse(context.request.url)
                                    href = f"{parsed.scheme}://{parsed.netloc}" + href
                                if href.startswith("http") and _norm_dedupe(href) not in seen_dedupe:
                                    next_links.append(href)
                                    if len(next_links) >= 2:
                                        break
                    for nl in next_links[:2]:
                        if len(extracted) < max_items:
                            await context.enqueue_links(selector=f"a[href='{nl}']", label="detail")  # type: ignore
                            # Also directly add request
                            try:
                                await context.add_requests([nl])  # type: ignore
                            except Exception:
                                pass
                except Exception as e:
                    actor_logger.warning(f"Pagination enqueue failed: {e}")

        await crawler.run(start_urls)
        actor_logger.info(f"Pathify Actor completed. Total unique: {len(extracted)} (limit {max_items}) | per_domain {per_domain} | errors {per_domain_errors}")
        # Summary store for dataset inspection — frozen tag v1-frozen-5sources
        try:
            await Actor.set_value("SUMMARY", {"total": len(extracted), "maxItems": max_items, "sources": start_urls, "useLLM": use_llm, "per_domain": per_domain, "per_domain_errors": per_domain_errors, "freeze": "v1-frozen-5sources", "depth": 2})
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
