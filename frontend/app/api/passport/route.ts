import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function ccForCountry(country: string): string {
  const m: Record<string, string> = {
    nigeria: 'NG', kenya: 'KE', ghana: 'GH', 'south africa': 'ZA', rwanda: 'RW',
    ethiopia: 'ET', egypt: 'EG', morocco: 'MA', tunisia: 'TN', senegal: 'SN',
    uganda: 'UG', tanzania: 'TZ', cameroon: 'CM', zambia: 'ZM', zimbabwe: 'ZW',
    botswana: 'BW', namibia: 'NA', mozambique: 'MZ', angola: 'AO', 'global / remote': 'GL', global: 'GL',
  };
  return m[(country || '').toLowerCase()] || 'XX';
}

function genPassportId(country: string): string {
  const cc = ccForCountry(country);
  const yyyy = new Date().getFullYear().toString();
  const xxxx = Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, '0').slice(0, 4);
  // ensure hex-ish but allow A-Z0-9; use alphanumeric
  return `PTQ-${cc}-${yyyy}-${xxxx}`;
}

function genSlug(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase.from('user_profiles').select('id, name, role, country, skills, goals, passport_id, passport_share_slug, is_passport_public, passport_issued_at').eq('id', user.id).single();
  if (error) {
    // Fallback if columns missing (migration not run) — generate on fly
    if (error.message.includes('passport_id') || error.message.includes('column')) {
      return NextResponse.json({ error: 'Passport not migrated yet. Please run supabase/migrations/20260924_passport_org_alerts_navigator.sql in SQL Editor.', details: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // If no passport_id yet (old row before trigger), generate now
  if (!data.passport_id) {
    const newId = genPassportId(data.country || 'XX');
    const { data: upd, error: upErr } = await supabase.from('user_profiles').update({ passport_id: newId, passport_issued_at: new Date().toISOString() }).eq('id', user.id).select('passport_id, passport_share_slug, is_passport_public, passport_issued_at').single();
    if (!upErr && upd) return NextResponse.json({ ...data, passport_id: upd.passport_id, passport_share_slug: upd.passport_share_slug, is_passport_public: upd.is_passport_public, passport_issued_at: upd.passport_issued_at });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { body = {}; }
  const action = body.action || 'toggle_public';

  if (action === 'toggle_public') {
    const desired = body.is_public;
    // Fetch current
    const { data: cur } = await supabase.from('user_profiles').select('is_passport_public, passport_share_slug').eq('id', user.id).single();
    let nextPublic = typeof desired === 'boolean' ? desired : !cur?.is_passport_public;
    let slug = cur?.passport_share_slug;
    if (nextPublic && !slug) {
      // try RPC if exists, else gen locally
      const { data: rpc } = await supabase.rpc('generate_share_slug', { uid: user.id });
      if (rpc) slug = rpc;
      else {
        slug = genSlug();
        await supabase.from('user_profiles').update({ passport_share_slug: slug, is_passport_public: true }).eq('id', user.id);
      }
    }
    const { data, error } = await supabase.from('user_profiles').update({ is_passport_public: nextPublic, ...(slug ? { passport_share_slug: slug } : {}) }).eq('id', user.id).select('passport_id, passport_share_slug, is_passport_public').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'regenerate_slug') {
    const slug = genSlug();
    const { data, error } = await supabase.from('user_profiles').update({ passport_share_slug: slug, is_passport_public: true }).eq('id', user.id).select('passport_id, passport_share_slug, is_passport_public').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'regenerate_passport') {
    const { data: profile } = await supabase.from('user_profiles').select('country').eq('id', user.id).single();
    const newId = genPassportId(profile?.country || 'XX');
    const { data, error } = await supabase.from('user_profiles').update({ passport_id: newId, passport_issued_at: new Date().toISOString() }).eq('id', user.id).select('passport_id, passport_issued_at').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
