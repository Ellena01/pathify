/**
 * Broadening-ladder regression tests.
 *
 * Run with:  npm test
 *
 * The ladder is the fix for the dashboard's original failure mode: a profile
 * whose first skill was rare produced zero matches while the catalog was full
 * of near-misses. Everything under test here is pure — plan, group, select —
 * so the "never empty" guarantee can be pinned without a database.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CANDIDATE_TARGET,
  LADDER_TIER_ORDER,
  MIN_RESULTS_BEFORE_BROADENING,
  STEP_ROW_LIMIT,
  describeLadder,
  groupStepsByTier,
  planCandidateLadder,
  reachedTarget,
  sanitizeLocationTerm,
  selectMatches,
  type LadderStep,
} from '../lib/match-candidates';
import type { MatchSubject } from '../lib/matching';

function plan(subject: MatchSubject) {
  return planCandidateLadder(subject);
}

function tiersOf(steps: readonly LadderStep[]) {
  return steps.map((step) => step.tier);
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

test('plan orders rungs skill -> category -> location -> recent', () => {
  const steps = plan({
    skills: ['React', 'TypeScript', 'Python'],
    country: 'Nigeria',
    preferredLocations: ['Ghana'],
  });

  const ranks = tiersOf(steps).map((tier) => LADDER_TIER_ORDER.indexOf(tier));
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i] >= ranks[i - 1], `tier order broken at ${tiersOf(steps).join(',')}`);
  }
  assert.equal(steps.at(-1)?.tier, 'recent');
});

test('plan caps exact-skill queries at five and de-duplicates aliases', () => {
  const steps = plan({
    skills: ['React', 'reactjs', 'REACT', 'TypeScript', 'Python', 'Go', 'Rust', 'AWS'],
  });
  const skillSteps = steps.filter((step) => step.tier === 'skill');

  assert.ok(skillSteps.length <= 5, `expected <=5 skill steps, got ${skillSteps.length}`);
  const skills = skillSteps.map((step) => (step.filter.kind === 'skill' ? step.filter.skill : ''));
  assert.equal(new Set(skills).size, skills.length, 'skill rung must not repeat a skill');
  assert.ok(skills.includes('React'), 'alias rows must collapse onto the canonical skill');
});

test('an empty profile still plans a usable ladder', () => {
  const steps = plan({ skills: [], country: null, preferredLocations: [] });

  assert.equal(steps.some((step) => step.tier === 'skill'), false);
  assert.equal(steps.some((step) => step.tier === 'category'), false);
  // Geography plus the catalog itself are the honest answer for a profile that
  // has not stated what it can do — and they are what keeps the feed non-empty.
  assert.ok(steps.some((step) => step.tier === 'location'));
  assert.equal(steps.at(-1)?.tier, 'recent');
  assert.ok(steps.length >= 4, `expected fallback rungs, got ${steps.length}`);
});

test('location rung deduplicates terms and never exceeds four', () => {
  const steps = plan({
    skills: ['Go'],
    country: 'remote',
    preferredLocations: ['remote', 'Ghana', 'Kenya', 'Egypt', 'Morocco', 'Senegal'],
  });

  const terms = steps
    .filter((step) => step.tier === 'location' && step.filter.kind === 'location')
    .map((step) => (step.filter.kind === 'location' ? step.filter.term.toLowerCase() : ''));

  assert.ok(terms.length <= 4, `expected <=4 location steps, got ${terms.length}`);
  assert.equal(new Set(terms).size, terms.length, 'location terms must be unique');
});

test('the same subject always produces the same plan', () => {
  const subject: MatchSubject = {
    skills: ['TypeScript', 'Product Management'],
    country: 'Kenya',
    preferredLocations: ['Remote'],
  };
  assert.deepEqual(plan(subject), plan(subject));
});

// ---------------------------------------------------------------------------
// Grouping and reporting
// ---------------------------------------------------------------------------

test('groupStepsByTier keeps ladder order and drops empty tiers', () => {
  const steps = plan({ skills: ['Go'], country: 'Ghana' });
  const groups = groupStepsByTier(steps);

  const seen = groups.map((group) => group.tier);
  assert.deepEqual(
    seen,
    [...seen].sort((a, b) => LADDER_TIER_ORDER.indexOf(a) - LADDER_TIER_ORDER.indexOf(b))
  );
  assert.deepEqual(groups.flatMap((group) => group.steps), steps, 'grouping must not reorder');
  assert.equal(new Set(seen).size, seen.length, 'each tier appears at most once');
});

test('describeLadder reports a tier-qualified trace ending at the catalog', () => {
  const trace = describeLadder(plan({ skills: ['React'], country: 'Nigeria' }));
  assert.ok(trace.length > 0);
  for (const line of trace) assert.match(line, /^(skill|category|location|recent): /);
  assert.ok(trace.at(-1)?.startsWith('recent: '));
});

test('reachedTarget is inclusive at the boundary', () => {
  assert.equal(reachedTarget(CANDIDATE_TARGET - 1, CANDIDATE_TARGET), false);
  assert.equal(reachedTarget(CANDIDATE_TARGET, CANDIDATE_TARGET), true);
  assert.equal(reachedTarget(CANDIDATE_TARGET + 1, CANDIDATE_TARGET), true);
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

const OPTIONS = { minScore: 40, limit: 10, floor: MIN_RESULTS_BEFORE_BROADENING };

function rows(entries: Array<[string, number]>) {
  return entries.map(([id, score]) => ({ row: { id }, score }));
}

test('selectMatches keeps only scores at or above the floor threshold', () => {
  // Four rows clear minScore, which is already >= floor, so the filter stands
  // and the sub-threshold row is dropped rather than pulled in as filler.
  const chosen = selectMatches(
    rows([
      ['a', 92],
      ['b', 88],
      ['c', 70],
      ['d', 55],
      ['e', 39],
    ]),
    (entry) => entry.id,
    OPTIONS
  );

  assert.deepEqual(chosen.map((entry) => entry.row.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(chosen.map((entry) => entry.score), [92, 88, 70, 55]);
});

test('selectMatches falls back to the full ranking when filtering would starve the feed', () => {
  const chosen = selectMatches(
    rows([
      ['a', 38],
      ['b', 22],
      ['c', 7],
    ]),
    (entry) => entry.id,
    OPTIONS
  );

  assert.ok(chosen.length >= MIN_RESULTS_BEFORE_BROADENING, 'the floor must be honoured');
  assert.deepEqual(chosen.map((entry) => entry.row.id), ['a', 'b', 'c']);
  assert.equal(chosen[0].score, 38, 'the real score is preserved, never inflated to clear the floor');
});

test('selectMatches still returns a feed when every score is below the threshold', () => {
  const chosen = selectMatches(
    rows([
      ['a', 5],
      ['b', 1],
    ]),
    (entry) => entry.id,
    OPTIONS
  );
  assert.equal(chosen.length, 2, 'a weak catalog produces a feed rather than nothing');
});

test('selectMatches de-duplicates by key, keeping the higher score', () => {
  const chosen = selectMatches(
    rows([
      ['same', 70],
      ['other', 60],
      ['same', 65],
    ]),
    (entry) => entry.id,
    OPTIONS
  );

  assert.deepEqual(chosen.map((entry) => entry.row.id), ['same', 'other']);
  assert.equal(chosen[0].score, 70, 'the first (highest) occurrence wins');
});

test('selectMatches respects the persistence limit', () => {
  const scored = rows(Array.from({ length: 30 }, (_, i): [string, number] => [`row-${i}`, 100 - i]));
  const chosen = selectMatches(scored, (entry) => entry.id, { ...OPTIONS, limit: 7 });

  assert.equal(chosen.length, 7);
  assert.equal(chosen[0].row.id, 'row-0');
  assert.equal(chosen[6].row.id, 'row-6');
});

test('selectMatches never mutates the caller array', () => {
  const scored = rows([
    ['a', 10],
    ['b', 90],
    ['c', 50],
  ]);
  const before = scored.map((entry) => entry.row.id);

  selectMatches(scored, (entry) => entry.id, OPTIONS);

  assert.deepEqual(scored.map((entry) => entry.row.id), before, 'sort must run on a copy');
});

test('selectMatches on an empty catalog returns an empty list, not an error', () => {
  assert.deepEqual(selectMatches([], (entry: { id: string }) => entry.id, OPTIONS), []);
});

// ---------------------------------------------------------------------------
// Location sanitisation
// ---------------------------------------------------------------------------

test('sanitizeLocationTerm strips PostgREST wildcards and separators', () => {
  // Commas are legal in a location ("Lagos, Nigeria") and are escaped upstream
  // by escapePostgrestFilterTerm, so they survive here on purpose.
  assert.equal(sanitizeLocationTerm('La*g%os'), 'La g os');
  assert.equal(sanitizeLocationTerm('Nigeria; drop'), 'Nigeria drop');
  assert.equal(sanitizeLocationTerm("Cote d'Ivoire"), "Cote d'Ivoire");
  assert.equal(sanitizeLocationTerm('South   Africa'), 'South Africa');
});

test('sanitizeLocationTerm normalises whitespace and length', () => {
  assert.equal(sanitizeLocationTerm('\t\n Lagos \r\n'), 'Lagos');
  assert.equal(sanitizeLocationTerm('a'.repeat(200)).length, 60);
});

test('sanitizeLocationTerm rejects non-strings without throwing', () => {
  for (const bad of [null, undefined, 42, {}, '   ', []]) {
    assert.equal(sanitizeLocationTerm(bad as unknown), '');
  }
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('ladder constants stay in a sane relationship', () => {
  assert.ok(STEP_ROW_LIMIT >= MIN_RESULTS_BEFORE_BROADENING);
  assert.ok(CANDIDATE_TARGET > MIN_RESULTS_BEFORE_BROADENING);
  assert.ok(MIN_RESULTS_BEFORE_BROADENING >= 3, 'three is the "reads as broken" threshold');
});

