import { NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

// Server-only env — never expose token to browser
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || '7vWfQxcWXaL9qJShK';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getApifyDatasetUrl(): string | null {
  if (!APIFY_TOKEN) return null;
  return `https://api.apify.com/v2/datasets/${APIFY_DATASET_ID}/items`;
}

export async function GET() {
  // 1) Preferred: Supabase cache (Scheduled Actor → Dataset → Supabase)
  // Frontend reads Supabase; API route only falls back to Apify if cache empty/misconfigured
  if (SUPABASE_URL && SUPABASE_ANON) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: cached, error } = await supabase
        .from('opportunities_cache')
        .select('*')
        .order('discovered_at', { ascending: false })
        .limit(200);
      if (!error && cached && cached.length > 0) {
        // Normalize Supabase rows back to legacy OpportunityRecord shape
        return NextResponse.json(cached);
      }
      // If cache exists but empty, fall through to Apify; otherwise log
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
    const data = await response.json();
    // Note: cache write removed — only /api/sync (service_role) may write to opportunities_cache (RLS). Use sync webhook.

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch from Apify' }, { status: 500 });
  }
}
