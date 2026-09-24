import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Fallback synthetic data if table missing (customizable, African-first)
const fallbackSynthetic = [
  { display_name: 'Aisha M. — Synthetic', role: 'Product Designer', country: 'Nigeria', location: 'Lagos / Remote', skills: ['Figma','UI/UX Design','User Research'], bio: 'Synthetic demo — customizable', is_synthetic: true, opt_in: true },
  { display_name: 'Zainab K. — Synthetic', role: 'Frontend Developer', country: 'Kenya', location: 'Nairobi / Remote', skills: ['React','TypeScript','Next.js'], bio: 'Synthetic — React specialist', is_synthetic: true, opt_in: true },
  { display_name: 'Fatima A. — Synthetic', role: 'Data Scientist', country: 'Ghana', location: 'Accra / Remote', skills: ['Python','Machine Learning','Pandas'], bio: 'Synthetic — ML for impact', is_synthetic: true, opt_in: true },
  { display_name: 'Amara O. — Synthetic', role: 'AI Researcher', country: 'Rwanda', location: 'Kigali / Remote', skills: ['Python','NLP','PyTorch'], bio: 'Synthetic — NLP', is_synthetic: true, opt_in: true },
  { display_name: 'Maya K. — Synthetic (Initials)', role: 'M.K.', country: 'Kenya', location: 'Nairobi', skills: ['React','Node.js'], bio: 'Initials — privacy-preserving', is_synthetic: true, opt_in: true },
  { display_name: 'S. O. — Synthetic (Initials)', role: 'S.O.', country: 'Ghana', location: 'Accra', skills: ['Python','Data Science'], bio: 'Initials — customizable', is_synthetic: true, opt_in: true },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const skill = searchParams.get('skill');
  const location = searchParams.get('location');
  const q = searchParams.get('q');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  const supabase = await createClient();

  try {
    let query = supabase.from('synthetic_profiles').select('*').eq('opt_in', true).limit(limit).order('created_at', { ascending: false } as any);
    if (skill) {
      // Use overlaps for array contains
      query = query.overlaps('skills', [skill]);
    }
    if (location) query = query.ilike('location', `%${location}%`);
    if (q) query = query.or(`display_name.ilike.%${q}%,role.ilike.%${q}%,country.ilike.%${q}%`);
    if (skill && location) {
      // Supabase doesn't support multiple filters easily with OR; already filtered
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) return NextResponse.json(data);
    // Empty — fallback
    throw new Error('empty');
  } catch (e: any) {
    // Fallback filtering in memory for demo (best value, handles missing table/migration)
    let filtered = fallbackSynthetic;
    if (skill) filtered = filtered.filter(p => p.skills.some(s => s.toLowerCase().includes(skill.toLowerCase())));
    if (location) filtered = filtered.filter(p => p.location.toLowerCase().includes(location.toLowerCase()) || p.country.toLowerCase().includes(location.toLowerCase()));
    if (q) filtered = filtered.filter(p => `${p.display_name} ${p.role} ${p.country}`.toLowerCase().includes(q.toLowerCase()));
    // Allow customization via query ?custom=Name:Role:Country:skills
    const custom = searchParams.get('custom');
    if (custom) {
      try {
        const parts = custom.split('|');
        for (const part of parts) {
          const [name, role, country, skillsStr] = part.split(':');
          if (name) filtered.unshift({ display_name: name, role: role || 'Custom', country: country || 'Nigeria', location: `${country || 'Nigeria'} / Remote`, skills: (skillsStr || 'React').split(','), bio: 'Custom synthetic via ?custom', is_synthetic: true, opt_in: true });
        }
      } catch {}
    }
    // Include synthetic flag note
    return NextResponse.json(filtered.slice(0, limit).map((p, i) => ({ id: `synthetic-fallback-${i}`, ...p, note: 'Fallback — run supabase/migrations/20260924_passport_org_alerts_navigator.sql for persistent store' })));
  }
}
