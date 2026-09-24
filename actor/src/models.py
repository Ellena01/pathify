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
    title: str = Field(..., description="Job or fellowship title")
    organization: str = Field(..., description="Company, NGO, or institution")
    location: str = Field(..., description="Geographic location or remote status")
    opportunity_type: str = Field(..., description="jobs_remote | jobs_hybrid | jobs_onsite | internships | conferences | fellowships | events | startup_funding | grants | scholarships | hackathons")
    application_url: str = Field(..., description="Direct link to apply")
    skills_required: List[str] = Field(default_factory=list, description="Legacy flat list for backward compat")
    skills_rich: Optional[List[Skill]] = Field(default=None, description="Hybrid rich skill list")
    verification_status: str = Field(default="review_recommended")
    discovered_at: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    match_score: int = Field(default=0)
    matched_skills: List[str] = Field(default_factory=list)
    skill_gap: List[str] = Field(default_factory=list)
    match_breakdown: Optional[dict] = None
    extraction_meta: Optional[dict] = None
    source_domain: Optional[str] = None
    deadline: Optional[str] = None
    amount: Optional[str] = None
