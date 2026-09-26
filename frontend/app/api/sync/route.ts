import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeCronRequest } from '@/lib/server-auth';
import {
  DEFAULT_QUERIES,
  MAX_RECORDS,
  buildSearchQueries,
  dedupeBatch,
  type QueryInput,
} from './normalize';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/sync — Scheduled Actor runs → Apify Dataset → `opportunities_cache`.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Nothing else. Header-presence
 * checks are not authentication and are deliberately not supported.
 *
 * Body: ignored for ingestion. The dataset id and Apify token are server
 * configuration only, so a compromised caller cannot redirect the sync at an
 * arbitrary dataset.
 *
 * The body IS read for an optional `queries` passthrough when
 * `?trigger=actor` is set, so an operator can kick off a targeted crawl
 * ("software internship Nigeria") without redeploying. It can only *narrow* what
 * the actor looks for; it can never redirect the write target.
 *
 * Normalisation, URL sanitisation, skill canonicalisation and multi-source
 * deduplication all live in `./normalize` and are unit-tested in
 * `tests/sync-normalize.test.ts`.
 */

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || '7vWfQxcWXaL9qJShK';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Re-exported so the actor schedule doc and the route agree on the contract. */
export { DEFAULT_QUERIES, MAX_RECORDS };

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

  const url = new URL(request.url);
  const trigger = url.searchParams.get('trigger');

  // Optional: kick a targeted actor run before ingesting. Failures here are
  // non-fatal — we still ingest whatever the dataset already holds.
  let triggered: { ok: boolean; detail?: string } | null = null;
  if (trigger === 'actor') {
    triggered = await triggerActorRun(request, url);
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
    return NextResponse.json({ synced: 0, rejected: 0, triggered, message: 'Apify dataset returned no items' });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 500 });
  }

  // Normalise + sanitise + dedupe. One malformed record cannot fail the batch.
  const { rows, rejected, duplicates } = dedupeBatch(items as Record<string, unknown>[]);

  if (rows.length === 0) {
    return NextResponse.json({ synced: 0, rejected, duplicates, triggered, message: 'No usable records' });
  }

  // Batched upsert — a single statement, not one round-trip per record.
  // `application_url` is the primary key, so the DB is the final dedupe backstop.
  const { error } = await supabase.from('opportunities_cache').upsert(rows, { onConflict: 'application_url' });
  if (error) {
    return NextResponse.json({ error: 'Supabase upsert failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    synced: rows.length,
    received: Math.min(items.length, MAX_RECORDS),
    rejected,
    duplicates,
    triggered,
  });
}

/**
 * Ask Apify to start a run with explicit discovery queries.
 *
 * This is what turns the pipeline from "crawl a fixed list of boards" into
 * query-driven discovery. The queries come from the request body (so an
 * operator can search for "remote developer fellowship" without a redeploy) and
 * fall back to the standing set in `./normalize`.
 */
async function triggerActorRun(
  request: Request,
  url: URL
): Promise<{ ok: boolean; detail?: string }> {
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!actorId) return { ok: false, detail: 'APIFY_ACTOR_ID not configured' };

  let input: QueryInput = {};
  try {
    const body = await request.json();
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      input = {
        categories: Array.isArray(b.categories) ? (b.categories as string[]) : undefined,
        locations: Array.isArray(b.locations) ? (b.locations as string[]) : undefined,
        opportunityTypes: Array.isArray(b.opportunityTypes) ? (b.opportunityTypes as string[]) : undefined,
        extra: Array.isArray(b.queries) ? (b.queries as string[]) : undefined,
      };
    }
  } catch {
    // No body: use the standing query set.
  }

  const queries = buildSearchQueries(input);

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(APIFY_TOKEN!)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries, maxItems: Number(url.searchParams.get('maxItems') ?? 200) }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok) {
      return { ok: false, detail: `Apify actor run rejected with ${res.status}` };
    }
    return { ok: true, detail: `${queries.length} queries dispatched` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'unknown error' };
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST with Authorization: Bearer <CRON_SECRET>' },
    { status: 405 }
  );
}
