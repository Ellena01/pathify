/**
 * Candidate retrieval for the matching run — the broadening ladder.
 *
 * ## Why this exists
 *
 * `POST /api/match` used to run exactly one query:
 *
 *     skills_required @> [subject.skills[0]]
 *
 * Two failures fell straight out of that. A profile with no skills could not
 * match at all (the route answered 422 and the dashboard stayed empty), and a
 * profile whose first skill happened to be rare returned nothing while the
 * catalog was full of near-misses. In both cases the user saw zero results
 * with no way to tell "no fit" from "bad query".
 *
 * The ladder answers the second question with four widening passes, cheapest
 * signal first:
 *
 *   1. skill     — the user's own skills, one query each
 *   2. category  — taxonomy siblings of those skills (React -> Vue.js, Node.js)
 *   3. location  — remote, preferred locations, country, region
 *   4. recent    — the active catalog itself, newest first
 *
 * Execution stops as soon as enough distinct candidates are in hand, so the
 * common case still costs one or two queries. Everything here is pure: the
 * ladder is planned from the subject alone, and the selection rules are
 * applied to an in-memory array. That is what makes the "never empty" guarantee
 * testable without a database — see `tests/match-candidates.test.ts`.
 */

import { type MatchSubject } from './matching';
import { resolveSkills, skillCategory, skillsInCategory, SKILL_COUNT_BY_CATEGORY } from './taxonomy';

export type LadderTier = 'skill' | 'category' | 'location' | 'recent';

export type LadderFilter =
  | { kind: 'skill'; skill: string }
  | { kind: 'location'; term: string }
  | { kind: 'recent' };

export interface LadderStep {
  tier: LadderTier;
  label: string;
  filter: LadderFilter;
}

/** Distinct candidates to collect before the ladder stops widening. */
export const CANDIDATE_TARGET = 120;

/**
 * How few results triggers the next rung. Deliberately small: three is the
 * threshold below which a feed reads as broken rather than "thin".
 */
export const MIN_RESULTS_BEFORE_BROADENING = 3;

/** Per-query row cap. Bounded so one rung cannot pull the whole catalog. */
export const STEP_ROW_LIMIT = 150;

/** How many of the user's own skills to query individually. */
const MAX_SKILL_STEPS = 5;
/** How many taxonomy siblings to pull per rung. */
const MAX_CATEGORY_STEPS = 6;
/** How many location terms to try. */
const MAX_LOCATION_STEPS = 4;

const LOCATION_FALLBACK_TERMS = ['remote', 'global', 'africa'];

/**
 * Plan the full ladder for a subject. Pure — the same subject always produces
 * the same plan, and no step depends on what an earlier step returned.
 *
 * An empty subject (no skills) is a valid input: it simply skips the first two
 * rungs and starts from geography, which is the honest answer for a profile
 * that has not stated what it can do yet.
 */
export function planCandidateLadder(subject: MatchSubject): LadderStep[] {
  const steps: LadderStep[] = [];

  const skills = resolveSkills(subject.skills ?? []);
  const seen = new Set<string>();

  // --- Rung 1: exact skills -----------------------------------------------
  for (const skill of skills.slice(0, MAX_SKILL_STEPS)) {
    const key = skill.canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({
      tier: 'skill',
      label: `roles asking for ${skill.canonical}`,
      filter: { kind: 'skill', skill: skill.canonical },
    });
  }

  // --- Rung 2: taxonomy siblings ------------------------------------------
  // Group the subject's skills by category, then ask for canonical peers in
  // those categories. A frontend developer with one rare skill still reaches
  // the frontend corpus.
  const categories = [...new Set(skills.map((s) => skillCategory(s.canonical)))].filter(
    (category) => (SKILL_COUNT_BY_CATEGORY[category] ?? 0) > 1
  );

  for (const category of categories) {
    const owned = new Set(skills.map((s) => s.canonical.toLowerCase()));
    const siblings = skillsInCategory(category).filter((name) => !owned.has(name.toLowerCase()));
    for (const sibling of siblings.slice(0, MAX_CATEGORY_STEPS)) {
      if (seen.has(sibling.toLowerCase())) continue;
      seen.add(sibling.toLowerCase());
      steps.push({
        tier: 'category',
        label: `${category} roles such as ${sibling}`,
        filter: { kind: 'skill', skill: sibling },
      });
    }
  }

  // --- Rung 3: geography ---------------------------------------------------
  const locations = [
    ...(subject.preferredLocations ?? []),
    subject.country ?? '',
    ...LOCATION_FALLBACK_TERMS,
  ]
    .map((term) => (typeof term === 'string' ? term.trim() : ''))
    .filter(Boolean);

  const seenLocations = new Set<string>();
  for (const term of locations) {
    const key = term.toLowerCase();
    if (seenLocations.has(key)) continue;
    seenLocations.add(key);
    steps.push({ tier: 'location', label: `anything near ${term}`, filter: { kind: 'location', term } });
    if (seenLocations.size >= MAX_LOCATION_STEPS) break;
  }

  // --- Rung 4: the catalog itself -----------------------------------------
  steps.push({ tier: 'recent', label: 'the newest open listings', filter: { kind: 'recent' } });

  return steps;
}

/** Tiers in widening order, for "why am I seeing this?" reporting. */
export const LADDER_TIER_ORDER: readonly LadderTier[] = ['skill', 'category', 'location', 'recent'];

/**
 * Group a plan into its rungs, preserving ladder order.
 *
 * Execution is rung-by-rung with the queries of a rung issued in parallel, and
 * stops as soon as `target` distinct candidates exist. Running whole rungs (and
 * never individual steps of a rung) keeps the result set independent of
 * network timing — otherwise two users with the same profile could see
 * different feeds because one query returned first.
 */
export function groupStepsByTier(steps: readonly LadderStep[]): Array<{ tier: LadderTier; steps: LadderStep[] }> {
  const groups: Array<{ tier: LadderTier; steps: LadderStep[] }> = [];
  for (const tier of LADDER_TIER_ORDER) {
    const tierSteps = steps.filter((step) => step.tier === tier);
    if (tierSteps.length > 0) groups.push({ tier, steps: tierSteps });
  }
  return groups;
}

/** True once the ladder has collected enough to stop widening. */
export function reachedTarget(collected: number, target: number = CANDIDATE_TARGET): boolean {
  return collected >= target;
}

/**
 * Normalise a location term before it reaches a `ilike` filter.
 *
 * The term comes from the profile (`country`, `metadata.preferences.locations`),
 * i.e. from a form the user typed into. `*` is a PostgREST wildcard and the
 * pattern is interpolated into a query string, so the term is reduced to
 * characters that can only mean what they look like.
 */
export function sanitizeLocationTerm(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[^a-zA-Z0-9\s,'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export interface ScoredCandidate<T> {
  row: T;
  score: number;
}

export interface SelectOptions {
  /** Below this, a match is noise. */
  minScore: number;
  /** Hard cap on what is persisted. */
  limit: number;
  /**
   * Never return fewer than this many rows when the catalog has them. The
   * score is not inflated to reach the floor — the real score travels with the
   * row so the UI can say "stretch, and here is why".
   */
  floor: number;
}

/**
 * Apply the persistence rules to scored candidates.
 *
 * Order matters: filter first, and only fall back to the unfiltered ranking
 * when filtering would leave the user with an empty feed. The fallback is
 * always the *best* rows available, never an arbitrary slice.
 */
export function selectMatches<T>(
  scored: readonly ScoredCandidate<T>[],
  keyOf: (row: T) => string,
  options: SelectOptions
): ScoredCandidate<T>[] {
  const { minScore, limit, floor } = options;

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const above = sorted.filter((entry) => entry.score >= minScore);

  const base = above.length >= floor ? above : sorted;
  const chosen: ScoredCandidate<T>[] = [];
  const seen = new Set<string>();

  for (const entry of base) {
    const key = keyOf(entry.row);
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(entry);
    if (chosen.length >= limit) break;
  }

  return chosen;
}

/**
 * Human-readable trace of what the ladder did, for the response payload and
 * for tests that assert the ordering contract.
 */
export function describeLadder(steps: readonly LadderStep[]): string[] {
  return steps.map((step) => `${step.tier}: ${step.label}`);
}
