import type { MatchSubject } from './matching';
import { canonicalizeSkillList } from './taxonomy';

/**
 * Build a `MatchSubject` from a `user_profiles` row.
 *
 * ## Why this is shared
 *
 * Three places need "the subject for this user": `POST /api/match` (which
 * persists the result), `POST /api/navigator` (which ranks on the fly) and the
 * opportunity detail route. Each had its own copy of the extraction, and
 * `/api/alerts/preview` had a fourth that omitted `yearsExperience` and the
 * preferences entirely — so the same listing could score differently depending
 * on which surface asked.
 *
 * The subject is not a convenience. It is the thing that decides a user's fit,
 * so its inputs have exactly one definition. If you add a factor to the engine,
 * add it here once.
 */

export interface ProfileRow {
  name?: string | null;
  country: string | null;
  role: string | null;
  skills: string[] | null;
  goals: string[] | null;
  metadata: Record<string, unknown> | null;
}

/** A subject whose skills are guaranteed present, after canonicalisation. */
export type ResolvedSubject = MatchSubject & { skills: string[] };

/**
 * Years of experience = the longest single stint, not the sum.
 *
 * Overlapping roles are common (a contract and a full-time job at once), and
 * summing them double-counts the shared period — which inflated the experience
 * factor and made a strong match look over-qualified.
 */
export function yearsFromMetadata(metadata: Record<string, unknown> | null): number | null {
  const experience = metadata?.experience;
  if (!Array.isArray(experience) || experience.length === 0) return null;

  const now = Date.now();
  const durations: number[] = [];

  for (const entry of experience) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const start = typeof item.startDate === 'string' ? Date.parse(item.startDate) : NaN;
    const current = item.current === true;
    const end = current ? now : typeof item.endDate === 'string' ? Date.parse(item.endDate) : NaN;

    if (!Number.isFinite(start)) continue;
    const stop = Number.isFinite(end) ? end : now;
    if (stop <= start) continue;
    durations.push((stop - start) / (1000 * 60 * 60 * 24 * 365));
  }

  if (durations.length === 0) return null;
  return Math.round(Math.max(...durations) * 10) / 10;
}

/**
 * Self-declared seniority band -> years, used when the profile has no
 * `experience[]` history.
 *
 * Onboarding asks for a band rather than inventing a work history, and the
 * experience factor needs a number to compare against a title's implied
 * seniority. The mapping is intentionally coarse: it only has to land on the
 * right side of the 0 / 4 / 6-year thresholds the engine uses.
 */
const EXPERIENCE_LEVEL_YEARS: Record<string, number> = {
  student: 0,
  entry: 1,
  junior: 1,
  mid: 4,
  senior: 8,
  expert: 12,
  lead: 12,
};

export function yearsFromLevel(level: unknown): number | null {
  if (typeof level !== 'string') return null;
  const key = level.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXPERIENCE_LEVEL_YEARS, key)
    ? EXPERIENCE_LEVEL_YEARS[key]
    : null;
}

/**
 * Extract the preference arrays from `metadata.preferences`.
 * Returns null (not `[]`) for absent preferences, because the engine treats
 * "no preference stated" differently from "prefers nothing".
 */
function preferencesFrom(metadata: Record<string, unknown> | null) {
  const preferences = (metadata?.preferences ?? {}) as Record<string, unknown>;
  return {
    locations: Array.isArray(preferences.locations) ? (preferences.locations as string[]) : null,
    opportunityTypes: Array.isArray(preferences.opportunityTypes)
      ? (preferences.opportunityTypes as string[])
      : null,
  };
}

export function buildSubject(profile: ProfileRow): ResolvedSubject {
  const metadata = profile.metadata ?? {};
  const preferences = preferencesFrom(metadata);

  return {
    skills: canonicalizeSkillList(profile.skills ?? []),
    country: profile.country,
    goals: profile.goals ?? [],
    // Real history wins; the onboarding band is the fallback for profiles that
    // have not filled in a work history yet (i.e. most of them).
    yearsExperience: yearsFromMetadata(metadata) ?? yearsFromLevel(metadata.experience_level),
    currentRole: profile.role,
    preferredLocations: preferences.locations,
    preferredTypes: preferences.opportunityTypes,
  };
}

/** Can this subject produce a meaningful score at all? */
export function hasMatchableProfile(subject: MatchSubject): boolean {
  return Array.isArray(subject.skills) && subject.skills.length > 0;
}
