/**
 * Generates `lib/taxonomy.generated.ts` from the canonical Python taxonomy.
 *
 * WHY THIS EXISTS
 * ---------------
 * The skill taxonomy lives in the Apify actor (`actor/src/skills/taxonomy.json`)
 * because that is where skills are extracted. The frontend previously kept
 * three *hand-maintained* copies of overlapping alias/goal maps, none of which
 * agreed with the actor. That produced three different match scores for the
 * same job depending on which code path rendered it.
 *
 * `actor/src/skills/taxonomy.json` is the single source of truth. This script
 * projects it into a typed TypeScript module so the frontend cannot drift.
 *
 *   npm run taxonomy          # regenerate
 *   npm run taxonomy:check    # fail if the committed file is stale (CI)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');
const REPO = resolve(FRONTEND, '..');
const SOURCE = resolve(REPO, 'actor/src/skills/taxonomy.json');
const TARGET = resolve(FRONTEND, 'lib/taxonomy.generated.ts');

const VALID_CATEGORIES = new Set(['tech', 'soft', 'domain', 'tool']);

/** @typedef {{canonical:string, aliases:string[], category:string, weight:number}} Entry */

function loadAndValidate() {
  const raw = JSON.parse(readFileSync(SOURCE, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`taxonomy.json must be a non-empty array (got ${typeof raw})`);
  }

  /** @type {Map<string, {canonical:string, category:string, weight:number, aliases:Set<string>, source:string}>} */
  const byCanonical = new Map();
  /** @type {Map<string, string[]>} */
  const collisions = new Map();

  for (const entry of raw) {
    if (!entry || typeof entry.canonical !== 'string' || !entry.canonical.trim()) {
      throw new Error(`invalid entry: ${JSON.stringify(entry)}`);
    }
    const canonical = entry.canonical.trim();
    const category = VALID_CATEGORIES.has(entry.category) ? entry.category : 'tech';
    const weight = Number.isFinite(entry.weight)
      ? Math.min(1, Math.max(0.1, Number(entry.weight)))
      : 0.8;

    if (byCanonical.has(canonical)) {
      throw new Error(`duplicate canonical "${canonical}" in taxonomy.json`);
    }

    const record = { canonical, category, weight, aliases: new Set(), source: 'alias' };
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    for (const rawAlias of aliases) {
      if (typeof rawAlias !== 'string' || !rawAlias.trim()) continue;
      const alias = rawAlias.trim().toLowerCase();
      if (alias === canonical.toLowerCase()) {
        record.source = 'self';
        continue;
      }
      const owner = byCanonical.get(canonical);
      // Detect cross-skill alias collisions rather than silently
      // last-write-wins. These are data bugs: `postgres` claiming both SQL
      // and PostgreSQL double-counted the skill and depressed every match.
      for (const [otherCanonical, other] of byCanonical) {
        if (other.aliases.has(alias) && otherCanonical !== canonical) {
          const list = collisions.get(alias) ?? [];
          if (!list.includes(otherCanonical)) list.push(otherCanonical);
          collisions.set(alias, list);
        }
      }
      record.aliases.add(alias);
    }

    byCanonical.set(canonical, record);
  }

  if (collisions.size > 0) {
    const detail = [...collisions.entries()]
      .map(([alias, owners]) => `  "${alias}" claimed by: ${owners.join(', ')}`)
      .join('\n');
    throw new Error(
      `Alias collisions in taxonomy.json — a skill alias must map to exactly one canonical:\n${detail}\n` +
        'Fix the source file; do not paper over it in the generator.'
    );
  }

  return { byCanonical, collisions };
}

function build() {
  const { byCanonical } = loadAndValidate();

  const skills = [...byCanonical.values()]
    .sort((a, b) => a.canonical.localeCompare(b.canonical))
    .map((s) => ({
      canonical: s.canonical,
      category: s.category,
      weight: s.weight,
      aliases: [...s.aliases].sort(),
    }));

  /** alias -> canonical */
  const aliasMap = {};
  for (const s of skills) {
    for (const alias of s.aliases) aliasMap[alias] = s.canonical;
  }

  const countByCategory = skills.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  return { skills, aliasMap, countByCategory };
}

function serialize({ skills, aliasMap, countByCategory }) {
  return `// AUTO-GENERATED — DO NOT EDIT BY HAND.
//
// Source:    actor/src/skills/taxonomy.json
// Generator: frontend/scripts/build-taxonomy.mjs
// Regenerate: npm run taxonomy
// Verify:     npm run taxonomy:check
//
// The Python actor and this module are projections of ONE taxonomy. Editing
// this file by hand will be reverted by the next \`npm run taxonomy\` and will
// silently desynchronise match scoring from what the actor extracts.

export type SkillCategory = 'tech' | 'soft' | 'domain' | 'tool';

export interface TaxonomySkill {
  readonly canonical: string;
  readonly category: SkillCategory;
  readonly weight: number;
  readonly aliases: readonly string[];
}

export const SKILLS: readonly TaxonomySkill[] = ${JSON.stringify(skills, null, 2)} as const;

/** Lowercased alias (and canonical) -> canonical skill name. */
export const ALIAS_TO_CANONICAL: Readonly<Record<string, string>> = ${JSON.stringify(aliasMap, null, 2)} as const;

export const SKILL_COUNT_BY_CATEGORY: Readonly<Record<SkillCategory, number>> = ${JSON.stringify(countByCategory, null, 2)} as const;

export const SKILL_COUNT = ${skills.length};
`;
}

const { skills, aliasMap } = build();
const output = serialize(build());

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(TARGET, 'utf8');
  } catch {
    console.error(`MISSING: ${TARGET}\nRun: npm run taxonomy`);
    process.exit(1);
  }
  if (current !== output) {
    console.error(
      'STALE: lib/taxonomy.generated.ts does not match actor/src/skills/taxonomy.json.\n' +
        'Run: npm run taxonomy'
    );
    process.exit(1);
  }
  console.log(`taxonomy OK — ${skills.length} skills, ${Object.keys(aliasMap).length} aliases`);
} else {
  writeFileSync(TARGET, output, 'utf8');
  const categories = Object.entries(
    skills.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
  console.log(`Wrote lib/taxonomy.generated.ts — ${skills.length} skills (${categories})`);
}
