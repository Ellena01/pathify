/**
 * Match engine regression tests.
 *
 * Run with:  npm test
 *
 * The match score is the product. It previously had no tests and three
 * divergent implementations, so a change to any one of them silently altered
 * what users saw. These tests pin the contract of the deterministic engine.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calculateMatch,
  calculateWeightedMatch,
  normalizeOpportunityType,
  scoreExperience,
  scoreGoals,
  scoreLocation,
  scoreSkills,
  extractRequiredSkills,
  SCORE_WEIGHTS,
} from '../lib/matching';
import { canonicalizeSkillList, normalizeSkill, resolveSkills } from '../lib/taxonomy';

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

test('normalizeSkill resolves aliases to canonical identity', () => {
  assert.equal(normalizeSkill('reactjs'), 'React');
  assert.equal(normalizeSkill('REACT'), 'React');
  assert.equal(normalizeSkill('k8s'), 'Kubernetes');
  assert.equal(normalizeSkill('golang'), 'Go');
  assert.equal(normalizeSkill('postgres'), 'PostgreSQL');
  assert.equal(normalizeSkill('ml'), 'Machine Learning');
  assert.equal(normalizeSkill('  Tailwind  '), 'Tailwind CSS');
});

test('normalizeSkill rejects junk without throwing', () => {
  assert.equal(normalizeSkill(''), null);
  assert.equal(normalizeSkill('   '), null);
  assert.equal(normalizeSkill('not-a-real-skill-xyz'), null);
  assert.equal(normalizeSkill(null), null);
  assert.equal(normalizeSkill(undefined), null);
  assert.equal(normalizeSkill(42), null);
  assert.equal(normalizeSkill({}), null);
  assert.equal(normalizeSkill('x'.repeat(500)), null);
});

test('alias map has no cross-skill collisions', () => {
  // Regression: `postgres` was claimed by both SQL and PostgreSQL, so a
  // Postgres role extracted BOTH skills, double-counting weight and
  // depressing every match score for no reason.
  assert.equal(normalizeSkill('postgres'), 'PostgreSQL');
  assert.notEqual(normalizeSkill('postgres'), 'SQL');
});

test('canonicalizeSkillList de-duplicates by canonical identity', () => {
  assert.deepEqual(
    canonicalizeSkillList(['reactjs', 'React', 'react', 'REACT.JS']),
    ['React']
  );
});

// ---------------------------------------------------------------------------
// Skill scoring
// ---------------------------------------------------------------------------

test('scoreSkills canonicalises both sides before comparing', () => {
  // The core bug: user typed "reactjs", job required "React" -> 0% match.
  const required = extractRequiredSkills(['React', 'TypeScript']);
  const owned = resolveSkills(['reactjs', 'ts']);
  const result = scoreSkills(required, owned);
  assert.equal(result.pct, 100);
  assert.deepEqual(result.matched.sort(), ['React', 'TypeScript']);
  assert.deepEqual(result.gap, []);
});

test('scoreSkills respects taxonomy weights, not a flat 1.0', () => {
  // Python weighs 1.0, HTML weighs 0.7. Covering only Python must score
  // higher than covering only HTML, which a flat-weight implementation
  // cannot express.
  const required = extractRequiredSkills(['Python', 'HTML']);
  const onlyPython = scoreSkills(required, resolveSkills(['Python']));
  const onlyHtml = scoreSkills(required, resolveSkills(['HTML']));
  assert.ok(onlyPython.pct > onlyHtml.pct, `${onlyPython.pct} should exceed ${onlyHtml.pct}`);
  assert.equal(onlyPython.pct, Math.round((1.0 / 1.7) * 100));
});

test('scoreSkills handles an empty requirement without dividing by zero', () => {
  const result = scoreSkills([], resolveSkills(['Python']));
  assert.equal(result.pct, 0);
  assert.deepEqual(result.gap, []);
});

test('scoreSkills accepts rich skill objects from the actor', () => {
  const required = extractRequiredSkills([
    { canonical: 'Python', weight: 1.0, category: 'tech' },
    { name: 'Docker' },
    'nonsense-skill-xyz',
  ]);
  assert.deepEqual(required.map((s) => s.canonical).sort(), ['Docker', 'Python']);
});

test('scoreSkills reports a per-category breakdown', () => {
  const required = extractRequiredSkills(['Python', 'Communication']);
  const result = scoreSkills(required, resolveSkills(['Python']));
  assert.equal(result.byCategory.tech?.matched, 1);
  assert.equal(result.byCategory.soft?.matched, 0);
  assert.equal(result.byCategory.soft?.pct, 0);
});

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

test('scoreLocation awards full marks to fully remote roles', () => {
  for (const loc of ['Remote', 'Global / Remote', 'Worldwide', 'Anywhere', 'Distributed']) {
    assert.equal(scoreLocation(loc, { country: 'Nigeria' }), SCORE_WEIGHTS.location, loc);
  }
});

test('scoreLocation rewards same-country and African regional roles', () => {
  assert.equal(scoreLocation('Lagos, Nigeria', { country: 'Nigeria' }), 18);
  assert.equal(scoreLocation('Remote — Africa', { country: 'Kenya' }), 20); // remote wins
  assert.equal(scoreLocation('Nairobi, Kenya', { country: 'Kenya' }), 18);
  assert.equal(scoreLocation('Accra, Ghana', { country: 'Nigeria' }), 14); // cross-African
  assert.equal(scoreLocation('Hybrid — London', { country: 'Nigeria' }), 12);
  assert.equal(scoreLocation('San Francisco, CA', { country: 'Nigeria' }), 0);
});

test('scoreLocation is safe with null/empty input', () => {
  assert.equal(scoreLocation(null, { country: 'Nigeria' }), 0);
  assert.equal(scoreLocation('', { country: 'Nigeria' }), 0);
  assert.equal(scoreLocation(undefined as unknown as string, {}), 0);
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

test('scoreGoals honours an explicit type preference above free text', () => {
  const explicit = scoreGoals('hackathons', { goals: ['Remote Job'], preferredTypes: ['hackathons'] });
  assert.equal(explicit, SCORE_WEIGHTS.goals);
});

test('scoreGoals stays neutral rather than punitive when unknown', () => {
  const score = scoreGoals('grants', { goals: [] });
  assert.ok(score > 0 && score < SCORE_WEIGHTS.goals);
  assert.equal(score, 5);
});

test('scoreGoals penalises a mismatch', () => {
  assert.equal(scoreGoals('grants', { goals: ['Remote Job'] }), 3);
});

test('normalizeOpportunityType accepts legacy and human spellings', () => {
  assert.equal(normalizeOpportunityType('jobs_remote'), 'jobs_remote');
  assert.equal(normalizeOpportunityType('Remote Job'), 'jobs_remote');
  assert.equal(normalizeOpportunityType('remote-job'), 'jobs_remote');
  assert.equal(normalizeOpportunityType('Full Time Role'), 'jobs_remote');
  assert.equal(normalizeOpportunityType('Grant'), 'grants');
  assert.equal(normalizeOpportunityType('Hackathon'), 'hackathons');
  assert.equal(normalizeOpportunityType('Scholarship'), 'scholarships');
  assert.equal(normalizeOpportunityType(null), 'jobs_remote');
  assert.equal(normalizeOpportunityType(123), 'jobs_remote');
});

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

test('scoreExperience uses real profile experience, not just the title', () => {
  const junior = scoreExperience('Junior Developer', { yearsExperience: 1 });
  const seniorUnderqualified = scoreExperience('Senior Engineer', { yearsExperience: 0 });
  const seniorQualified = scoreExperience('Senior Engineer', { yearsExperience: 5 });

  assert.equal(junior, SCORE_WEIGHTS.experience);
  assert.ok(seniorQualified > seniorUnderqualified);
  assert.ok(seniorUnderqualified <= SCORE_WEIGHTS.experience * 0.6);
});

test('scoreExperience penalises over-qualification less than under-qualification', () => {
  const overqualified = scoreExperience('Junior Developer', { yearsExperience: 12 });
  const underqualified = scoreExperience('Principal Engineer', { yearsExperience: 0 });
  assert.ok(overqualified > underqualified);
});

test('scoreExperience is stable when the profile has no data', () => {
  const score = scoreExperience('Senior Engineer', {});
  assert.ok(score >= 0 && score <= SCORE_WEIGHTS.experience);
  const noTitle = scoreExperience(null, {});
  assert.ok(noTitle > 0);
});

// ---------------------------------------------------------------------------
// Full match
// ---------------------------------------------------------------------------

test('calculateMatch produces a bounded score with a complete breakdown', () => {
  const result = calculateMatch(
    {
      title: 'Senior React Engineer',
      location: 'Remote — Worldwide',
      opportunity_type: 'jobs_remote',
      skills_required: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    },
    {
      skills: ['reactjs', 'TypeScript', 'Node.js', 'postgres'],
      country: 'Nigeria',
      goals: ['Remote Job'],
      yearsExperience: 5,
    }
  );

  assert.ok(result.score >= 0 && result.score <= 100);
  assert.deepEqual(result.breakdown, {
    skills: 60,
    location: 20,
    goals: 10,
    experience: 10,
  });
  assert.equal(result.score, 100);
  assert.deepEqual(result.gap, []);
  assert.ok(result.explanation.length > 0);
  assert.ok(result.reasons.length >= 3);
});

test('calculateMatch factor weights sum to 100 at maximum', () => {
  const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('calculateMatch is deterministic', () => {
  const target = {
    title: 'Data Analyst',
    location: 'Lagos, Nigeria',
    opportunity_type: 'jobs_hybrid',
    skills_required: ['SQL', 'Python', 'Data Analysis'],
  };
  const subject = { skills: ['python', 'sql'], country: 'Nigeria', goals: ['Hybrid Job'] };
  const a = calculateMatch(target, subject);
  const b = calculateMatch(target, subject);
  assert.deepEqual(a, b);
});

test('calculateMatch degrades gracefully on a sparse opportunity', () => {
  const result = calculateMatch({ title: 'Something', location: null }, {});
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.explanation.includes('no specific skills'));
  assert.deepEqual(result.gap, []);
  assert.equal(result.breakdown.skills, 0);
});

test('calculateMatch never throws on malformed input', () => {
  const hostile = {
    title: null,
    location: undefined,
    opportunity_type: 42,
    skills_required: 'not-an-array',
  };
  const result = calculateMatch(hostile as never, { skills: 'nope' as never, country: null });
  assert.ok(Number.isFinite(result.score));
  assert.ok(result.score >= 0 && result.score <= 100);
});

test('calculateWeightedMatch legacy helper honours supplied weights', () => {
  const plain = calculateWeightedMatch(['Python', 'HTML'], ['Python']);
  const weighted = calculateWeightedMatch(['Python', 'HTML'], ['Python'], { Python: 1, HTML: 0.1 });
  assert.ok(weighted.score > plain.score, 'down-weighting an unmet skill must raise the score');
});

test('a high-skill match with wrong location still beats a low-skill remote match', () => {
  const skillsStrong = calculateMatch(
    { title: 'Engineer', location: 'Lagos, Nigeria', opportunity_type: 'jobs_onsite', skills_required: ['Python', 'React'] },
    { skills: ['Python', 'React'], country: 'Nigeria', goals: ['Onsite Job'] }
  );
  const remoteWeak = calculateMatch(
    { title: 'Engineer', location: 'Remote', opportunity_type: 'jobs_remote', skills_required: ['Kubernetes', 'Solidity', 'COBOL'] },
    { skills: ['Python', 'React'], country: 'Nigeria', goals: ['Remote Job'] }
  );
  assert.ok(skillsStrong.score > remoteWeak.score);
});
