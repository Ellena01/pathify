/**
 * Pathify deterministic match engine — the single source of truth.
 *
 * Four weighted factors, summing to 100:
 *
 *   Skill alignment  60
 *   Location/remote  20
 *   Career goals     10
 *   Experience       10
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The same score was previously computed in three places that disagreed:
 *   - actor/src/enrichment.py  (weighted, real per-category breakdown)
 *   - app/utils/score.ts        (unweighted; its `weights` param was never
 *                                passed by any caller, so weights were dead)
 *   - app/api/navigator/route.ts (a third keyword-parsing fallback)
 *
 * The same opportunity therefore showed three different percentages depending
 * on which surface rendered it. There is now exactly one implementation, it
 * runs server-side, and its output is persisted to
 * `public.user_opportunity_matches`.
 *
 * Deterministic by design: the same inputs always produce the same score, so a
 * match percentage is auditable and explainable rather than a black box.
 */

import { resolveSkills, type ResolvedSkill } from './taxonomy';

// ---------------------------------------------------------------------------
// Catalog hygiene
// ---------------------------------------------------------------------------

/**
 * The two predicates every user-facing read of `opportunities_cache` must apply:
 *
 *  - `is_active = false` marks a listing the crawler has confirmed is gone
 *    (dead apply link, closed req, expired post). Serving it is worse than
 *    serving nothing: the user clicks through to a 404.
 *  - `verification_status = 'rejected'` is a moderator decision. A rejected
 *    listing appearing in a feed, a digest or an AI answer is a moderation
 *    bypass, not a ranking quirk.
 *
 * The SQL form is written out at each call site (`.eq('is_active', true).neq(
 * 'verification_status', 'rejected')`) because this project has no generated
 * Database types, so a shared builder helper would have to be untyped to accept
 * more than one client. The in-memory form — for rows with no SQL layer, such as
 * the Apify dataset fallback — lives here.
 *
 * Absent values are treated as visible: actor output predates both columns, and
 * defaulting to hidden would silently empty the feed on an unmigrated database.
 */
export const CATALOG_HYGIENE_COLUMNS = {
  isActive: 'is_active',
  verificationStatus: 'verification_status',
  rejected: 'rejected',
} as const;

/** Pure predicate for rows that did not come from Postgres (e.g. Apify output). */
export function isVisibleListing(row: { is_active?: unknown; verification_status?: unknown } | null): boolean {
  if (!row) return false;
  if (row.is_active === false) return false;
  if (row.verification_status === CATALOG_HYGIENE_COLUMNS.rejected) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = {
  skills: 60,
  location: 20,
  goals: 10,
  experience: 10,
} as const;

export interface MatchBreakdown {
  /** 0–60. Weighted coverage of required skills. */
  skills: number;
  /** 0–20. Remote / country / region affinity. */
  location: number;
  /** 0–10. Opportunity type vs. declared career goals. */
  goals: number;
  /** 0–10. Seniority fit against real profile experience. */
  experience: number;
}

export interface CategoryBreakdown {
  matched: number;
  required: number;
  /** 0–100, weighted coverage within this category. */
  pct: number;
}

export interface MatchResult {
  /** 0–100. */
  score: number;
  matched: string[];
  gap: string[];
  breakdown: MatchBreakdown;
  byCategory: Partial<Record<'tech' | 'soft' | 'domain' | 'tool', CategoryBreakdown>>;
  /** Human-readable justification, safe to render as text. */
  explanation: string;
  /** One line per factor, for the "Why you match" panel. */
  reasons: string[];
}

export interface MatchSubject {
  skills?: readonly string[] | null;
  country?: string | null;
  goals?: readonly string[] | null;
  /** Total years of professional experience, if known. */
  yearsExperience?: number | null;
  /** Most recent job title, used for seniority inference. */
  currentRole?: string | null;
  preferredLocations?: readonly string[] | null;
  preferredTypes?: readonly string[] | null;
}

export interface MatchTarget {
  title?: string | null;
  organization?: string | null;
  location?: string | null;
  opportunity_type?: string | null;
  skills_required?: unknown;
  deadline?: string | null;
}

// ---------------------------------------------------------------------------
// Opportunity taxonomy
// ---------------------------------------------------------------------------

export const OPPORTUNITY_TYPES = [
  'jobs_remote',
  'jobs_hybrid',
  'jobs_onsite',
  'internships',
  'conferences',
  'fellowships',
  'events',
  'startup_funding',
  'grants',
  'scholarships',
  'hackathons',
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  jobs_remote: 'Remote job',
  jobs_hybrid: 'Hybrid job',
  jobs_onsite: 'On-site job',
  internships: 'Internship',
  conferences: 'Conference',
  fellowships: 'Fellowship',
  events: 'Event',
  startup_funding: 'Startup funding',
  grants: 'Grant',
  scholarships: 'Scholarship',
  hackathons: 'Hackathon',
};

const TYPE_LOOKUP = new Map<string, OpportunityType>(
  OPPORTUNITY_TYPES.map((t) => [t, t])
);

/** Accepts snake_case, the legacy 'Remote Job' spelling, or a human label. */
export function normalizeOpportunityType(input: unknown): OpportunityType {
  if (typeof input !== 'string') return 'jobs_remote';
  const raw = input.trim();
  const direct = TYPE_LOOKUP.get(raw.toLowerCase().replace(/[\s-]+/g, '_'));
  if (direct) return direct;

  const flat = raw.toLowerCase();
  if (flat.includes('intern')) return 'internships';
  if (flat.includes('hackathon')) return 'hackathons';
  if (flat.includes('scholar')) return 'scholarships';
  if (flat.includes('fellow')) return 'fellowships';
  if (flat.includes('grant')) return 'grants';
  if (flat.includes('fund') || flat.includes('invest')) return 'startup_funding';
  if (flat.includes('conference') || flat.includes('summit')) return 'conferences';
  if (flat.includes('event')) return 'events';
  if (flat.includes('hybrid')) return 'jobs_hybrid';
  if (flat.includes('onsite') || flat.includes('on-site')) return 'jobs_onsite';
  if (flat.includes('job') || flat.includes('role') || flat.includes('position')) return 'jobs_remote';

  return 'jobs_remote';
}

/**
 * Opportunity type -> the goal labels that make it a fit.
 * Goals are free-text user input, so matching is bidirectional substring
 * comparison rather than exact equality.
 */
export const TYPE_GOAL_MAP: Record<OpportunityType, string[]> = {
  jobs_remote: ['remote job', 'remote', 'job', 'employment', 'work'],
  jobs_hybrid: ['hybrid job', 'hybrid', 'job', 'employment'],
  jobs_onsite: ['onsite job', 'on-site', 'onsite', 'job', 'employment'],
  internships: ['internship', 'intern', 'job', 'placement', 'experience'],
  conferences: ['conference', 'summit', 'networking', 'speaking'],
  fellowships: ['fellowship', 'fellow', 'programme', 'program', 'cohort'],
  events: ['event', 'conference', 'community'],
  startup_funding: ['startup funding', 'funding', 'raise', 'capital', 'invest'],
  grants: ['grant', 'funding', 'non-dilutive', 'finance my work'],
  scholarships: ['scholarship', 'bursary', 'study', 'degree', 'funding'],
  hackathons: ['hackathon', 'build', 'competition', 'network'],
};

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

const REMOTE_MARKERS = ['remote', 'global', 'worldwide', 'anywhere', 'distributed', 'work from home', 'wfh'];
const FLEXIBLE_MARKERS = ['hybrid', 'flexible', 'partially remote'];

/** African markets we index deliberately, per the sourcing strategy. */
export const AFRICAN_MARKERS = [
  'africa', 'african', 'nigeria', 'lagos', 'abuja', 'kenya', 'nairobi', 'ghana', 'accra',
  'south africa', 'johannesburg', 'cape town', 'rwanda', 'kigali', 'ethiopia', 'addis ababa',
  'egypt', 'cairo', 'morocco', 'casablanca', 'senegal', 'dakar', 'uganda', 'kampala',
  'tanzania', 'dar es salaam', 'cameroon', 'douala', 'zambia', 'lusaka', 'zimbabwe',
  'harare', 'botswana', 'namibia', 'mozambique', 'angola', 'ghana', 'ivory coast',
  'abidjan', 'libya', 'tunisia', 'algiers', 'sudan', 'mauritius',
];

function norm(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

export function scoreLocation(oppLocation: string | null | undefined, subject: MatchSubject): number {
  const loc = norm(oppLocation);
  const max = SCORE_WEIGHTS.location;

  if (!loc) return 0;

  // Fully remote is universally accessible — the single strongest signal in an
  // African-first, globally-remote product.
  if (REMOTE_MARKERS.some((k) => loc.includes(k))) return max;

  // Explicitly user-preferred location.
  const prefs = (subject.preferredLocations ?? []).map(norm).filter(Boolean);
  if (prefs.some((p) => loc.includes(p) || p.includes(loc))) return max - 1;

  // Same-country match.
  const country = norm(subject.country);
  if (country && country !== 'xx' && loc.includes(country)) return 18;

  // Regional match: user is in an African market and the role is Africa-wide,
  // or the listing names any African city we index.
  const isAfricanUser = AFRICAN_MARKERS.some((k) => country.includes(k));
  if (isAfricanUser && (loc.includes('africa') || AFRICAN_MARKERS.some((k) => loc.includes(k)))) {
    return 14;
  }
  if (loc.includes('africa') || loc.includes('emea') || loc.includes('global south')) return 10;

  if (FLEXIBLE_MARKERS.some((k) => loc.includes(k))) return 12;

  return 0;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function scoreGoals(oppType: unknown, subject: MatchSubject): number {
  const max = SCORE_WEIGHTS.goals;
  const type = normalizeOpportunityType(oppType);

  const goals = (subject.goals ?? []).map(norm).filter(Boolean);
  const preferredTypes = (subject.preferredTypes ?? []).map((t) => normalizeOpportunityType(t));

  // An explicit type preference is a stronger signal than free-text goals.
  if (preferredTypes.includes(type)) return max;
  if (goals.length === 0) return Math.round(max * 0.5); // neutral, not punitive

  const aligned = TYPE_GOAL_MAP[type];
  const hit = aligned.some((a) => goals.some((g) => g.includes(a) || a.includes(g)));
  return hit ? max : 3;
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

const SENIORITY = [
  { years: 6, re: /\b(principal|staff|distinguished|head of|vp|vice president|chief|cto|ceo|founder)\b/i, label: 'leadership' },
  { years: 4, re: /\b(senior|sr\.?|lead|director|manager|architect)\b/i, label: 'senior' },
  { years: 0, re: /\b(junior|jr\.?|entry[- ]level|graduate|grad|fresh|trainee|apprentice|intern)\b/i, label: 'entry' },
];

function requiredSeniority(title: string | null): { years: number; label: string } | null {
  const t = norm(title);
  if (!t) return null;
  for (const band of SENIORITY) {
    if (band.re.test(t)) return { years: band.years, label: band.label };
  }
  return null;
}

/**
 * Experience fit.
 *
 * The previous implementation ignored the user's experience entirely and
 * returned a title-only heuristic, with a comment admitting "No user experience
 * field yet". It now compares the seniority the role implies against the years
 * and title actually on the passport.
 */
export function scoreExperience(oppTitle: string | null, subject: MatchSubject): number {
  const max = SCORE_WEIGHTS.experience;
  const need = requiredSeniority(oppTitle);

  const years = typeof subject.yearsExperience === 'number' ? subject.yearsExperience : null;
  const hasLeadership = subject.currentRole ? requiredSeniority(subject.currentRole) : null;

  // No seniority signal in the title — stay out of the way.
  if (!need) return Math.round(max * 0.8);

  if (years === null) {
    // No data: fall back to the old title-only behaviour rather than guessing.
    return need.label === 'entry' ? max : need.label === 'leadership' ? Math.round(max * 0.5) : Math.round(max * 0.8);
  }

  // Over-qualified is penalised less than under-qualified: being senior for an
  // entry role is a weaker mismatch than being junior for a senior one.
  if (years >= need.years) {
    const overreach = years - need.years;
    return overreach > 6 ? Math.round(max * 0.7) : max;
  }

  const shortfall = need.years - years;
  if (hasLeadership?.label === 'leadership' && shortfall <= 1) return Math.round(max * 0.85);

  return shortfall <= 1 ? Math.round(max * 0.6) : Math.round(max * 0.3);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** `skills_required` is jsonb and may hold strings or rich skill objects. */
export function extractRequiredSkills(raw: unknown): ResolvedSkill[] {
  if (!Array.isArray(raw)) return [];
  const flat = raw
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const canonical = obj.canonical ?? obj.name ?? obj.skill;
        return typeof canonical === 'string' ? canonical : '';
      }
      return '';
    })
    .filter(Boolean);
  return resolveSkills(flat);
}

export interface SkillMatchResult {
  /** 0–100 weighted coverage. */
  pct: number;
  matched: string[];
  gap: string[];
  byCategory: Partial<Record<'tech' | 'soft' | 'domain' | 'tool', CategoryBreakdown>>;
}

/**
 * Weighted skill coverage.
 *
 * Uses taxonomy weights and canonicalises BOTH sides. The old implementation
 * compared raw lowercase strings, so "reactjs" never matched "React" and every
 * weight defaulted to 1.0.
 */
export function scoreSkills(
  requiredSkills: ResolvedSkill[],
  subjectSkills: ResolvedSkill[]
): SkillMatchResult {
  const empty: SkillMatchResult = { pct: 0, matched: [], gap: [], byCategory: {} };
  if (requiredSkills.length === 0) return empty;

  const owned = new Set(subjectSkills.map((s) => s.canonical.toLowerCase()));

  const matched: string[] = [];
  const gap: string[] = [];
  const buckets = new Map<
    string,
    { matchedWeight: number; totalWeight: number; matched: number; required: number }
  >();

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const skill of requiredSkills) {
    const key = skill.canonical.toLowerCase();
    totalWeight += skill.weight;

    const bucket = buckets.get(skill.category) ?? { matchedWeight: 0, totalWeight: 0, matched: 0, required: 0 };
    bucket.required += 1;
    bucket.totalWeight += skill.weight;

    if (owned.has(key)) {
      matched.push(skill.canonical);
      matchedWeight += skill.weight;
      bucket.matched += 1;
      bucket.matchedWeight += skill.weight;
    } else {
      gap.push(skill.canonical);
    }

    buckets.set(skill.category, bucket);
  }

  const byCategory: SkillMatchResult['byCategory'] = {};
  for (const [category, b] of buckets) {
    byCategory[category as 'tech' | 'soft' | 'domain' | 'tool'] = {
      matched: b.matched,
      required: b.required,
      pct: b.totalWeight > 0 ? Math.round((b.matchedWeight / b.totalWeight) * 100) : 0,
    };
  }

  return {
    pct: totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0,
    matched,
    gap,
    byCategory,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return n === 1 ? singular : plural;
}

export function calculateMatch(target: MatchTarget, subject: MatchSubject): MatchResult {
  const required = extractRequiredSkills(target.skills_required);
  const owned = resolveSkills(subject.skills ?? []);

  const skillMatch = scoreSkills(required, owned);
  const skillsComponent = Math.round((skillMatch.pct / 100) * SCORE_WEIGHTS.skills);
  const locationComponent = scoreLocation(target.location ?? null, subject);
  const goalsComponent = scoreGoals(target.opportunity_type ?? null, subject);
  const experienceComponent = scoreExperience(target.title ?? null, subject);

  const rawTotal = skillsComponent + locationComponent + goalsComponent + experienceComponent;
  const score = Math.min(100, Math.max(0, rawTotal));

  const type = normalizeOpportunityType(target.opportunity_type ?? null);
  const typeLabel = OPPORTUNITY_TYPE_LABELS[type];

  // --- Explanations -------------------------------------------------------
  const reasons: string[] = [];
  reasons.push(
    skillMatch.matched.length > 0
      ? `You have ${skillMatch.matched.length} of ${required.length} required ${pluralize(required.length, 'skill')} (${skillMatch.matched.slice(0, 3).join(', ')}).`
      : required.length > 0
        ? `None of the ${required.length} required skills are on your passport yet.`
        : 'No specific skills listed — open to anyone.'
  );

  if (locationComponent === SCORE_WEIGHTS.location) {
    reasons.push('Fully remote, so location is not a barrier.');
  } else if (locationComponent >= 18) {
    reasons.push(`Based in ${target.location}, matching your country.`);
  } else if (locationComponent >= 14) {
    reasons.push(`Regional role (${target.location}) — open across African markets.`);
  } else if (locationComponent >= 12) {
    reasons.push(`Hybrid arrangement in ${target.location}.`);
  } else if (target.location) {
    reasons.push(`Located in ${target.location} — relocation or remote negotiation needed.`);
  }

  if (goalsComponent === SCORE_WEIGHTS.goals) {
    reasons.push(`A ${typeLabel.toLowerCase()}, which is one of your stated goals.`);
  }

  if (skillMatch.gap.length > 0 && skillMatch.gap.length <= 3) {
    reasons.push(`Learning ${skillMatch.gap.join(', ')} would push this above 80%.`);
  } else if (skillMatch.gap.length > 3) {
    reasons.push(`${skillMatch.gap.length} skills to build — start with ${skillMatch.gap.slice(0, 2).join(' and ')}.`);
  }

  let explanation: string;
  if (required.length === 0) {
    explanation = 'Open application — no specific skills listed, so your fit depends mostly on location and goals.';
  } else if (score >= 80) {
    explanation = `Excellent fit. You cover ${skillMatch.matched.length} of ${required.length} skills and the ${typeLabel.toLowerCase()} aligns with your goals.`;
  } else if (score >= 60) {
    explanation = `Strong match. ${skillMatch.matched.length} of ${required.length} skills align${skillMatch.gap.length ? `, and closing the gap on ${skillMatch.gap.slice(0, 2).join(' and ')} would push you higher` : ''}.`;
  } else if (score >= 40) {
    explanation = `Growing match. ${skillMatch.matched.length} ${pluralize(skillMatch.matched.length, 'skill')} align; ${skillMatch.gap.length} to develop for a stronger fit.`;
  } else {
    explanation = `Early-stage match. Building ${skillMatch.gap.slice(0, 3).join(', ') || 'a few core skills'} would meaningfully improve your fit.`;
  }

  return {
    score,
    matched: skillMatch.matched,
    gap: skillMatch.gap,
    breakdown: {
      skills: skillsComponent,
      location: locationComponent,
      goals: goalsComponent,
      experience: experienceComponent,
    },
    byCategory: skillMatch.byCategory,
    explanation,
    reasons,
  };
}

/** Back-compat helper retained for the alert digest and navigator. */
export function calculateWeightedMatch(
  requiredSkills: string[],
  userSkills: string[],
  weights?: Record<string, number>
): { score: number; matched: string[]; gap: string[] } {
  const required = resolveSkills(requiredSkills);
  const owned = resolveSkills(userSkills);

  // Honour caller-supplied weights when present, otherwise taxonomy weights.
  const weighted = weights
    ? required.map((s) => ({
        ...s,
        weight: weights[s.canonical] ?? weights[s.canonical.toLowerCase()] ?? s.weight,
      }))
    : required;

  const result = scoreSkills(weighted, owned);
  return { score: result.pct, matched: result.matched, gap: result.gap };
}
