import { NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { isVisibleListing } from '@/lib/matching';

// Server-only env — never expose token to browser
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || '7vWfQxcWXaL9qJShK';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CATALOG_LIMIT = 200;

/**
 * GET /api/jobs — the public, browsable opportunity catalog.
 *
 * Read-only by construction: this route never writes. Only `/api/sync`
 * (service_role) may write to `opportunities_cache`.
 *
 * Both read paths apply the same two hygiene rules, in SQL for the cache and
 * in memory for the Apify fallback:
 *   - `is_active = false`   the crawler confirmed the listing is gone
 *   - `verification_status = 'rejected'`   a moderator rejected it
 * Neither used to be filtered, so retired and rejected listings were being
 * served to the public and ranked into the digest.
 */
function getApifyDatasetUrl(): string | null {
  if (!APIFY_TOKEN) return null;
  return `https://api.apify.com/v2/datasets/${APIFY_DATASET_ID}/items`;
}

export async function GET() {
  // 1) Preferred: Supabase cache (Scheduled Actor → Dataset → Supabase)
  if (SUPABASE_URL && SUPABASE_ANON) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: cached, error } = await supabase
        .from('opportunities_cache')
        .select('*')
        .eq('is_active', true)
        .neq('verification_status', 'rejected')
        .order('discovered_at', { ascending: false })
        .limit(CATALOG_LIMIT);
      if (!error && cached && cached.length > 0) {
        return NextResponse.json(cached);
      }
      // If the cache is empty (or the hygiene columns are missing on an
      // unmigrated database) fall through to the Apify dataset.
      if (error) console.warn('Supabase cache read warning:', error.message);
    } catch (e: any) {
      console.warn('Supabase cache exception, falling back to Apify:', e?.message);
    }
  }

  // 2) Fallback: Live Apify Dataset (server-only token)
  try {
    const apifyUrl = getApifyDatasetUrl();
    if (!apifyUrl) {
      return NextResponse.json(
        { error: 'APIFY_TOKEN not configured. Set APIFY_TOKEN and APIFY_DATASET_ID in .env.local (server-only).' },
        { status: 500 }
      );
    }
    const response = await fetch(apifyUrl, { headers: { Authorization: `Bearer ${APIFY_TOKEN}` }, next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`Apify responded with status ${response.status}`);
    const data: unknown = await response.json();
    // Note: cache write removed — only /api/sync (service_role) may write to
    // opportunities_cache (RLS). Use the sync cron.

    // The dataset is raw scraper output, so hygiene has to be applied here.
    // Actor output predates the `is_active` / moderation columns, so an absent
    // value is treated as visible rather than silently emptying the feed.
    if (Array.isArray(data)) {
      return NextResponse.json(data.filter(isVisibleListing).slice(0, CATALOG_LIMIT));
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch from Apify' }, { status: 500 });
  }
}
