'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, CheckCircle2, Shield, TrendingUp, Users, GraduationCap, Zap, ArrowRight, Menu, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user));
    fetch('/api/jobs').then(r=>r.json()).then(d=> { if(Array.isArray(d)) setPreview(d.slice(0,3)); }).catch(()=>{});
  }, []);

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7] selection:bg-[#8B5CF6]/30">
      {/* Header — selective glass, mobile collapse */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080414]/70 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' } as any}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] sm:min-h-[72px] flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="text-[#8B5CF6]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]"><circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 17.5L16 13"/><path d="M8 6.5L16 11"/></svg></div>
            <div><h1 className="text-[20px] sm:text-[22px] font-black tracking-tighter bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent leading-none">PATHIFY</h1><span className="text-[10px] tracking-[0.18em] uppercase text-[#A1A1AA]">By Pathfinder Labs</span></div>
          </Link>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-[#A1A1AA] hover:text-white transition-colors">Dashboard</Link>
            <Link href="/org" className="text-[#A1A1AA] hover:text-white">For Organizations</Link>
            <Link href="/dashboard" className="hidden lg:block text-xs text-[#A1A1AA] border border-white/10 rounded-full px-3 py-1">PTQ-NG-2026 — private passport</Link>
            {authUser ? <Link href="/dashboard" className="bg-white/[0.06] border border-white/[0.10] hover:bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium">Open Dashboard</Link> : <Link href="/signup" className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-[0_0_20px_rgba(139,92,246,0.3)]">Create free account</Link>}
          </nav>
          {/* Mobile hamburger */}
          <button onClick={()=>setMobileOpen(!mobileOpen)} className="sm:hidden p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/5">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="sm:hidden border-t border-white/[0.06] bg-[#080414]/95 backdrop-blur-xl px-4 py-4 space-y-3">
            <Link href="/dashboard" onClick={()=>setMobileOpen(false)} className="flex items-center justify-between py-3 text-sm border-b border-white/5">Dashboard <ArrowRight className="w-4 h-4 text-[#8B5CF6]" /></Link>
            <Link href="/org" onClick={()=>setMobileOpen(false)} className="flex items-center justify-between py-3 text-sm border-b border-white/5">For Organizations <Users className="w-4 h-4 text-[#8B8B96]" /></Link>
            <div className="pt-2">
              <p className="text-xs text-[#A1A1AA] mb-2">Your Pathify Passport — private by default</p>
              <p className="font-mono text-sm text-[#A78BFA] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">PTQ-NG-2026-XXXX <span className="text-[#A1A1AA] text-xs">· Shareable as pathify.app/p/helen-oyiza</span></p>
            </div>
            {authUser ? <Link href="/dashboard" onClick={()=>setMobileOpen(false)} className="block bg-white/[0.06] border border-white/10 text-center py-3 rounded-full font-medium">Open Dashboard</Link> : <Link href="/signup" onClick={()=>setMobileOpen(false)} className="block bg-[#8B5CF6] text-center py-3 rounded-full font-bold">Create free account</Link>}
          </div>
        )}
      </header>

      {/* Hero — warm coach, premium */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-8">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-full px-3 py-1"><span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" /> Opportunity Intelligence — African-first, globally connected</p>
          <h2 className="mt-4 text-[28px] sm:text-[40px] font-black tracking-tight leading-[0.95]">Find jobs, fellowships & funding <span className="bg-gradient-to-r from-[#A78BFA] to-[#8B5CF6] bg-clip-text text-transparent">matched to your skills</span></h2>
          <p className="mt-3 text-[15px] sm:text-[17px] leading-relaxed text-[#A1A1AA] max-w-prose">Pathify scans trusted sources, understands how opportunities connect to your skills and goals, and shows you what to learn next — not just what exists.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link href="/signup" className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-6 py-3.5 rounded-full font-bold text-sm text-center shadow-[0_8px_32px_rgba(139,92,246,0.35)]">Create your Pathify Passport</Link>
            <Link href="/dashboard" className="bg-white/[0.06] border border-white/[0.10] hover:bg-white/10 text-white px-6 py-3.5 rounded-full font-medium text-sm text-center">Explore opportunities — hourly updates</Link>
          </div>
          <p className="mt-3 text-xs text-[#8B8B96]">Private by default · PTQ-NG-2026-XXXX · Share only when you choose at <span className="text-[#A78BFA]">pathify.app/p/helen-oyiza</span></p>
        </div>
        {/* Hero search — goes to dashboard */}
        <div className="mt-8 max-w-2xl bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-4 shadow-xl">
          <p className="text-xs tracking-widest uppercase text-[#A1A1AA] mb-2">Try searching</p>
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96]" /><input placeholder="e.g. React, Fellowship Lagos, Python remote" className="w-full bg-black/30 border border-white/10 rounded-full pl-10 pr-4 h-11 text-sm placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20" onKeyDown={e=>{ if(e.key==='Enter'){ const v=(e.target as HTMLInputElement).value; window.location.href=`/dashboard?q=${encodeURIComponent(v)}`; }}} /></div>
            <Link href="/dashboard" className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-5 h-11 inline-flex items-center rounded-full font-bold text-sm shrink-0">Find <ArrowRight className="w-4 h-4 ml-1" /></Link>
          </div>
          <p className="text-xs text-[#8B8B96] mt-2">Examples: <span className="text-[#A1A1AA]">“React in Nairobi” · “Fellowship for designers” · “Data science remote”</span></p>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h3 className="text-sm tracking-widest uppercase text-[#A1A1AA]">How Pathify works</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {icon: Users, title: 'Add your skills', desc: '3–8 skills, goals, location. Your PTQ passport stays private until you share.'},
            {icon: Zap, title: 'We scan trusted sources', desc: 'YC Jobs, Work at a Startup, Devpost, OpportunityDesk, Eventbrite — hourly.'},
            {icon: TrendingUp, title: 'See your fit + next to learn', desc: 'Strong match you cover 8/10 · Next to learn Docker & AWS — not “Missing”.'},
            {icon: Shield, title: 'Save, alert, apply', desc: 'Save opportunities, get weekly email matches ≥70%, apply on source site.'},
          ].map(s => (
            <div key={s.title} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5">
              <s.icon className="w-5 h-5 text-[#8B5CF6] mb-3" />
              <p className="font-semibold text-sm">{s.title}</p>
              <p className="text-sm text-[#A1A1AA] leading-relaxed mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live preview — restrained glass cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Live opportunities — preview</h3>
          <Link href="/dashboard" className="text-sm text-[#8B5CF6] hover:text-[#A78BFA]">View all →</Link>
        </div>
        <p className="text-sm text-[#A1A1AA] mt-1">Curated from trusted sources. Updated hourly. Scored for you.</p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(preview.length?preview:[{title:'Senior Full-Stack Engineer', organization:'Andela Global', location:'Remote', opportunity_type:'Remote Job', skills_required:['React','TypeScript'], match_score:82, verification_status:'high', application_url:'#', source_domain:'andela.com'}, {title:'AI/ML Fellowship', organization:'DeepLearning Hub', location:'Remote', opportunity_type:'Fellowship', skills_required:['Python','Machine Learning'], match_score:68, verification_status:'high', application_url:'#', source_domain:'example.com'}, {title:'React Hackathon Lagos', organization:'Devpost', location:'Lagos', opportunity_type:'Hackathon', skills_required:['React','Next.js'], match_score:75, verification_status:'high', application_url:'#', source_domain:'devpost.com'}]).map((opp:any,i)=> (
            <div key={i} className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35)] flex flex-col">
              <p className="text-[11px] tracking-widest uppercase text-[#A1A1AA]">{opp.opportunity_type?.replace('_',' ')}</p>
              <p className="font-semibold mt-1 line-clamp-2">{opp.title}</p>
              <p className="text-xs text-[#A1A1AA] mt-1">{opp.organization} · {opp.location}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${opp.match_score>=70?'bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/20':'bg-white/[0.06] text-[#A1A1AA] border-white/10'}`}>{opp.match_score ?? 0}% your match</span>
                <span className="text-xs text-[#10B981] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{opp.verification_status==='high'?'Verified':'Check details'}</span>
              </div>
              <a href={opp.application_url} target="_blank" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#8B5CF6] hover:text-[#A78BFA]">View opportunity <ArrowRight className="w-3.5 h-3.5" /></a>
            </div>
          ))}
        </div>
      </section>

      {/* Passport + Navigator + Org tease */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-6">
          <Shield className="w-5 h-5 text-[#8B5CF6]" />
          <h4 className="font-semibold mt-2">Your Pathify Passport</h4>
          <p className="text-sm text-[#A1A1AA] leading-relaxed mt-1">Private by default. Share only when you choose. Career intelligence from someone who has your back — not a cheerleader.</p>
          <p className="font-mono text-sm text-[#A78BFA] bg-black/30 border border-white/10 rounded-lg px-3 py-2 mt-3">PTQ-NG-2026-XXXX <span className="text-xs text-[#A1A1AA]">→ pathify.app/p/helen-oyiza</span></p>
          <Link href="/signup" className="inline-block mt-3 text-sm font-bold text-[#8B5CF6]">Create passport →</Link>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
          <Zap className="w-5 h-5 text-[#A78BFA]" />
          <h4 className="font-semibold mt-2">Pathify Navigator</h4>
          <p className="text-sm text-[#A1A1AA] mt-1">Ask in plain English. Deterministic over structured data.</p>
          <p className="text-xs bg-black/20 border border-white/5 rounded-lg p-3 mt-3">“Remote fellowship for Python designer in Lagos”</p>
          <Link href="/dashboard" className="inline-block mt-3 text-sm text-[#8B5CF6]">Try in Dashboard →</Link>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
          <Users className="w-5 h-5 text-[#8B8B96]" />
          <h4 className="font-semibold mt-2">For Organizations — Preview</h4>
          <p className="text-sm text-[#A1A1AA] mt-1">Search opt-in previews by skill and location. African-first, globally usable.</p>
          <p className="text-xs text-[#A78BFA] mt-2">Synthetic demo — separate from real members</p>
          <Link href="/org" className="inline-block mt-3 text-sm text-[#8B5CF6]">Explore talent →</Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-[#A1A1AA]">
          <p>Pathify by Pathfinder Labs — Opportunity intelligence, not a motivational app.</p>
          <p className="text-xs text-[#8B8B96] mt-1">Curated from trusted sources. Updated hourly. Your profile stays private until you share.</p>
          <p className="text-xs mt-2"><Link href="/dashboard" className="text-[#8B5CF6]">Dashboard</Link> · <Link href="/org" className="text-[#8B5CF6]">Organizations</Link> · <Link href="/login" className="text-[#8B5CF6]">Sign in</Link></p>
        </div>
      </footer>
    </div>
  );
}
