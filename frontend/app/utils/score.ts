/**
 * Back-compat shim.
 *
 * The scoring logic now lives in `lib/matching.ts`, which is the single source
 * of truth (it previously existed in three divergent copies: the Python actor,
 * this file, and a fallback inside the navigator route).
 *
 * Existing imports keep working. New code should import from `@/lib/matching`
 * directly.
 */

import { calculateMatch as _calculateMatch, calculateWeightedMatch as _weighted, type MatchResult } from '@/lib/matching';

export type { MatchResult, MatchBreakdown, CategoryBreakdown } from '@/lib/matching';
export {
  calculateMatch,
  calculateWeightedMatch,
  scoreLocation,
  scoreGoals,
  scoreExperience,
  scoreSkills,
  extractRequiredSkills,
  normalizeOpportunityType,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABELS,
  SCORE_WEIGHTS,
  type OpportunityType,
  type MatchSubject,
  type MatchTarget,
} from '@/lib/matching';

/** Legacy signature: positional args instead of a subject object. */
export function calculateFullMatch(
  opp: Record<string, unknown>,
  userSkills: string[],
  userCountry?: string,
  userGoals?: string[]
): MatchResult {
  return _calculateMatch(opp as Parameters<typeof _calculateMatch>[0], {
    skills: userSkills,
    country: userCountry ?? null,
    goals: userGoals ?? null,
  });
}

export function legacyScore(required: string[], userSkills: string[]): number {
  return _weighted(required, userSkills).score;
}

/**
 * Canonical opportunity key.
 * Single source of truth for keying an opportunity across the tracker,
 * navigator and detail views.
 */
export function getOpportunityKey(opp: unknown): string {
  if (!opp) return '';
  if (typeof opp === 'string') return opp;
  const record = opp as Record<string, unknown>;
  const rawKey = record.application_url ?? record.job_url ?? record.id ?? record.title;
  return String(rawKey ?? '').trim();
}
