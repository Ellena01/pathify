import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin.from('user_profiles').select('id').eq('unsubscribe_token', token).single();
  if (error || !data) return new NextResponse('<h1>Invalid or expired unsubscribe link</h1>', { status: 404, headers: { 'Content-Type': 'text/html' } });

  await admin.from('user_profiles').update({ alert_opt_in: false }).eq('id', data.id);
  return new NextResponse(`<html><body style="font-family:Inter,sans-serif;background:#080414;color:#F5F5F7;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;max-width:480px;text-align:center"><h1 style="color:#8B5CF6">Unsubscribed</h1><p style="color:#A1A1AA">You will no longer receive Pathify alerts. You can re-enable them in your dashboard.</p><a href="/dashboard" style="display:inline-block;margin-top:16px;color:#8B5CF6">← Back to Pathify</a></div></body></html>`, { headers: { 'Content-Type': 'text/html' } });
}
