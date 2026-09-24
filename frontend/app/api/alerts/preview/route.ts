import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { calculateWeightedMatch } from '@/app/utils/score';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threshold = parseInt(searchParams.get('threshold') || '70', 10);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userSkills: string[] | null = null;
  if (user) {
    const { data: profile } = await supabase.from('user_profiles').select('skills').eq('id', user.id).single();
    if (profile?.skills) userSkills = profile.skills;
  }

  // Fetch from cache
  let opportunities: any[] = [];
  try {
    const { data, error } = await supabase.from('opportunities_cache').select('*').order('discovered_at', { ascending: false }).limit(200);
    if (error) throw error;
    opportunities = data || [];
  } catch (e: any) {
    // Fallback if table missing — try Apify via /api/jobs logic? Just return empty with error
    return NextResponse.json({ error: 'Cache not ready. Run supabase/migrations/20260924_passport_org_alerts_navigator.sql', details: e?.message, opportunities: [] }, { status: 200 });
  }

  // Filter by threshold — if match_score exists use it, else compute per-user if skills available
  const filtered = opportunities.filter((opp: any) => {
    let score = opp.match_score;
    if (typeof score !== 'number' || score === null) {
      if (userSkills) {
        const req = Array.isArray(opp.skills_required) ? opp.skills_required : [];
        // Handle both flat and rich
        const flat = req.map((s: any) => typeof s === 'string' ? s : s.canonical).filter(Boolean);
        score = calculateWeightedMatch(flat, userSkills).score;
      } else {
        score = 0;
      }
    }
    return score >= threshold;
  }).slice(0, 50);

  // Annotate computed score if needed
  const annotated = filtered.map((opp: any) => {
    if (typeof opp.match_score !== 'number' && userSkills) {
      const flat = (opp.skills_required || []).map((s: any) => typeof s === 'string' ? s : s.canonical);
      opp._computed_score = calculateWeightedMatch(flat, userSkills).score;
    }
    return opp;
  });

  return NextResponse.json({ threshold, count: annotated.length, opportunities: annotated, userSkills: userSkills || null });
}
