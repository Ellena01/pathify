/**
 * Skill taxonomy lookup helpers.
 *
 * Wraps the generated taxonomy with normalisation so that a user's self-typed
 * skills ("reactjs", "Postgres", "k8s") resolve to the same canonical identity
 * the actor assigns when it scrapes a job. Without this, a user who typed
 * "reactjs" scored 0 against a job requiring "React".
 */

import { ALIAS_TO_CANONICAL, SKILLS, SKILL_COUNT, type SkillCategory, type TaxonomySkill } from './taxonomy.generated';

export type { SkillCategory, TaxonomySkill };
export { SKILLS, SKILL_COUNT, SKILL_COUNT_BY_CATEGORY } from './taxonomy.generated';

const SKILL_BY_CANONICAL: ReadonlyMap<string, TaxonomySkill> = new Map(
  SKILLS.map((s) => [s.canonical.toLowerCase(), s])
);

/** Punctuation that should not affect skill identity. */
const NOISE = /[^a-z0-9+#./]+/g;

/**
 * Resolve any spelling of a skill to its canonical name.
 * Returns `null` when the skill is not in the taxonomy.
 */
export function normalizeSkill(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  if (!raw || raw.length > 60) return null;

  const direct = ALIAS_TO_CANONICAL[raw];
  if (direct) return direct;

  // Canonical match (covers the case where the alias map omits a canonical).
  const canonical = SKILL_BY_CANONICAL.get(raw);
  if (canonical) return canonical.canonical;

  // Punctuation-insensitive retry: "React.JS" -> "react.js", "C++" -> "c++".
  const stripped = raw.replace(NOISE, '');
  if (stripped) {
    const retry = ALIAS_TO_CANONICAL[stripped] ?? SKILL_BY_CANONICAL.get(stripped)?.canonical;
    if (retry) return retry;
  }

  return null;
}

export interface ResolvedSkill {
  /** The name to display and store. */
  canonical: string;
  /** Normalisation weight in the 0.6–1.0 band from the taxonomy. */
  weight: number;
  category: SkillCategory;
  /** True when the input was not already canonical. */
  wasAlias: boolean;
}

/**
 * Normalise a list of skills, dropping unknowns and de-duplicating by
 * canonical identity. Order of first appearance is preserved.
 */
export function resolveSkills(inputs: readonly unknown[] | null | undefined): ResolvedSkill[] {
  if (!Array.isArray(inputs)) return [];
  const seen = new Set<string>();
  const out: ResolvedSkill[] = [];

  for (const input of inputs) {
    const canonical = normalizeSkill(input);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = SKILL_BY_CANONICAL.get(key);
    out.push({
      canonical,
      weight: entry?.weight ?? 0.8,
      category: entry?.category ?? 'tech',
      wasAlias: typeof input === 'string' && input.trim() !== canonical,
    });
  }

  return out;
}

/** Convenience: canonical names only, de-duplicated. */
export function canonicalizeSkillList(inputs: readonly unknown[] | null | undefined): string[] {
  return resolveSkills(inputs).map((s) => s.canonical);
}

export function skillWeight(canonical: string): number {
  return SKILL_BY_CANONICAL.get(canonical.toLowerCase())?.weight ?? 0.8;
}

export function skillCategory(canonical: string): SkillCategory {
  return SKILL_BY_CANONICAL.get(canonical.toLowerCase())?.category ?? 'tech';
}

/** All canonical skills in a category, alphabetically. */
export function skillsInCategory(category: SkillCategory): string[] {
  return SKILLS.filter((s) => s.category === category).map((s) => s.canonical);
}

/** Fuzzy lookup for the onboarding / settings skill picker. */
export function searchSkills(query: string, limit = 12): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return SKILLS.slice(0, limit).map((s) => s.canonical);

  const starts: string[] = [];
  const contains: string[] = [];

  for (const skill of SKILLS) {
    const canonical = skill.canonical.toLowerCase();
    if (canonical.startsWith(q)) starts.push(skill.canonical);
    else if (canonical.includes(q) || skill.aliases.some((a) => a.includes(q))) {
      contains.push(skill.canonical);
    }
  }

  return [...starts, ...contains].slice(0, limit);
}
