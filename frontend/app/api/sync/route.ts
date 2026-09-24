import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/sync — Scheduled Actor runs → Apify Dataset → cached in Supabase
// Trigger via: Vercel Cron, GitHub Actions, or Apify webhook after Actor run
// Auth: header x-cron-secret === CRON_SECRET OR Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY
// Body optional: { datasetId, token } override env

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || '7vWfQxcWXaL9qJShK';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  // 1) Auth — supports Apify webhook (x-cron-secret), service_role, Vercel Cron (x-vercel-cron), dev bypass
  const cronHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const vercelCron = request.headers.get('x-vercel-cron');
  const hasCron = CRON_SECRET && cronHeader === CRON_SECRET;
  const hasService = SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  const hasVercelCron = vercelCron !== null;
  const devBypass = !CRON_SECRET && !SUPABASE_SERVICE_ROLE_KEY && process.env.NODE_ENV !== 'production';
  if (!hasCron && !hasService && !hasVercelCron && !devBypass) {
    return NextResponse.json({ error: 'Unauthorized. Provide x-cron-secret or Bearer service_role' }, { status: 401 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    );
  }
  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_TOKEN not configured' }, { status: 500 });
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const datasetId = body.datasetId || APIFY_DATASET_ID;
  const token = body.token || APIFY_TOKEN;

  const apifyUrl = `https://api.apify.com/v2/datasets/${datasetId}/items`;
  let items: any[] = [];
  try {
    const res = await fetch(apifyUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Apify ${res.status}: ${await res.text()}`);
    const data = await res.json();
    items = Array.isArray(data) ? data : [];
  } catch (e: any) {
    return NextResponse.json({ error: `Apify fetch failed: ${e.message}` }, { status: 502 });
  }

  if (items.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No items from Apify' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const rows = items.slice(0, 500).map((item: any) => ({
    application_url: item.application_url || item.url || `https://pathify.local/${encodeURIComponent(item.title || Math.random())}`,
    title: (item.title || 'Untitled Opportunity').slice(0, 200),
    organization: item.organization || item.company || 'Unknown',
    location: item.location || 'Global / Remote',
    opportunity_type: item.opportunity_type || 'Remote Job',
    skills_required: Array.isArray(item.skills_required) ? item.skills_required : [],
    verification_status: item.verification_status || 'review_recommended',
    discovered_at: item.discovered_at || new Date().toISOString().slice(0, 10),
    match_score: typeof item.match_score === 'number' ? item.match_score : null,
    matched_skills: Array.isArray(item.matched_skills) ? item.matched_skills : [],
    skill_gap: Array.isArray(item.skill_gap) ? item.skill_gap : [],
    source_domain: item.source_domain || (item.application_url ? new URL(item.application_url).hostname : null),
    deadline: item.deadline || null,
    amount: item.amount || null,
    raw_data: item,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('opportunities_cache').upsert(rows, { onConflict: 'application_url' });
  if (error) {
    return NextResponse.json({ error: `Supabase upsert failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ synced: rows.length, datasetId });
}

// GET removed for security (secret via query leaks in logs). Use POST with x-cron-secret header.
export async function GET() {
  return NextResponse.json({ error: 'Use POST with x-cron-secret header' }, { status: 405 });
}
