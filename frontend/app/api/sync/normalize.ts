import { sanitizeExternalUrl } from '@/lib/security';
import { canonicalizeSkillList, resolveSkills } from '@/lib/taxonomy';

/**
 * Ingestion normalisation for `/api/sync`.
 *
 * Extracted from the route so it can be unit-tested without a network call or a
 * Supabase connection — this is the trust boundary for everything the scraper
 * produces, and every downstream surface (catalog, match engine, digest email,
 * moderation queue) trusts it.
 *
 * Responsibilities, in order:
 *   1. URL sanitisation — `application_url` is both the dedupe key and a
 *      rendered `href`, so an unusable value is a dedupe failure *and* an XSS
 *      vector. Records without a safe absolute http(s) URL are dropped.
 *   2. Field coercion and bounding — everything has a length cap, and unknown
 *      enum values fall back rather than reaching a CHECK constraint.
 *   3. Skill canonicalisation via the taxonomy, so an alias scraped off a job
 *      board ("reactjs") and the same skill typed by a user ("React") score as
 *      one skill instead of two.
 *   4. Two dedupe keys — exact (`dedupeKey`) and fuzzy (`fuzzyDedupeKey`) — so
 *      one job syndicated across Google, LinkedIn and a company careers page
 *      becomes one row.
 */

export const MAX_RECORDS = 1000;
export const MAX_RAW_DATA_BYTES = 16 * 1024;
export const MAX_SKILLS = 40;
export const MAX_SKILL_LEN = 80;

/** Verbatim allowlist. Anything outside this is nav chrome or an attack. */
export const VALID_OPPORTUNITY_TYPES = new Set([
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
]);

export const VALID_VERIFICATION = new Set(['high', 'review_recommended', 'rejected', 'pending_review']);

// ---------------------------------------------------------------------------
// Discovery queries
// ---------------------------------------------------------------------------

/**
 * The standing search queries the actor sweeps when no per-run query is
 * supplied. Between them they cover the four discovery surfaces:
 *
 *   - `google`     open-web search results, so listings on company career pages
 *                  and smaller boards are reachable at all
 *   - `linkedin`   the professional-network feed, which is where most senior
 *                  African tech roles are posted first
 *   - `telegram`   the channels African developer communities actually post in
 *   - `website`    direct HTML on aggregators that have no public API
 *
 * `site:` operators keep each query pointed at one platform so the actor can
 * route it to the right handler; see `actor/src/discovery.py`.
 */
export const DEFAULT_QUERIES = [
  'site:linkedin.com/jobs software engineer internship Nigeria',
  'site:linkedin.com/jobs remote developer Africa',
  'site:google.com/jobs software internship Nigeria',
  'site:t.me software engineering jobs Nigeria',
  'site:t.me tech grants Africa',
  'site:remotive.com remote developer',
  'site:weworkremotely.com remote engineer Africa',
  'site:hackathons.com hackathon Africa',
  'site:devpost.com hackathon Africa',
  'site:africa.careers technology',
  'site:techcabal.com fellowship Africa',
  'site:afrilabs.com fellowship grants Africa',
  'site:orenda.co.uk fellowship Africa',
  'site:unglobalcompact.org grants Africa',
  'site:mitocsf.mit.edu fellowship Africa',
  'site:google.com/search "tech grant" Africa 2026',
  'site:google.com/search "developer fellowship" remote 2026',
  'site:google.com/search "remote design competition" 2026',
  'site:google.com/search "software engineering internship" Kenya OR Ghana OR Rwanda',
] as const;

export interface QueryInput {
  categories?: readonly string[];
  locations?: readonly string[];
  opportunityTypes?: readonly string[];
  /** Extra free-text queries, e.g. from the actor input `queries` field. */
  extra?: readonly string[];
}

/**
 * Expand structured discovery input into concrete `site:`-scoped queries.
 *
 * One query is produced per (category x location) combination, plus one per
 * category on its own, so a single region is never at the mercy of one
 * conjunctive query returning nothing. Always returns at least
 * `DEFAULT_QUERIES`, so a caller with no input still sweeps something.
 */
export function buildSearchQueries(input: QueryInput): string[] {
  const categories = (input.categories ?? []).map(sanitizeQueryTerm).filter(Boolean);
  const locations = (input.locations ?? []).map(sanitizeQueryTerm).filter(Boolean);
  const extra = (input.extra ?? []).map(sanitizeQueryTerm).filter(Boolean);

  const out: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };

  for (const extraQuery of extra) push(extraQuery);

  for (const category of categories) {
    for (const location of locations) {
      push(`site:linkedin.com/jobs ${category} ${location}`);
      push(`site:google.com/search "${category}" "${location}" 2026`);
    }
    push(`site:linkedin.com/jobs ${category} Africa`);
    push(`site:google.com/search "${category}" Africa 2026`);
  }

  return out.length > 0 ? out : [...DEFAULT_QUERIES];
}

/** Drop anything that would break a search-engine query string. */
function sanitizeQueryTerm(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[^\w\s+#./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// ---------------------------------------------------------------------------
// Field coercion
// ---------------------------------------------------------------------------

export function str(value: unknown, max: number): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Flatten a `skills_required` value to a list of canonical skill names.
 *
 * The actor emits rich objects (`{canonical, weight, category}`); the previous
 * version passed them through `str()`, which stringified an object to `''` and
 * threw the skill away. So the rich shape silently produced empty skill lists
 * for every actor record.
 */
export function asStringArray(value: unknown, max = MAX_SKILLS): string[] {
  if (!Array.isArray(value)) return [];

  const raw: string[] = [];
  for (const entry of value) {
    let name = '';
    if (typeof entry === 'string') {
      name = entry;
    } else if (entry && typeof entry === 'object') {
      const canonical = (entry as { canonical?: unknown }).canonical;
      const alt = (entry as { name?: unknown }).name;
      if (typeof canonical === 'string') name = canonical;
      else if (typeof alt === 'string') name = alt;
    }
    const trimmed = str(name, MAX_SKILL_LEN);
    if (trimmed) raw.push(trimmed);
    if (raw.length >= max * 2) break;
  }

  // Canonicalise so "reactjs" and "React" become one skill, then re-bound.
  return canonicalizeSkillList(raw).slice(0, max);
}

/** `YYYY-MM-DD` or null. Guards the `date` column against scraper junk. */
export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Dedupe keys
// ---------------------------------------------------------------------------

/** Query parameters that identify a *different* resource, not a campaign. */
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref_?$|referrer$|source$|src$|trk$|trackingId$|lipi$|licu$)/i;

/** Query parameters that carry the resource identity and must be preserved. */
const IDENTITY_PARAMS = /^(gh_jid|jobId|jobid|jid|vacancyId|opportunityId|offeringId|postingId|eventId|challengeId|id)$/i;

/**
 * Exact dedupe key: scheme + lowercased host + path, tracking params removed.
 *
 * `gh_jid` / `jobId` and friends are deliberately KEPT — on several boards the
 * entire resource identity is in the query string, and stripping it would
 * collapse every job on the board into one row.
 */
export function dedupeKey(url: string): string {
  try {
    const parsed = new URL(url);
    const kept = [...parsed.searchParams.entries()]
      .filter(([key]) => IDENTITY_PARAMS.test(key) || !TRACKING_PARAMS.test(key))
      .map(([key, value]) => [key.toLowerCase(), value] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const query = kept.length ? `?${kept.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${query}`;
  } catch {
    return String(url).toLowerCase();
  }
}

const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'at', 'on', 'with',
  'remote', 'hybrid', 'onsite', 'full', 'time', 'part', 'senior', 'junior',
  'graduate', 'entry', 'level', 'position', 'role', 'job', 'opening', 'vacancy',
  'm', 'f', 'd', 'w', 'mfd', 'fdx', 'mw',
]);

/**
 * Cross-source dedupe key: a fingerprint of the role itself.
 *
 * The same vacancy syndicated to Google, LinkedIn and a company careers page has
 * three URLs and often three slightly different titles ("Senior Frontend
 * Engineer (React)" vs "Senior Frontend Engineer - React", "Andela" vs
  "Andela Nigeria"). URL equality cannot see that; a normalised
 * organisation+title fingerprint can.
 *
 * Returns `null` when there is not enough signal to fingerprint safely —
 * a missing organization would otherwise make every untitled listing collide.
 */
export function fuzzyDedupeKey(input: {
  title?: unknown;
  organization?: unknown;
  opportunity_type?: unknown;
}): string | null {
  const org = str(input.organization, 120).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!org) return null;

  const type = str(input.opportunity_type, 60).toLowerCase().replace(/[^a-z0-9]+/g, '');

  const words = str(input.title, 200)
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(' ')
    .filter((w) => w && !FILLER_WORDS.has(w))
    // A single leftover token ("Engineer") is far too weak to fingerprint on.
    .filter((w) => w.length > 1);

  if (words.length === 0) return null;

  // Order-independent, so a reordered title still matches.
  const fingerprint = [...new Set(words)].sort().join('-');
  return `${org}:${type}:${fingerprint}`;
}

// ---------------------------------------------------------------------------
// Record normalisation
// ---------------------------------------------------------------------------

export interface NormalizedRow {
  row: Record<string, unknown>;
  rejected: string | null;
}

/**
 * Map one scraped record to a database row.
 *
 * Returns `rejected` with a reason instead of throwing, so a single malformed
 * record cannot fail the entire sync.
 */
export function normalizeItem(item: Record<string, unknown>): NormalizedRow {
  const rawUrl =
    (typeof item.application_url === 'string' && item.application_url) ||
    (typeof item.url === 'string' && item.url) ||
    '';

  const applicationUrl = sanitizeExternalUrl(rawUrl);
  if (!applicationUrl) {
    return { row: {}, rejected: 'missing_or_unsafe_application_url' };
  }

  let hostname: string | null = null;
  try {
    hostname = new URL(applicationUrl).hostname;
  } catch {
    return { row: {}, rejected: 'unparseable_application_url' };
  }

  const title = str(item.title, 200) || 'Untitled Opportunity';

  const oppTypeRaw = str(item.opportunity_type, 60);
  const oppType = VALID_OPPORTUNITY_TYPES.has(oppTypeRaw) ? oppTypeRaw : 'jobs_remote';

  const verificationRaw = str(item.verification_status, 40);
  const verificationStatus = VALID_VERIFICATION.has(verificationRaw)
    ? verificationRaw
    : 'review_recommended';

  // The actor's `match_score` is computed against whoever ran the scrape, so it
  // is NOT this user's fit. It is kept only as a weak sort hint for the admin
  // queue; the real per-user score is written by /api/match.
  const score =
    typeof item.match_score === 'number' && Number.isFinite(item.match_score)
      ? Math.max(0, Math.min(100, Math.round(item.match_score)))
      : null;

  // Keep raw_data bounded — it is replicated to every browser that lists
  // opportunities, so an unbounded blob is a bandwidth and privacy problem.
  let rawData: unknown = item;
  const serialized = JSON.stringify(item);
  if (serialized && serialized.length > MAX_RAW_DATA_BYTES) {
    rawData = { _truncated: true, _originalBytes: serialized.length, title, application_url: applicationUrl };
  }

  const skillsRequired = asStringArray(item.skills_required);
  const organization = str(item.organization, 120) || str(item.company, 120) || hostname;

  return {
    row: {
      application_url: applicationUrl,
      title,
      organization,
      location: str(item.location, 120) || 'Global / Remote',
      opportunity_type: oppType,
      skills_required: skillsRequired,
      verification_status: verificationStatus,
      discovered_at: isoDate(item.discovered_at) ?? new Date().toISOString().slice(0, 10),
      match_score: score,
      matched_skills: asStringArray(item.matched_skills),
      skill_gap: asStringArray(item.skill_gap),
      source_domain: hostname,
      deadline: isoDate(item.deadline),
      amount: str(item.amount, 80) || null,
      // Which platform this came from, so multi-source provenance is auditable
      // and a dead source can be identified in the admin source-health table.
      source_platform: str(item.source_platform ?? item.discovery_source, 40) || null,
      raw_data: rawData,
      // `synced_at` is "last time this row was written" and is rewritten on
      // every upsert. The alert digest filters on it, which made every listing
      // look brand new every single day. `first_seen_at` is immutable per row
      // and is what "new to you" must be computed from.
      synced_at: new Date().toISOString(),
    },
    rejected: null,
  };
}

export interface DedupeOutcome {
  rows: Record<string, unknown>[];
  /** Per-reason counts, so a bad scrape is diagnosable from the response. */
  rejected: Record<string, number>;
  duplicates: { exact: number; fuzzy: number };
}

/**
 * Fold a batch down to unique rows.
 *
 * Three layers, in increasing cost:
 *   1. exact `application_url` — the same URL twice in one dataset
 *   2. `dedupeKey` — the same listing behind different tracking parameters
 *   3. `fuzzyDedupeKey` — the same listing syndicated on a different platform,
 *      which is the common case now that discovery spans Google, LinkedIn,
 *      Telegram and raw web pages
 *
 * Later records never overwrite earlier ones; the first sighting wins so the
 * original `first_seen_at` and `discovered_at` are preserved.
 */
export function dedupeBatch(items: readonly Record<string, unknown>[]): DedupeOutcome {
  const rows: Record<string, unknown>[] = [];
  const rejected: Record<string, number> = {};
  const seenUrls = new Set<string>();
  const seenExact = new Set<string>();
  const seenFuzzy = new Set<string>();
  const duplicates = { exact: 0, fuzzy: 0 };

  for (const item of items.slice(0, MAX_RECORDS)) {
    if (!item || typeof item !== 'object') continue;

    const { row, rejected: reason } = normalizeItem(item);
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      continue;
    }

    const url = row.application_url as string;
    if (seenUrls.has(url)) {
      duplicates.exact += 1;
      continue;
    }

    const exact = dedupeKey(url);
    if (seenExact.has(exact)) {
      duplicates.exact += 1;
      continue;
    }

    const fuzzy = fuzzyDedupeKey({
      title: row.title,
      organization: row.organization,
      opportunity_type: row.opportunity_type,
    });
    if (fuzzy && seenFuzzy.has(fuzzy)) {
      duplicates.fuzzy += 1;
      continue;
    }

    seenUrls.add(url);
    seenExact.add(exact);
    if (fuzzy) seenFuzzy.add(fuzzy);
    rows.push(row);
  }

  return { rows, rejected, duplicates };
}

/** Exported for the route's logging: how many skills a row actually carries. */
export function countResolvedSkills(row: Record<string, unknown>): number {
  return resolveSkills(row.skills_required as string[]).length;
}
