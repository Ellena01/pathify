import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const NO_STORE = { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex' } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pathify — Alerts</title></head>` +
      `<body style="margin:0;background:#080414;color:#f5f5f7;font-family:Inter,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } }
  );
}

/**
 * GET /api/alerts/unsubscribe
 *
 * The unsubscribe token lives in the query string, so this must never be
 * cached by a browser, proxy, or corporate mail gateway — hence `no-store`
 * plus `noindex`. Email clients and security scanners aggressively prefetch
 * links, which is why the state change is idempotent and the page states
 * plainly that no further action is needed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  // Validate shape before hitting the database — the column is a uuid, so
  // anything else is either a typo or an enumeration attempt.
  if (!token || !UUID_RE.test(token)) {
    return html(
      `<div style="max-width:420px;padding:32px;border:1px solid rgba(255,255,255,0.1);border-radius:16px;text-align:center">
         <h1 style="font-size:20px;margin:0 0 8px">Link not valid</h1>
         <p style="color:#a1a1aa;font-size:14px;line-height:1.6">This unsubscribe link is malformed or has already been used. You can manage alerts from your dashboard.</p>
         <a href="/dashboard" style="display:inline-block;margin-top:20px;color:#8b5cf6">Go to dashboard</a>
       </div>`,
      400
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from('user_profiles')
    .select('id')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (error) {
    return html(
      `<div style="max-width:420px;padding:32px;border:1px solid rgba(255,255,255,0.1);border-radius:16px;text-align:center">
         <h1 style="font-size:20px;margin:0 0 8px">Something went wrong</h1>
         <p style="color:#a1a1aa;font-size:14px">We could not process that link. Please try again from your dashboard.</p>
         <a href="/dashboard" style="display:inline-block;margin-top:20px;color:#8b5cf6">Go to dashboard</a>
       </div>`,
      500
    );
  }

  if (!data) {
    return html(
      `<div style="max-width:420px;padding:32px;border:1px solid rgba(255,255,255,0.1);border-radius:16px;text-align:center">
         <h1 style="font-size:20px;margin:0 0 8px">Link not recognised</h1>
         <p style="color:#a1a1aa;font-size:14px;line-height:1.6">This unsubscribe link is no longer active. Your alert preferences are unchanged.</p>
         <a href="/dashboard" style="display:inline-block;margin-top:20px;color:#8b5cf6">Manage alerts</a>
       </div>`,
      404
    );
  }

  await admin
    .from('user_profiles')
    .update({ alert_opt_in: false, last_alert_at: new Date().toISOString() })
    .eq('id', data.id);

  return html(
    `<div style="max-width:420px;padding:32px;border:1px solid rgba(255,255,255,0.1);border-radius:16px;text-align:center">
       <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8b5cf6;font-weight:600">Pathify</div>
       <h1 style="font-size:20px;margin:16px 0 8px">You are unsubscribed</h1>
       <p style="color:#a1a1aa;font-size:14px;line-height:1.6">Daily match digests are now off. You can turn them back on at any time from your dashboard.</p>
       <a href="/dashboard" style="display:inline-block;margin-top:20px;color:#8b5cf6">Back to Pathify</a>
     </div>`
  );
}

export async function POST(request: Request) {
  return GET(request);
}
