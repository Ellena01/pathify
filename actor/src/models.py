from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class Skill(BaseModel):
    canonical: str
    raw: str
    category: Literal["tech", "soft", "domain", "tool"] = "tech"
    confidence: float = 1.0
    source: Literal["regex", "embedding", "llm"] = "regex"
    weight: float = 1.0


class OpportunityRecord(BaseModel):
    """
    Pathify's opportunity schema.

    NOTE: there is deliberately no `match_score`, `matched_skills`,
    `skill_gap` or `match_breakdown` here.

    They were per-user quantities computed by a third implementation of the
    match score living in `src/enrichment.py`, which disagreed with
    `frontend/lib/matching.ts` and `frontend/app/utils/score.ts`. The engine is
    now `lib/matching.ts` only: it runs server-side per user (it needs
    `yearsExperience`, `preferredLocations` and `preferredTypes`, none of which
    exist at scrape time) and persists to `public.user_opportunity_matches`.

    The actor's job is to describe the opportunity accurately.
    """

    title: str = Field(..., description="Job or fellowship title")
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
    skills_required: List[str] = Field(default_factory=list, description="Flat canonical skill list")
    skills_rich: Optional[List[Skill]] = Field(default=None, description="Hybrid rich skill list")
    description: str = Field(default="", description="Bounded summary for the detail view")
    verification_status: str = Field(default="review_recommended")
    discovered_at: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    extraction_meta: Optional[dict] = None
    source_domain: Optional[str] = None
    source_platform: Optional[str] = Field(
        default=None, description="google | linkedin | telegram | website | registry"
    )
    discovery_query: Optional[str] = Field(
        default=None, description="The query that surfaced this listing, for provenance"
    )
    deadline: Optional[str] = Field(default=None, description="YYYY-MM-DD, or null when genuinely absent")
    amount: Optional[str] = Field(default=None, description="Grant/prize/funding figure, when stated")
