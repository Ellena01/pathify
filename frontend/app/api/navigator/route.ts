import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { calculateWeightedMatch } from '@/app/utils/score';

// Deterministic slot parser — no agentic planner
const TYPE_KEYWORDS: Record<string, string[]> = {
  jobs_remote: ['remote job', 'remote jobs', 'remote', 'work from home'],
  jobs_hybrid: ['hybrid job', 'hybrid'],
  jobs_onsite: ['on-site', 'onsite', 'on site job'],
  internships: ['internship', 'intern', 'internships'],
  hackathons: ['hackathon', 'hackathons', 'hack'],
  fellowships: ['fellowship', 'fellowships', 'fellow'],
  scholarships: ['scholarship', 'scholarships', 'bursary'],
  grants: ['grant', 'grants', 'funding', 'fund'],
  conferences: ['conference', 'conferences', 'summit'],
  events: ['event', 'events', 'meetup'],
  startup_funding: ['startup funding', 'startup', 'funding'],
};

const SKILL_ALIASES: Record<string, string[]> = {
  React: ['react', 'react.js', 'reactjs', 'next.js', 'nextjs'],
  Python: ['python', 'python3'],
  'Machine Learning': ['machine learning', 'ml', 'scikit-learn', 'sklearn'],
  'Data Science': ['data science', 'data analytics'],
  TypeScript: ['typescript', 'ts'],
  'UI/UX Design': ['ui/ux', 'ui/ux design', 'product design', 'figma'],
};

function parseSlots(message: string) {
  const lower = (message || '').toLowerCase();
  const slots: any = {};
  // type
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) { slots.opportunity_type = type; break; }
  }
  // skills
  const skills: string[] = [];
  for (const [canon, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.some(a => lower.includes(a)) || lower.includes(canon.toLowerCase())) skills.push(canon);
  }
  if (skills.length) slots.skills = skills;
  // location
  if (lower.includes('lagos')) slots.location = 'Lagos';
  else if (lower.includes('nairobi')) slots.location = 'Nairobi';
  else if (lower.includes('kenya')) slots.location = 'Kenya';
  else if (lower.includes('nigeria')) slots.location = 'Nigeria';
  else if (lower.includes('remote')) slots.location = 'Remote';
  else if (lower.includes('global')) slots.location = 'Global';
  // time — not stored but keep
  if (lower.includes('today') || lower.includes('this week')) slots.timeframe = 'recent';
  return slots;
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const message = body.message || body.query || '';
  const userSkills: string[] = body.userSkills || [];
  const slots = { ...parseSlots(message), ...(body.filters || {}) };

  const supabase = await createClient();

  let query = supabase.from('opportunities_cache').select('*').limit(50).order('discovered_at', { ascending: false } as any);

  if (slots.opportunity_type) query = query.eq('opportunity_type', slots.opportunity_type);
  if (slots.location) query = query.ilike('location', `%${slots.location}%`);
  // skills overlap — need to filter after fetch if using GIN not simple
  // We'll fetch then filter in JS for deterministic
  const { data, error } = await query;
  if (error) {
    if (error.message.includes('does not exist')) {
      return NextResponse.json({ error: 'Cache not ready. Run supabase/migrations/20260924_passport_org_alerts_navigator.sql', slots, opportunities: [] }, { status: 200 });
    }
    return NextResponse.json({ error: error.message, slots }, { status: 500 });
  }

  let filtered = data || [];
  if (slots.skills && slots.skills.length) {
    const lowerWanted = slots.skills.map((s: string) => s.toLowerCase());
    filtered = filtered.filter((opp: any) => {
      const req = (opp.skills_required || []).map((s: any) => (typeof s === 'string' ? s : s.canonical).toLowerCase());
      return lowerWanted.some((w: string) => req.some((r: string) => r.includes(w) || w.includes(r)));
    });
  }

  // Rank by weighted match if userSkills provided
  if (userSkills.length > 0) {
    filtered = filtered.map((opp: any) => {
      const flat = (opp.skills_required || []).map((s: any) => typeof s === 'string' ? s : s.canonical);
      const { score } = calculateWeightedMatch(flat, userSkills);
      return { ...opp, _navigator_score: score };
    }).sort((a: any, b: any) => (b._navigator_score || 0) - (a._navigator_score || 0));
  }

  filtered = filtered.slice(0, 20);

  // Generate explanation (deterministic, not LLM hallucination)
  const explanation = filtered.length
    ? `Found ${filtered.length} opportunities for "${message}" ${slots.opportunity_type ? `(type=${slots.opportunity_type})` : ''} ${slots.skills ? `skills ${slots.skills.join(', ')}` : ''} ${slots.location ? `location ${slots.location}` : ''}. Ranked by ${userSkills.length ? `your skills (${userSkills.join(', ')})` : 'recency'}.`
    : `No matches for "${message}". Try broader: e.g. "remote fellowship python" or "hackathon react".`;

  return NextResponse.json({ slots, explanation, opportunities: filtered, count: filtered.length });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || searchParams.get('message') || '';
  return POST(new Request(request.url, { method: 'POST', body: JSON.stringify({ message: q }), headers: { 'Content-Type': 'application/json' } } as any));
}
