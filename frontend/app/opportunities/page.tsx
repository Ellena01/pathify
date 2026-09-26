'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search, Filter, CheckCircle2, AlertCircle, Bookmark, ArrowRight,
  MapPin, Calendar, Building2, Zap, X, ChevronDown, SlidersHorizontal,
  Briefcase, GraduationCap, Code2, Award, Globe, Users
} from 'lucide-react';
import { useUserStore } from '../store';
import { calculateFullMatch, getOpportunityKey } from '../utils/score';
import { createClient } from '@/utils/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { VerticalFitSlider } from '@/components/visual/VerticalFitSlider';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types', icon: Globe },
  { value: 'jobs_remote', label: 'Remote Jobs', icon: Globe },
  { value: 'jobs_hybrid', label: 'Hybrid', icon: Briefcase },
  { value: 'jobs_onsite', label: 'On-site', icon: MapPin },
  { value: 'internships', label: 'Internships', icon: Briefcase },
  { value: 'fellowships', label: 'Fellowships', icon: Award },
  { value: 'scholarships', label: 'Scholarships', icon: GraduationCap },
  { value: 'grants', label: 'Grants', icon: Award },
  { value: 'startup_funding', label: 'Startup Funding', icon: Zap },
  { value: 'hackathons', label: 'Hackathons', icon: Code2 },
  { value: 'conferences', label: 'Conferences', icon: Users },
  { value: 'events', label: 'Events', icon: Users },
];

const MATCH_OPTIONS = [
  { value: 0, label: 'All matches' },
  { value: 40, label: '40%+ match' },
  { value: 60, label: '60%+ match' },
  { value: 80, label: '80%+ match' },
];

const SORT_OPTIONS = [
  { value: 'match', label: 'Best match' },
  { value: 'newest', label: 'Newest first' },
  { value: 'deadline', label: 'Deadline first' },
];

function typeLabel(t: string) {
  return (t || 'opportunity').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function MatchRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * score) / 100;
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#A78BFA' : score >= 40 ? '#8B5CF6' : '#525252';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="3.5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

function OpportunityCard({ opp, score, matched, gap, explanation, isSaved, onSave }: any) {
  const jobKey = getOpportunityKey(opp);
  const displayType = typeLabel(opp.opportunity_type || '');
  const domain = opp.source_domain || (() => {
    try { return new URL(opp.application_url || '').hostname.replace('www.', ''); } catch { return ''; }
  })();

  return (
    <Link
      href={`/opportunities/${encodeURIComponent(jobKey)}`}
      className="group bg-white/[0.05] border border-white/[0.10] rounded-2xl flex flex-col overflow-hidden hover:border-[#8B5CF6]/40 hover:bg-white/[0.07] transition-all duration-200 shadow-[0_4px_24px_rgba(0,0,0,0.3)] cursor-pointer"
    >
      {/* Card header */}
      <div className="p-5 flex items-start gap-3 border-b border-white/[0.06]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[#A78BFA]">{displayType}</span>
            {opp.verification_status === 'high' ? (
              <span className="flex items-center gap-0.5 text-[10px] text-[#10B981] font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-[10px] text-[#F59E0B] font-semibold">
                <AlertCircle className="w-3 h-3" /> Check details
              </span>
            )}
          </div>
          <h3 className="font-semibold text-[15px] leading-snug text-[#F5F5F7] group-hover:text-[#A78BFA] transition-colors line-clamp-2">
            {opp.title}
          </h3>
          <p className="text-sm text-[#A1A1AA] mt-1 flex items-center gap-1 truncate">
            <Building2 className="w-3.5 h-3.5 shrink-0" /> {opp.organization}
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8B8B96]">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{opp.location || 'Remote'}</span>
            {opp.deadline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Due {opp.deadline}</span>}
            {domain && <span>{domain}</span>}
          </div>
        </div>
        {/* Match ring */}
        <div className="relative shrink-0 flex flex-col items-center">
          <div className="relative w-12 h-12">
            <MatchRing score={score} size={48} />
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#F5F5F7]">
              {score}%
            </span>
          </div>
          <span className="text-[9px] text-[#8B8B96] mt-0.5 text-center leading-tight">match</span>
        </div>
      </div>

      {/* Skills */}
      <div className="px-5 py-3 flex-1">
        {matched.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {matched.slice(0, 3).map((s: string) => (
              <span key={s} className="px-2 py-0.5 text-[11px] rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">✓ {s}</span>
            ))}
            {gap.slice(0, 2).map((s: string) => (
              <span key={s} className="px-2 py-0.5 text-[11px] rounded-full bg-white/[0.04] text-[#8B8B96] border border-white/[0.08]">○ {s}</span>
            ))}
            {(matched.length + gap.length) > 5 && (
              <span className="text-[11px] text-[#8B8B96] self-center">+{matched.length + gap.length - 5} more</span>
            )}
          </div>
        )}
        {matched.length === 0 && gap.length === 0 && (
          <p className="text-xs text-[#8B8B96] italic">No specific skills listed — open application</p>
        )}
        {explanation && (
          <p className="text-xs text-[#A1A1AA] mt-2 leading-relaxed line-clamp-2">{explanation}</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 border-t border-white/[0.06] bg-black/20 flex items-center justify-between"
        onClick={(e) => e.preventDefault()}
      >
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave(jobKey, opp); }}
          className={`p-1.5 rounded-full transition-colors ${isSaved ? 'text-[#8B5CF6]' : 'text-[#8B8B96] hover:text-white'}`}
          title={isSaved ? 'Remove from tracker' : 'Save to tracker'}
        >
          <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
        </button>
        <span className="text-[11px] text-[#8B8B96]">
          {opp.discovered_at ? `Found ${opp.discovered_at}` : 'Pathify curated'}
        </span>
        <span className="text-xs font-semibold text-[#8B5CF6] flex items-center gap-0.5 group-hover:text-[#A78BFA]">
          View <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
        </span>
      </div>
    </Link>
  );
}

function OpportunitiesInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const initialType = searchParams.get('type') || '';

  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialQ);
  const [selectedType, setSelectedType] = useState(initialType);
  const [minMatch, setMinMatch] = useState(0);
  const [sortBy, setSortBy] = useState('match');
  const [showFilters, setShowFilters] = useState(false);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);

  const { skills: userSkills, country: userCountry, goals: userGoals } = useUserStore();
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/jobs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setOpportunities(data);
        } else if (data.error) {
          setError(data.error);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load opportunities');
      } finally {
        setIsLoading(false);
      }
    };
    load();

    // Load saved jobs
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('saved_jobs').select('job_url').eq('user_id', user.id).then(({ data }) => {
          if (data) setSavedJobs(data.map((r: any) => r.job_url));
        });
      }
    });
  }, []);

  // Compute scores for all opportunities
  const scoredOpportunities = useMemo(() => {
    return opportunities.map(opp => {
      const result = calculateFullMatch(opp, userSkills, userCountry, userGoals);
      return { ...opp, _score: result.score, _matched: result.matched, _gap: result.gap, _explanation: result.explanation };
    });
  }, [opportunities, userSkills, userCountry, userGoals]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = scoredOpportunities.filter(opp => {
      if (selectedType && opp.opportunity_type !== selectedType) return false;
      if (opp._score < minMatch) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          opp.title?.toLowerCase().includes(q) ||
          opp.organization?.toLowerCase().includes(q) ||
          opp.location?.toLowerCase().includes(q) ||
          (opp.skills_required || []).some((s: any) =>
            (typeof s === 'string' ? s : s?.canonical || '').toLowerCase().includes(q)
          ) ||
          opp.source_domain?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (sortBy === 'match') {
      list = list.sort((a, b) => b._score - a._score);
    } else if (sortBy === 'newest') {
      list = list.sort((a, b) => (b.discovered_at || '').localeCompare(a.discovered_at || ''));
    } else if (sortBy === 'deadline') {
      list = list.sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
    }
    return list;
  }, [scoredOpportunities, selectedType, minMatch, searchTerm, sortBy]);

  const toggleSave = async (jobKey: string, opp: any) => {
    const isSaved = savedJobs.includes(jobKey);
    setSavedJobs(prev => isSaved ? prev.filter(k => k !== jobKey) : [...prev, jobKey]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      if (isSaved) {
        await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_url', jobKey);
      } else {
        await supabase.from('saved_jobs').insert({ user_id: user.id, job_url: jobKey, job_data: opp });
      }
    } catch { /* rollback */ setSavedJobs(prev => isSaved ? [...prev, jobKey] : prev.filter(k => k !== jobKey)); }
  };

  const strongMatches = scoredOpportunities.filter(o => o._score >= 60).length;

  return (
    <AppShell
      title="Opportunity Catalog"
      subtitle={`${opportunities.length} opportunities verified · ${strongMatches} strong matches`}
      requireAuth={false}
    >
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Content Column */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96]" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by role, skill, organization, or location…"
              className="w-full h-12 bg-white/[0.05] border border-white/[0.10] rounded-full pl-11 pr-4 text-[15px] placeholder-[#8B8B96] text-[#F5F5F7] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8B8B96] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-nowrap pb-1">
              <Filter className="w-4 h-4 text-[#8B8B96] shrink-0" />
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelectedType(t.value)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all ${
                    selectedType === t.value
                      ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-[#A1A1AA] hover:border-white/15 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto shrink-0 flex items-center gap-1.5 text-xs text-[#A1A1AA] border border-white/10 px-3 py-1.5 rounded-full hover:border-white/20 hover:text-white transition-all"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Advanced sort options */}
          {showFilters && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <p className="text-xs text-[#A1A1AA] mb-2 font-medium">Sort by</p>
                <div className="flex gap-2">
                  {SORT_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSortBy(s.value)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                        sortBy === s.value
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/40 text-[#A78BFA]'
                          : 'bg-white/[0.03] border-white/10 text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results count */}
          <p className="text-xs text-[#8B8B96]">
            {filtered.length} opportunities found
            {searchTerm && ` for "${searchTerm}"`}
            {selectedType && ` in ${typeLabel(selectedType)}`}
            {minMatch > 0 && ` with ≥${minMatch}% match`}
          </p>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl h-64 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <AlertCircle className="w-10 h-10 text-[#F59E0B] mx-auto mb-4" />
              <p className="text-[#F5F5F7] font-medium">Could not load opportunities</p>
              <p className="text-sm text-[#A1A1AA] mt-2 max-w-sm mx-auto">{error}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 bg-[#8B5CF6] text-white px-5 py-2 rounded-full text-sm font-bold"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Search className="w-10 h-10 text-[#8B8B96] mx-auto mb-4" />
              <p className="text-[#F5F5F7] font-medium">No opportunities match your filters</p>
              <p className="text-sm text-[#A1A1AA] mt-2">Try broadening your search or adjusting the Vertical Fit Gate threshold</p>
              <div className="flex justify-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setSelectedType(''); setMinMatch(0); }}
                  className="bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm hover:bg-white/15 text-white"
                >
                  Reset all filters
                </button>
                <Link href="/navigator" className="bg-[#8B5CF6] text-white px-4 py-2 rounded-full text-sm font-bold">
                  Ask AI Navigator →
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((opp, i) => (
                <OpportunityCard
                  key={opp.application_url || opp.id || i}
                  opp={opp}
                  score={opp._score}
                  matched={opp._matched}
                  gap={opp._gap}
                  explanation={opp._explanation}
                  isSaved={savedJobs.includes(String(opp.application_url || opp.id))}
                  onSave={toggleSave}
                />
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <p className="text-center text-xs text-[#8B8B96] pt-8 pb-4">
              Curated from trusted sources — YC Jobs, Devpost, OpportunityDesk & more. Updated hourly.
            </p>
          )}
        </div>

        {/* Right Sidebar: Vertical Slider Filter */}
        <aside className="w-full lg:w-44 shrink-0 flex flex-col items-center">
          <div className="sticky top-24 w-full">
            <VerticalFitSlider
              score={userSkills.length > 0 ? 80 : 50}
              minScore={minMatch}
              onMinScoreChange={(newMin) => setMinMatch(newMin)}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080414] flex items-center justify-center">
        <div className="text-[#A1A1AA] text-sm">Loading opportunities…</div>
      </div>
    }>
      <OpportunitiesInner />
    </Suspense>
  );
}
