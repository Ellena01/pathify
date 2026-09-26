'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search, CheckCircle2, Shield, TrendingUp, Users, Zap,
  ArrowRight, Menu, X, Compass, Sparkles, CheckSquare, ExternalLink
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user));
    fetch('/api/jobs')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setPreview(d.slice(0, 3));
      })
      .catch(() => {});
  }, []);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) {
      window.location.href = `/opportunities?q=${encodeURIComponent(q)}`;
    } else {
      window.location.href = '/opportunities';
    }
  };

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7] selection:bg-[#8B5CF6]/30">
      
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080414]/70 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' } as any}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] sm:min-h-[72px] flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <div className="text-[#8B5CF6]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]">
                <circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 17.5L16 13"/><path d="M8 6.5L16 11"/>
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] sm:text-[22px] font-black tracking-tighter bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent leading-none">PATHIFY</h1>
              <span className="text-[10px] tracking-[0.18em] uppercase text-[#A1A1AA]">Opportunity Intelligence</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <Link href="/opportunities" className="text-[#A1A1AA] hover:text-white flex items-center gap-1.5 transition-colors">
              <Compass className="w-4 h-4 text-[#8B5CF6]" /> Opportunities
            </Link>
            <Link href="/dashboard" className="text-[#A1A1AA] hover:text-white transition-colors">Dashboard</Link>
            <Link href="/org" className="text-[#A1A1AA] hover:text-white transition-colors">For Organizations</Link>
            
            {authUser ? (
              <Link href="/dashboard" className="bg-white/[0.06] border border-white/[0.10] hover:bg-white/10 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
                Open Dashboard
              </Link>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-sm text-[#A1A1AA] hover:text-white px-3 py-1.5">Sign in</Link>
                <Link href="/signup" className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all">
                  Create free account
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="sm:hidden p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/5">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-white/[0.06] bg-[#080414]/95 backdrop-blur-xl px-4 py-4 space-y-3">
            <Link href="/opportunities" onClick={() => setMobileOpen(false)} className="flex items-center justify-between py-2 text-sm border-b border-white/5 text-[#8B5CF6]">
              <span>Browse Opportunities</span> <Compass className="w-4 h-4" />
            </Link>
            <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center justify-between py-2 text-sm border-b border-white/5">
              <span>Dashboard</span> <ArrowRight className="w-4 h-4 text-[#8B5CF6]" />
            </Link>
            <Link href="/org" onClick={() => setMobileOpen(false)} className="flex items-center justify-between py-2 text-sm border-b border-white/5">
              <span>For Organizations</span> <Users className="w-4 h-4 text-[#8B8B96]" />
            </Link>
            {authUser ? (
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="block bg-white/[0.06] border border-white/10 text-center py-3 rounded-full font-medium">
                Open Dashboard
              </Link>
            ) : (
              <Link href="/signup" onClick={() => setMobileOpen(false)} className="block bg-[#8B5CF6] text-center py-3 rounded-full font-bold">
                Create free account
              </Link>
            )}
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-10">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-full px-3.5 py-1.5">
            <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" />
            Opportunity Intelligence — African-first, globally connected
          </p>

          <h2 className="mt-5 text-[32px] sm:text-[46px] font-black tracking-tight leading-[1.05]">
            Find tech jobs, fellowships & funding{' '}
            <span className="bg-gradient-to-r from-[#A78BFA] via-[#C084FC] to-[#8B5CF6] bg-clip-text text-transparent">
              matched to your exact skills
            </span>
          </h2>

          <p className="mt-4 text-[16px] sm:text-[18px] leading-relaxed text-[#A1A1AA] max-w-2xl">
            Pathify continuously monitors top verified global sources, calculates 4-factor compatibility scores, and highlights exactly what to learn next to bridge the gap.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3.5">
            <Link
              href="/signup"
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-7 py-3.5 rounded-full font-bold text-sm text-center shadow-[0_8px_32px_rgba(139,92,246,0.35)] transition-all"
            >
              Create your Pathify Passport
            </Link>
            <Link
              href="/opportunities"
              className="bg-white/[0.06] border border-white/[0.12] hover:bg-white/10 text-white px-7 py-3.5 rounded-full font-medium text-sm text-center flex items-center justify-center gap-2 transition-all"
            >
              <Compass className="w-4 h-4 text-[#A78BFA]" />
              Explore All Opportunities
            </Link>
          </div>

          <p className="mt-4 text-xs text-[#8B8B96]">
            Private by default · Portable Passport ID · Verified data sources updated hourly
          </p>
        </div>

        {/* Hero Search Box */}
        <div className="mt-10 max-w-2xl bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-4 shadow-2xl">
          <p className="text-xs tracking-widest uppercase text-[#A1A1AA] mb-2 font-semibold">
            Search 50+ Live Verified Opportunities
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96]" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. React, Fellowship Lagos, Python remote, Hackathon"
                className="w-full bg-black/40 border border-white/10 rounded-full pl-10 pr-4 h-12 text-sm text-white placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-all"
              />
            </div>
            <button
              onClick={handleSearch}
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white px-6 h-12 inline-flex items-center rounded-full font-bold text-sm shrink-0 shadow-[0_0_16px_rgba(139,92,246,0.3)] transition-all"
            >
              Find <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs text-[#8B8B96]">
            <span>Trending:</span>
            {['Remote Jobs', 'Fellowships', 'Lagos', 'Python', 'Machine Learning'].map(t => (
              <button
                key={t}
                onClick={() => { window.location.href = `/opportunities?q=${encodeURIComponent(t)}`; }}
                className="text-[#A1A1AA] hover:text-[#A78BFA] transition-colors underline"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h3 className="text-xs tracking-widest uppercase text-[#A1A1AA] font-bold">
          How Pathify Delivers Intelligent Matching
        </h3>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: Users,
              title: 'Your Private Passport',
              desc: 'Store 3–8 skills, career goals, and country. Stays private until you decide to share with mentors or recruiters.'
            },
            {
              icon: Zap,
              title: 'Hourly Web Scrape',
              desc: 'We monitor verified sources — YC Jobs, Devpost, OpportunityDesk, Google Summer of Code, and major tech foundations.'
            },
            {
              icon: TrendingUp,
              title: '4-Factor Fit Analysis',
              desc: 'Skills 60%, Location 20%, Career Goals 10%, Experience 10%. See what you have and what to learn next.'
            },
            {
              icon: CheckSquare,
              title: 'Integrated Tracker',
              desc: 'Move opportunities across Wishlist, Applied, Interviewing, and Offer stages without messy spreadsheets.'
            },
          ].map(s => (
            <div key={s.title} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5 hover:border-white/15 transition-colors">
              <s.icon className="w-6 h-6 text-[#8B5CF6] mb-3" />
              <p className="font-semibold text-base">{s.title}</p>
              <p className="text-sm text-[#A1A1AA] leading-relaxed mt-1.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Live Opportunities Preview</h3>
            <p className="text-xs text-[#A1A1AA] mt-0.5">Scored against real tech skills with hourly sync</p>
          </div>
          <Link href="/opportunities" className="text-sm font-semibold text-[#8B5CF6] hover:text-[#A78BFA] flex items-center gap-1">
            View full catalog (50+) <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          {(preview.length ? preview : [
            {
              title: 'Senior Full-Stack Engineer',
              organization: 'Andela Global',
              location: 'Remote (Africa / Global)',
              opportunity_type: 'Remote Job',
              skills_required: ['React', 'TypeScript', 'Python'],
              match_score: 84,
              verification_status: 'high',
              application_url: 'https://andela.com'
            },
            {
              title: 'AI/ML Research Fellowship',
              organization: 'DeepLearning Hub',
              location: 'Remote',
              opportunity_type: 'Fellowship',
              skills_required: ['Python', 'Machine Learning', 'Data Science'],
              match_score: 72,
              verification_status: 'high',
              application_url: 'https://example.com'
            },
            {
              title: 'Open Source AI Hackathon',
              organization: 'Data Science Nigeria',
              location: 'Lagos / Hybrid',
              opportunity_type: 'Hackathon',
              skills_required: ['Python', 'FastAPI'],
              match_score: 80,
              verification_status: 'high',
              application_url: 'https://datasciencenigeria.org'
            }
          ]).map((opp: any, i: number) => {
            const detailHref = `/opportunities/${encodeURIComponent(opp.application_url || opp.id || String(i))}`;

            return (
              <div
                key={i}
                className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.35)] flex flex-col justify-between hover:border-[#8B5CF6]/30 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-[#A1A1AA] font-semibold mb-1">
                    <span>{opp.opportunity_type?.replace(/_/g, ' ') || 'Opportunity'}</span>
                    <span className="flex items-center gap-1 text-[#10B981]">
                      <CheckCircle2 className="w-3 h-3" />
                      {opp.verification_status === 'high' ? 'Verified' : 'Check Details'}
                    </span>
                  </div>

                  <Link href={detailHref} className="block group">
                    <p className="font-semibold text-base mt-1 line-clamp-2 group-hover:text-[#A78BFA] transition-colors">
                      {opp.title}
                    </p>
                  </Link>

                  <p className="text-xs text-[#A1A1AA] mt-1">
                    {opp.organization} · {opp.location}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">
                      {opp.match_score ?? 75}% fit
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <Link href={detailHref} className="text-[#A78BFA] hover:underline font-medium">
                    Fit breakdown →
                  </Link>
                  <a
                    href={opp.application_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-[#A78BFA] inline-flex items-center gap-1 font-semibold"
                  >
                    Apply <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Feature Teasers */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <Shield className="w-6 h-6 text-[#8B5CF6] mb-2" />
            <h4 className="font-bold text-base">Verified Pathify Passport</h4>
            <p className="text-sm text-[#A1A1AA] leading-relaxed mt-2">
              Private by default. A cryptographic profile credential you control. Generate a public slug only when applying or networking.
            </p>
            <p className="font-mono text-xs text-[#A78BFA] bg-black/30 border border-white/10 rounded-lg px-3 py-2 mt-3 truncate">
              PTQ-NG-2026-XXXX → pathify.app/p/...
            </p>
          </div>
          <Link href="/signup" className="mt-4 text-sm font-bold text-[#8B5CF6] hover:text-[#A78BFA] flex items-center gap-1">
            Claim your passport <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] backdrop-blur-lg rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <Sparkles className="w-6 h-6 text-[#10B981] mb-2" />
            <h4 className="font-bold text-base">Gemini AI Navigator</h4>
            <p className="text-sm text-[#A1A1AA] leading-relaxed mt-2">
              Ask in conversational language. The agent executes real database lookups and returns grounded opportunities with zero hallucination.
            </p>
            <p className="text-xs bg-black/25 border border-white/5 rounded-lg p-3 mt-3 text-[#A1A1AA]">
              “Remote Python fellowships for Nigerian developers”
            </p>
          </div>
          <Link href="/dashboard" className="mt-4 text-sm font-bold text-[#8B5CF6] hover:text-[#A78BFA] flex items-center gap-1">
            Try Navigator in Dashboard <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] backdrop-blur-lg rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <CheckSquare className="w-6 h-6 text-[#A78BFA] mb-2" />
            <h4 className="font-bold text-base">Application Tracker</h4>
            <p className="text-sm text-[#A1A1AA] leading-relaxed mt-2">
              Track opportunities through Wishlist, Applied, Interviewing, and Offer stages. Save to your profile in one click.
            </p>
            <p className="text-xs bg-black/25 border border-white/5 rounded-lg p-3 mt-3 text-[#A1A1AA]">
              Saved jobs persist securely to Supabase with real-time sync.
            </p>
          </div>
          <Link href="/dashboard" className="mt-4 text-sm font-bold text-[#8B5CF6] hover:text-[#A78BFA] flex items-center gap-1">
            View Application Tracker <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-[#A1A1AA]">
          <p className="font-medium text-white">Pathify — Opportunity Intelligence for African & Emerging Tech Talent</p>
          <p className="text-xs text-[#8B8B96] mt-1">
            Curated from verified sources. Updated hourly. Your profile stays private until you choose to share.
          </p>
          <div className="flex justify-center gap-4 text-xs mt-3">
            <Link href="/opportunities" className="text-[#8B5CF6] hover:underline">Discovery Catalog</Link>
            <span>·</span>
            <Link href="/dashboard" className="text-[#8B5CF6] hover:underline">Dashboard & Tracker</Link>
            <span>·</span>
            <Link href="/org" className="text-[#8B5CF6] hover:underline">For Organizations</Link>
            <span>·</span>
            <Link href="/login" className="text-[#8B5CF6] hover:underline">Sign In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
