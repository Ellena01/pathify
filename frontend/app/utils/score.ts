// Pathify deterministic matching — weighted multi-factor scoring
// Skills: 60%, Location: 20%, Goals/Type: 10%, Experience hint: 10%

export interface MatchResult {
  score: number;
  matched: string[];
  gap: string[];
  breakdown: {
    skills: number;    // 0-60
    location: number;  // 0-20
    goals: number;     // 0-10
    experience: number; // 0-10
  };
  explanation: string;
}

const LOCATION_REMOTE_KEYWORDS = ['remote', 'global', 'worldwide', 'anywhere', 'distributed'];
const LOCATION_FLEXIBLE = ['hybrid', 'flexible'];

// Type → goal mapping for goal alignment
const TYPE_GOAL_MAP: Record<string, string[]> = {
  jobs_remote: ['Remote Job', 'Remote', 'Job'],
  jobs_hybrid: ['Hybrid Job', 'Hybrid', 'Job'],
  jobs_onsite: ['Onsite Job', 'Job'],
  internships: ['Internship', 'Job'],
  fellowships: ['Fellowship', 'Scholarship', 'Grant'],
  scholarships: ['Scholarship', 'Fellowship'],
  grants: ['Grant', 'Funding', 'Startup Funding'],
  startup_funding: ['Startup Funding', 'Grant', 'Funding'],
  hackathons: ['Hackathon', 'Remote Job'],
  conferences: ['Conference', 'Fellowship'],
  events: ['Event', 'Conference'],
};

function locationScore(oppLocation: string, userCountry: string): number {
  const loc = (oppLocation || '').toLowerCase();
  const country = (userCountry || '').toLowerCase();

  // Full remote — anyone qualifies
  if (LOCATION_REMOTE_KEYWORDS.some(k => loc.includes(k))) return 20;
  // Hybrid — partial credit
  if (LOCATION_FLEXIBLE.some(k => loc.includes(k))) return 12;
  // Country/region match
  if (country && loc.includes(country)) return 18;
  // Africa-wide match for African countries
  const africanCountries = ['nigeria', 'kenya', 'ghana', 'south africa', 'rwanda', 'ethiopia',
    'egypt', 'morocco', 'senegal', 'uganda', 'tanzania', 'cameroon', 'zambia', 'zimbabwe'];
  if (africanCountries.includes(country) && loc.includes('africa')) return 14;
  // No location match
  return 0;
}

function goalScore(oppType: string, userGoals: string[]): number {
  if (!oppType || !userGoals?.length) return 5; // neutral
  const aligned = (TYPE_GOAL_MAP[oppType] || []);
  const lowerGoals = userGoals.map(g => g.toLowerCase());
  const hits = aligned.filter(a => lowerGoals.some(g => g.includes(a.toLowerCase()) || a.toLowerCase().includes(g)));
  return hits.length > 0 ? 10 : 3;
}

function experienceScore(opp: any): number {
  // Heuristic: entry-level / junior / intern signals get higher score for newer profiles
  const title = (opp.title || '').toLowerCase();
  const isJunior = /junior|entry[- ]level|intern|graduate|fresh/i.test(title);
  const isSenior = /senior|lead|principal|director|head of|vp |staff /i.test(title);
  // No user experience field yet — return neutral score
  if (isJunior) return 10;  // accessible
  if (isSenior) return 5;   // slightly penalised for unknown experience
  return 8;
}

export function calculateWeightedMatch(
  requiredSkills: string[],
  userSkills: string[],
  weights?: Record<string, number>
): { score: number; matched: string[]; gap: string[] } {
  if (!requiredSkills || requiredSkills.length === 0) {
    return { score: 0, matched: [], gap: [] };
  }
  const lowerUser = (userSkills || []).map(s => s.toLowerCase());
  const matched: string[] = [];
  const gap: string[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;
  for (const skill of requiredSkills) {
    const w = weights?.[skill] ?? weights?.[skill.toLowerCase()] ?? 1;
    totalWeight += w;
    if (lowerUser.includes(skill.toLowerCase())) {
      matched.push(skill);
      matchedWeight += w;
    } else {
      gap.push(skill);
    }
  }
  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  return { score, matched, gap };
}

export function calculateFullMatch(
  opp: any,
  userSkills: string[],
  userCountry?: string,
  userGoals?: string[]
): MatchResult {
  const required: string[] = Array.isArray(opp.skills_required)
    ? opp.skills_required.map((s: any) => (typeof s === 'string' ? s : s?.canonical || '')).filter(Boolean)
    : [];

  // Skills component (0-60)
  const { score: rawSkillPct, matched, gap } = calculateWeightedMatch(required, userSkills || []);
  const skillsComponent = Math.round((rawSkillPct / 100) * 60);

  // Location (0-20)
  const locationComponent = locationScore(opp.location || '', userCountry || '');

  // Goals/type (0-10)
  const goalsComponent = goalScore(opp.opportunity_type || '', userGoals || []);

  // Experience hint (0-10)
  const experienceComponent = experienceScore(opp);

  const total = skillsComponent + locationComponent + goalsComponent + experienceComponent;
  const score = Math.min(100, Math.max(0, total));

  // Human-readable explanation
  let explanation = '';
  if (score >= 80) {
    explanation = `Excellent fit — you cover ${matched.length}/${required.length} skills and this matches your goals.`;
  } else if (score >= 60) {
    explanation = `Strong match — ${matched.length} of ${required.length} skills align. ${gap.length > 0 ? `Adding ${gap.slice(0, 2).join(', ')} would push you to 80%+.` : ''}`;
  } else if (score >= 40) {
    explanation = `Growing match — ${matched.length} skills align, ${gap.length} skills to develop for stronger fit.`;
  } else if (required.length === 0) {
    explanation = 'No specific skills listed — open application.';
  } else {
    explanation = `Starting point — develop ${gap.slice(0, 3).join(', ')} to improve fit.`;
  }

  return {
    score,
    matched,
    gap,
    breakdown: {
      skills: skillsComponent,
      location: locationComponent,
      goals: goalsComponent,
      experience: experienceComponent,
    },
    explanation,
  };
}

export function legacyScore(required: string[], userSkills: string[]) {
  return calculateWeightedMatch(required, userSkills).score;
}

/**
 * Canonical Opportunity Key Helper
 * Single source of truth for keying an opportunity across saves, tracker, navigator, and detail views.
 */
export function getOpportunityKey(opp: any): string {
  if (!opp) return '';
  if (typeof opp === 'string') return opp;
  const rawKey = opp.application_url || opp.job_url || opp.id || opp.title;
  return String(rawKey || '').trim();
}
