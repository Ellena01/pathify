/**
 * Ingestion-normalisation tests.
 *
 * Run with:  npm test
 *
 * `/api/sync` is the only writer of `opportunities_cache` and everything
 * downstream (the catalog, the match engine, the digest email, the admin
 * moderation queue) trusts what it writes. It accepts records from an external
 * scraper, so the normaliser is the trust boundary: it has to reject unsafe
 * URLs, bound its inputs, and fold multi-source duplicates into one row.
 *
 * These are unit tests over the extracted pure helpers — no network, no Supabase.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  asStringArray,
  dedupeKey,
  fuzzyDedupeKey,
  isoDate,
  normalizeItem,
  str,
  DEFAULT_QUERIES,
  buildSearchQueries,
} from '../app/api/sync/normalize';
import { sanitizeExternalUrl } from '../lib/security';
import { SKILLS } from '../lib/taxonomy';

// ---------------------------------------------------------------------------
// Field coercion
// ---------------------------------------------------------------------------

test('str trims, slices, and stringifies primitives but rejects objects', () => {
  assert.equal(str('  hello  ', 100), 'hello');
  assert.equal(str('abcdef', 3), 'abc');
  assert.equal(str(42, 10), '42');
  assert.equal(str(true, 10), 'true');
  assert.equal(str(null, 10), '');
  assert.equal(str(undefined, 10), '');
  // A nested object must not become "[object Object]" in a title.
  assert.equal(str({ a: 1 }, 100), '');
  assert.equal(str(['x'], 100), '');
});

test('asStringArray keeps strings and rich skill objects, bounds both count and length', () => {
  const out = asStringArray(['React', { canonical: 'Python' }, { name: 'Docker' }, '', 7]);
  // Non-string, non-object entries carry no skill name, so they are dropped
  // rather than stringified into a "skill".
  assert.deepEqual(out, ['React', 'Python', 'Docker']);
  assert.equal(asStringArray('not-an-array').length, 0);
  assert.equal(asStringArray(null).length, 0);
  // 60 distinct real skills must be bounded down to MAX_SKILLS. (Duplicates
  // would not work here: canonicalisation dedupes before the cap is applied.)
  const many = SKILLS.slice(0, 60).map((s) => s.canonical);
  assert.equal(asStringArray(many).length, 40);
  assert.equal(asStringArray(['x'.repeat(200)]).length, 0, 'a non-skill string canonicalises to nothing');
});

test('asStringArray canonicalises aliases so a scraped skill and a typed skill are one', () => {
  // The actor emits rich objects; the old code stringified them to '' and
  // dropped the skill entirely, so rich-skill records had empty skill lists.
  assert.deepEqual(asStringArray([{ canonical: 'reactjs' }, { canonical: 'REACT' }]), ['React']);
  assert.deepEqual(asStringArray(['k8s', 'postgres']), ['Kubernetes', 'PostgreSQL']);
});

test('isoDate accepts real dates and rejects scraper junk', () => {
  assert.equal(isoDate('2026-09-26'), '2026-09-26');
  assert.equal(isoDate('2026-09-26T12:00:00Z'), '2026-09-26');
  assert.equal(isoDate('September 26, 2026'), null);
  assert.equal(isoDate('2026-13-01'), null);
  assert.equal(isoDate('2026-00-10'), null);
  assert.equal(isoDate('2026-09-99'), null);
  assert.equal(isoDate(20260926), null);
  assert.equal(isoDate(null), null);
});

// ---------------------------------------------------------------------------
// URL sanitisation — the trust boundary
// ---------------------------------------------------------------------------

test('normalizeItem rejects a record whose only URL is unsafe', () => {
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'java\0script:alert(1)',
    'not a url at all',
    '',
  ]) {
    const { row, rejected } = normalizeItem({ title: 'X', application_url: bad });
    assert.equal(rejected, 'missing_or_unsafe_application_url', `expected rejection for ${JSON.stringify(bad)}`);
    assert.deepEqual(row, {});
  }
});

test('normalizeItem rejects a record with no URL at all', () => {
  const { rejected } = normalizeItem({ title: 'No URL here' });
  assert.equal(rejected, 'missing_or_unsafe_application_url');
});

test('normalizeItem accepts http(s) and rewrites the source_domain from the host', () => {
  const { row, rejected } = normalizeItem({
    title: 'Senior Backend Engineer',
    application_url: 'https://boards.example.com/jobs/42?utm_source=x',
    skills_required: ['Python', 'PostgreSQL'],
  });
  assert.equal(rejected, null);
  assert.equal(row.organization, 'boards.example.com', 'organization falls back to the hostname');
  assert.equal(row.source_domain, 'boards.example.com');
  assert.equal(row.opportunity_type, 'jobs_remote');
  assert.equal(row.verification_status, 'review_recommended');
  assert.deepEqual(row.skills_required, ['Python', 'PostgreSQL']);
});

test('normalizeItem normalises opportunity_type rather than trusting the scraper', () => {
  const snake = normalizeItem({ application_url: 'https://a.test/1', opportunity_type: 'fellowships' });
  assert.equal(snake.row.opportunity_type, 'fellowships');

  const human = normalizeItem({ application_url: 'https://a.test/2', opportunity_type: 'Remote Job' });
  assert.equal(human.row.opportunity_type, 'jobs_remote', 'unknown spellings fall back, never reach the enum check');

  const hostile = normalizeItem({ application_url: 'https://a.test/3', opportunity_type: "'; DROP TABLE--" });
  assert.equal(hostile.row.opportunity_type, 'jobs_remote');
});

test('normalizeItem bounds raw_data so a huge payload is not replicated to browsers', () => {
  const huge = normalizeItem({
    application_url: 'https://a.test/big',
    title: 'Big',
    blob: 'x'.repeat(40_000),
  });
  const raw = huge.row.raw_data as Record<string, unknown>;
  assert.equal(raw._truncated, true);
  assert.equal(raw.title, 'Big');
  assert.equal(raw.application_url, 'https://a.test/big');
  assert.ok(
    JSON.stringify(huge.row).length < 20_000,
    'the truncated row must stay far below the 16 KiB cap'
  );
});

test('normalizeItem does not let a null match_score masquerade as 0', () => {
  const { row } = normalizeItem({ application_url: 'https://a.test/5', match_score: '94' });
  assert.equal(row.match_score, null, 'a string score is junk, not a score');
});

// ---------------------------------------------------------------------------
// Multi-source deduplication
// ---------------------------------------------------------------------------

test('dedupeKey strips tracking params and trailing slashes but keeps real ids', () => {
  assert.equal(
    dedupeKey('https://www.example.com/jobs/42/?utm_source=twitter&utm_campaign=x&gh_jid=99'),
    'https://www.example.com/jobs/42?gh_jid=99'
  );
  assert.equal(
    dedupeKey('https://Example.com/Jobs/42'),
    'https://example.com/Jobs/42',
    'host is lowercased; path case is significant'
  );
  // The same job syndicated on two boards with different ids must NOT collapse,
  // or a distinct listing would be silently dropped.
  assert.notEqual(dedupeKey('https://a.test/jobs/1'), dedupeKey('https://b.test/jobs/2'));
});

test('fuzzyDedupeKey collapses the same title+org across different boards', () => {
  const fromGoogle = fuzzyDedupeKey({
    title: 'Senior Frontend Engineer (React)',
    organization: 'Andela',
  });
  const fromLinkedIn = fuzzyDedupeKey({
    title: 'Senior Frontend Engineer - React',
    organization: 'Andela',
  });
  assert.equal(fromGoogle, fromLinkedIn);

  // Different role at the same company, and same role at a different company,
  // must stay distinct.
  assert.notEqual(
    fuzzyDedupeKey({ title: 'Senior Frontend Engineer (React)', organization: 'Andela' }),
    fuzzyDedupeKey({ title: 'Engineering Manager', organization: 'Andela' })
  );
  assert.notEqual(
    fuzzyDedupeKey({ title: 'Senior Frontend Engineer (React)', organization: 'Andela' }),
    fuzzyDedupeKey({ title: 'Senior Frontend Engineer (React)', organization: 'Flutterwave' })
  );
});

test('fuzzyDedupeKey returns null when the record is too thin to fingerprint', () => {
  assert.equal(fuzzyDedupeKey({ title: '', organization: 'Andela' }), null);
  assert.equal(fuzzyDedupeKey({ title: 'x', organization: '' }), null);
  assert.equal(fuzzyDedupeKey({}), null);
});

// ---------------------------------------------------------------------------
// URL sanitiser contract (regression guard for the normaliser's dependency)
// ---------------------------------------------------------------------------

test('sanitizeExternalUrl keeps http(s) and rejects everything else', () => {
  assert.equal(sanitizeExternalUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(sanitizeExternalUrl('http://example.com'), 'http://example.com/');
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalUrl('//example.com/x'), null);
  assert.equal(sanitizeExternalUrl('https://user:pass@example.com/'), 'https://example.com/');
  assert.equal(sanitizeExternalUrl(`https://example.com/#frag`), 'https://example.com/');
});

// ---------------------------------------------------------------------------
// Query-driven discovery
// ---------------------------------------------------------------------------

test('buildSearchQueries produces a query per axis and never returns an empty list', () => {
  const queries = buildSearchQueries({
    categories: ['software internship'],
    locations: ['Nigeria'],
    opportunityTypes: ['jobs_remote'],
  });
  assert.ok(queries.length > 0);
  for (const q of queries) {
    assert.ok(q.includes('site:'), `query should pin a source: ${q}`);
    assert.ok(q.length > 0);
  }

  // No input at all still yields the standing query set.
  assert.ok(buildSearchQueries({}).length > 0);
});

test('DEFAULT_QUERIES cover the four discovery surfaces Pathify needs', () => {
  const text = DEFAULT_QUERIES.join(' ').toLowerCase();
  // Google (open web + career pages), LinkedIn (professional network),
  // Telegram (the channels African dev communities post in), and standalone
  // aggregators with no public API that must be read as HTML.
  for (const needle of ['site:google.com', 'site:linkedin.com', 'site:t.me', 'remotive.com']) {
    assert.ok(text.includes(needle), `expected a default query for ${needle}`);
  }
  // Every query must be platform-scoped so the actor can route it.
  for (const q of DEFAULT_QUERIES) {
    assert.ok(q.startsWith('site:'), `query should be site-scoped: ${q}`);
  }
});
