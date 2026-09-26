import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeCronRequest } from '@/lib/server-auth';
import { sanitizeExternalUrl } from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/sync — Scheduled Actor runs → Apify Dataset → `opportunities_cache`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Nothing else. Header-presence
 * checks are not authentication and are deliberately not supported.
 *
 * Body: ignored. The dataset id and Apify token are server configuration only,
 * so a compromised caller cannot redirect the sync at an arbitrary dataset.
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || '7vWfQxcWXaL9qJShK';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_RECORDS = 1000;
const MAX_RAW_DATA_BYTES = 16 * 1024;

/** Verbatim allowlist. Anything outside this is nav chrome or an attack. */
const VALID_OPPORTUNITY_TYPES = new Set([
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

const VALID_VERIFICATION = new Set(['high', 'review_recommended', 'rejected', 'pending_review']);

function str(value: unknown, max: number): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function asStringArray(value: unknown, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const s = str(entry, 80);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** `YYYY-MM-DD` or null. Guards the `date` column against scraper junk. */
function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m}-${d}`;
}

interface NormalizedRow {
  row: Record<string, unknown>;
  rejected: string | null;
}

/**
 * Map one scraped record to a database row.
 *
 * Returns `rejected` with a reason instead of throwing, so a single malformed
 * record cannot fail the entire sync. Records without a safe absolute URL are
 * dropped: `application_url` is the conflict key *and* is rendered as an href,
 * so an unusable value is both a dedupe failure and an XSS vector.
 */
function normalizeItem(item: Record<string, unknown>): NormalizedRow {
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

  return {
    row: {
      application_url: applicationUrl,
      title,
      organization: str(item.organization, 120) || str(item.company, 120) || hostname,
      location: str(item.location, 120) || 'Global / Remote',
      opportunity_type: oppType,
      skills_required: asStringArray(item.skills_required),
      verification_status: verificationStatus,
      discovered_at: isoDate(item.discovered_at) ?? new Date().toISOString().slice(0, 10),
      match_score: score,
      matched_skills: asStringArray(item.matched_skills),
      skill_gap: asStringArray(item.skill_gap),
      source_domain: hostname,
      deadline: isoDate(item.deadline),
      amount: str(item.amount, 80) || null,
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

export async function POST(request: Request) {
  const auth = authorizeCronRequest(request, { allowServiceRole: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, reason: auth.reason }, { status: auth.status });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase service role not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 500 }
    );
  }
  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 });
  }

  let items: unknown[] = [];
  try {
    const res = await fetch(`https://api.apify.com/v2/datasets/${APIFY_DATASET_ID}/items`, {
      headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json({ error: `Apify responded ${res.status}`, detail }, { status: 502 });
    }
    const data: unknown = await res.json();
    items = Array.isArray(data) ? data : [];
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: 'Apify fetch failed', detail: message }, { status: 502 });
  }

  if (items.length === 0) {
    return NextResponse.json({ synced: 0, rejected: 0, message: 'Apify dataset returned no items' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows: Record<string, unknown>[] = [];
  const rejected: Record<string, number> = {};
  const seen = new Set<string>();

  for (const raw of items.slice(0, MAX_RECORDS)) {
    if (!raw || typeof raw !== 'object') continue;
    const { row, rejected: reason } = normalizeItem(raw as Record<string, unknown>);
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      continue;
    }
    const key = row.application_url as string;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  if (rows.length === 0) {
    return NextResponse.json({ synced: 0, rejected, message: 'No usable records' });
  }

  // Batched upsert — a single 1000-row statement, not 1000 round-trips.
  const { error } = await supabase
    .from('opportunities_cache')
    .upsert(rows, { onConflict: 'application_url' });
  if (error) {
    return NextResponse.json({ error: 'Supabase upsert failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: rows.length, rejected });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST with Authorization: Bearer <CRON_SECRET>' },
    { status: 405 }
  );
}
