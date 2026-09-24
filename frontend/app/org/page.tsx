'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, MapPin, Users, Shield, Filter } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function OrgPage() {
  const [skill, setSkill] = useState('');
  const [location, setLocation] = useState('');
  const [q, setQ] = useState('');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTalent = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (skill) params.set('skill', skill);
    if (location) params.set('location', location);
    if (q) params.set('q', q);
    params.set('limit', '20');
    try {
      const r = await fetch(`/api/org/talent?${params.toString()}`);
      const d = await r.json();
      setProfiles(Array.isArray(d) ? d : []);
    } catch { setProfiles([]); }
    setLoading(false);
  };

  useEffect(() => { fetchTalent(); }, []);

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7]">
      <header className="border-b border-white/[0.08] bg-[#080414]/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 text-[#8B5CF6] font-black tracking-tighter text-sm">← PATHIFY</Link>
          <span className="text-xs sm:text-sm text-[#A1A1AA]">For Organizations · Preview — sample profiles only</span>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 text-xs sm:text-sm text-amber-200 leading-relaxed">
          <Shield className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Sample data only — these are opt-in preview profiles. Real Pathify members are never shared without explicit consent. Preview is customizable for your pilot.
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Discover talent — preview</h1>
        <p className="text-sm sm:text-[15px] text-[#A1A1AA] mt-1 leading-relaxed max-w-prose">Search opt-in previews by skill and location. Built African-first, designed for global teams. Add your own sample profiles for a tailored demo.</p>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96]" /><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name/role/country" className="w-full h-11 bg-white/[0.05] border border-white/[0.10] rounded-full pl-10 pr-3 text-base sm:text-sm placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6]" /></div>
          <div className="relative"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96]" /><input value={skill} onChange={e=>setSkill(e.target.value)} placeholder="Skill e.g. React, Python" className="w-full h-11 bg-white/[0.05] border border-white/[0.10] rounded-full pl-10 pr-3 text-base sm:text-sm placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6]" /></div>
          <div className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96]" /><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Location e.g. Lagos, Nairobi" className="w-full h-11 bg-white/[0.05] border border-white/[0.10] rounded-full pl-10 pr-3 text-base sm:text-sm placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6]" /></div>
        </div>
        <button onClick={fetchTalent} className="mt-3 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold px-5 h-11 rounded-full shadow-[0_0_16px_rgba(139,92,246,0.25)]">Search</button>
        <span className="ml-3 text-xs text-[#A1A1AA]">{profiles.length} preview{profiles.length!==1?'s':''}</span>

        {loading ? <p className="text-sm text-[#A1A1AA] mt-6">Finding preview profiles…</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-6">
            {profiles.map((p, i) => (
              <div key={p.id || i} className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-semibold truncate">{p.display_name.replace(' — Synthetic','').replace(' (Synthetic)','')}</p><p className="text-xs text-[#A1A1AA]">{p.role} · {p.country}</p><p className="text-xs text-[#8B8B96]">{p.location}</p></div>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[#A1A1AA] shrink-0">Preview</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(p.skills || []).map((s:string) => <span key={s} className="px-2.5 py-1 text-xs leading-none rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">{s}</span>)}
                </div>
                {p.bio && <p className="text-xs text-[#A1A1AA] mt-2 leading-relaxed line-clamp-2">{p.bio.replace('Synthetic demo','Preview').replace('is_synthetic','preview')}</p>}
                <p className="text-[11px] text-[#8B8B96] mt-2">Preview profile — opt-in for demo</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <p className="text-xs text-[#A1A1AA] leading-relaxed">All previews are synthetic and separate from real Pathify members. For real sourcing, members must opt in to be discoverable — coming next.</p>
          <details className="mt-2 text-xs text-[#8B8B96]"><summary className="cursor-pointer text-[#8B5CF6]">Customize preview →</summary><p className="mt-1">Add <code className="bg-black/30 px-1 rounded">?custom=Name:Role:Country:skill1,skill2|...</code> to URL or edit <code className="bg-black/30 px-1 rounded">supabase/migrations/20260924_passport_org_alerts_navigator.sql</code></p></details>
        </div>
      </main>
    </div>
  );
}
