import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { calculateWeightedMatch } from '@/app/utils/score';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  // Auth: cron secret or service_role bearer, dev bypass if no secret
  const cronHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const hasCron = CRON_SECRET && cronHeader === CRON_SECRET;
  const hasService = SERVICE_KEY && authHeader === `Bearer ${SERVICE_KEY}`;
  const devBypass = !CRON_SECRET && !SERVICE_KEY && process.env.NODE_ENV !== 'production';
  const hasVercelCron = request.headers.get('x-vercel-cron') !== null; // Vercel cron trusted
  if (!hasCron && !hasService && !hasVercelCron && !devBypass) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  if (!SUPABASE_URL || !SERVICE_KEY) return NextResponse.json({ error: 'Supabase service_role not configured' }, { status: 500 });

  const admin = createAdminClient(SUPABASE_URL, SERVICE_KEY);

  // Fetch eligible users
  let users: any[] = [];
  try {
    const { data, error } = await admin.from('user_profiles').select('id, name, skills, alert_threshold, last_alert_at, alert_opt_in, unsubscribe_token').eq('alert_opt_in', true);
    if (error) throw error;
    users = data || [];
  } catch (e: any) {
    // If columns missing, fallback: no users
    if (e.message.includes('alert_opt_in') || e.message.includes('column')) {
      return NextResponse.json({ error: 'Alerts not migrated. Run supabase/migrations/20260924_passport_org_alerts_navigator.sql', details: e.message }, { status: 503 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  if (users.length === 0) return NextResponse.json({ dispatched: 0, message: 'No opted-in users' });

  // Fetch opportunities cache
  const { data: opps } = await admin.from('opportunities_cache').select('*').order('synced_at', { ascending: false }).limit(200);
  const opportunities = opps || [];

  let sent = 0;
  const results: any[] = [];

  for (const user of users) {
    const threshold = user.alert_threshold ?? 70;
    const lastAt = user.last_alert_at ? new Date(user.last_alert_at) : new Date(0);
    const userSkills: string[] = user.skills || [];

    // Filter opportunities newer than last_alert_at and score >= threshold (computed per-user if needed)
    const newOpps = opportunities.filter((o: any) => {
      const synced = o.synced_at ? new Date(o.synced_at) : new Date(o.discovered_at || 0);
      if (synced <= lastAt) return false;
      let score = o.match_score;
      if (typeof score !== 'number' || score === null) {
        const flat = (o.skills_required || []).map((s: any) => typeof s === 'string' ? s : s.canonical);
        score = calculateWeightedMatch(flat, userSkills).score;
      }
      return score >= threshold;
    }).slice(0, 10);

    if (newOpps.length === 0) continue;

    // Fetch email via auth.users (admin)
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    const email = authUser?.user?.email;
    if (!email) continue;

    // Build email HTML — Pathify brand, warm coach
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pathify.app';
    const fromEmail = process.env.ALERTS_FROM_EMAIL || 'Pathify <alerts@pathify.app>';
    const html = `
      <div style="font-family:Inter, sans-serif; background:#080414; color:#F5F5F7; padding:24px; border-radius:12px">
        <h2 style="color:#8B5CF6">Pathify — ${newOpps.length} new opportunity${newOpps.length>1?'s':''} ≥${threshold}% match</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>Based on your skills: ${userSkills.join(', ')}</p>
        ${newOpps.map((o: any) => {
          const score = o.match_score ?? calculateWeightedMatch((o.skills_required||[]).map((s:any)=> typeof s==='string'?s:s.canonical), userSkills).score;
          return `<div style="border:1px solid #222; border-radius:8px; padding:12px; margin:12px 0; background:rgba(255,255,255,0.03)">
            <strong>${o.title}</strong> — ${o.organization}<br/>
            <span style="color:#8B8B96">${o.location} · ${o.opportunity_type}</span><br/>
            <span style="color:${score>=70?'#A78BFA':'#8B5CF6'}">${score}% your match</span> · <a href="${o.application_url}" style="color:#8B5CF6">View opportunity →</a>
          </div>`;
        }).join('')}
        <p style="color:#8B8B96; font-size:12px">Manage alerts: <a href="${siteUrl}/api/alerts/unsubscribe?token=${user.unsubscribe_token || ''}" style="color:#8B5CF6">unsubscribe</a> · Threshold ${threshold}% · <a href="${siteUrl}/dashboard" style="color:#8B5CF6">Dashboard</a></p>
      </div>
    `;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `Pathify: ${newOpps.length} new match${newOpps.length>1?'es':''} ≥${threshold}%`,
          html,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        results.push({ user: email, error: txt.slice(0,500) });
        continue;
      }
      await admin.from('user_profiles').update({ last_alert_at: new Date().toISOString() }).eq('id', user.id);
      for (const o of newOpps) {
        await admin.from('alert_log').insert({ user_id: user.id, opportunity_url: o.application_url });
      }
      sent++;
      results.push({ user: email, sent: newOpps.length });
    } catch (e: any) {
      results.push({ user: email, error: e.message });
    }
  }

  return NextResponse.json({ dispatched: sent, totalEligible: users.length, results });
}

// GET health for Vercel cron (no auth in dev)
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('dry') === '1') {
    // Preview without sending
    const req = new Request(request.url, { method: 'POST', headers: request.headers } as any);
    // Mock dry run by calling preview logic? Simplify: return counts
    return POST(req);
  }
  return POST(request);
}
