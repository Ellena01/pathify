'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search, Filter, CheckCircle2, AlertCircle, Bookmark, ArrowRight,
  MapPin, Calendar, Building2, Zap, X, ChevronDown, SlidersHorizontal,
  Briefcase, GraduationCap, Code2, Award, Globe, Users, RefreshCw, Loader2
} from 'lucide-react';
import { getOpportunityKey } from '@/app/utils/score';
import { createClient } from '@/utils/supabase/client';
import { usePrecomputedMatches, skillNames, type MatchPayload } from '@/app/hooks/usePrecomputedMatches';
import { PageHeader } from '@/components/layout/PageHeader';
import { VerticalFitSlider } from '@/components/visual/VerticalFitSlider';

/**
 * The catalog.
 *
 * Every percentage on this page is read from `user_opportunity_matches`, which
 * is written only by `POST /api/match` and read only by `GET /api/match`. The
 * page used to import the scoring engine and run it over the whole catalog in
 * the browser on every filter change — which produced numbers that disagreed
 * with the server (the client shim never forwards `yearsExperience`,
 * `preferredLocations` or `preferredTypes`, so every browser-side score took
 * the "no data" branch) and burned main-thread time proportional to the
 * catalog on each render.
 */

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

const SCOPE_OPTIONS = [
  { value: 'for-you' as const, label: 'For you' },
  { value: 'all' as const, label: 'All listings' },
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

function OpportunityCard({ opp, match, isSaved, onSave }: any) {
  const jobKey = getOpportunityKey(opp);
  const displayType = typeLabel(opp.opportunity_type || '');
  const domain = opp.source_domain || (() => {
    try { return new URL(opp.application_url || '').hostname.replace('www.', ''); } catch { return ''; }
  })();

  const matched: string[] = match?.matched ?? [];
  const gap: string[] = match?.gap ?? [];

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
        {/* Match ring — omitted entirely when this listing has no computed match,
            rather than rendering a fabricated 0%. */}
        {match && (
          <div className="relative shrink-0 flex flex-col items-center">
            <div className="relative w-12 h-12">
              <MatchRing score={match.score} size={48} />
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#F5F5F7]">
                {match.score}%
              </span>
            </div>
            <span className="text-[9px] text-[#8B8B96] mt-0.5 text-center leading-tight">match</span>
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="px-5 py-3 flex-1">
        {matched.length > 0 || gap.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {matched.slice(0, 3).map((s: string) => (
              <span key={`m-${s}`} className="px-2 py-0.5 text-[11px] rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">✓ {s}</span>
            ))}
            {gap.slice(0, 2).map((s: string) => (
              <span key={`g-${s}`} className="px-2 py-0.5 text-[11px] rounded-full bg-white/[0.04] text-[#8B8B96] border border-white/[0.08]">○ {s}</span>
            ))}
            {(matched.length + gap.length) > 5 && (
              <span className="text-[11px] text-[#8B8B96] self-center">+{matched.length + gap.length - 5} more</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-[#8B8B96] italic">
            {match ? 'No specific skills listed — open application' : 'Not scored against your passport yet'}
          </p>
        )}
        {match?.explanation && (
          <p className="text-xs text-[#A1A1AA] mt-2 leading-relaxed line-clamp-2">{match.explanation}</p>
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

  const [catalog, setCatalog] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState(initialQ);
  const [selectedType, setSelectedType] = useState(initialType);
  const [minMatch, setMinMatch] = useState(0);
  const [sortBy, setSortBy] = useState('match');
  const [showFilters, setShowFilters] = useState(false);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [scope, setScope] = useState<'for-you' | 'all'>('for-you');

  const supabase = createClient();
  const {
    matches,
    matchByUrl,
    isLoading: isLoadingMatches,
    isStale,
    error: matchError,
    runMatches,
    isRunning,
  } = usePrecomputedMatches(60);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/jobs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setCatalog(data);
        } else if (data.error) {
          setError(data.error);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load opportunities');
      } finally {
        setIsLoading(false);
      }
    };
    void load();

    // Load saved jobs
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('saved_jobs').select('job_url').eq('user_id', user.id).then(({ data }) => {
          if (data) setSavedJobs(data.map((r: any) => r.job_url));
        });
      }
    });
  }, []);

  /**
   * Annotate rows with the server-computed match. `matchByUrl` is keyed on
   * `application_url` — the same key `user_opportunity_matches` uses — so a
   * listing the match run never scored simply has no entry and renders
   * unscored instead of with an invented percentage.
   */
  const annotated = useMemo<any[]>(() => {
    if (scope === 'for-you') {
      return matches.map((row) => ({ ...row, match: row.match }));
    }
    return catalog.map((row) => ({
      ...row,
      match: (row.application_url && matchByUrl.get(row.application_url)) || null,
    }));
  }, [scope, matches, catalog, matchByUrl]);

  // Filter + sort. No scoring happens in this memo — every number rendered
  // below came out of the database.
  const filtered = useMemo<any[]>(() => {
    const list = annotated.filter((opp) => {
      if (selectedType && opp.opportunity_type !== selectedType) return false;
      // A min-match threshold can only apply to rows that actually have a score.
      if (minMatch > 0 && (opp.match?.score ?? -1) < minMatch) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const haystack = skillNames(opp.skills_required);
        return (
          String(opp.title ?? '').toLowerCase().includes(q) ||
          String(opp.organization ?? '').toLowerCase().includes(q) ||
          String(opp.location ?? '').toLowerCase().includes(q) ||
          haystack.some((s) => s.toLowerCase().includes(q)) ||
          String(opp.source_domain ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (sortBy === 'match') {
      // Unscored listings sort last rather than being treated as 0% matches.
      return [...list].sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
    }
    if (sortBy === 'newest') {
      return [...list].sort((a, b) => String(b.discovered_at ?? '').localeCompare(String(a.discovered_at ?? '')));
    }
    return [...list].sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return String(a.deadline).localeCompare(String(b.deadline));
    });
  }, [annotated, selectedType, minMatch, searchTerm, sortBy]);

  const toggleSave = async (jobKey: string, opp: any) => {
    const isSaved = savedJobs.includes(jobKey);
    setSavedJobs(prev => isSaved ? prev.filter(k => k !== jobKey) : [...prev, jobKey]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      if (isSaved) {
        await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_url', jobKey);
      } else {
        await supabase.from('saved_jobs').insert({
          user_id: user.id,
          job_url: jobKey,
          job_data: opp,
          stage: 'wishlist',
        });
      }
    } catch { /* rollback */ setSavedJobs(prev => isSaved ? [...prev, jobKey] : prev.filter(k => k !== jobKey)); }
  };

  const strongMatches = matches.filter((m) => m.match.score >= 60).length;
  const busy = isLoading || isLoadingMatches;
  const needsRun = !busy && matches.length === 0 && !isStale && scope === 'for-you';

  return (
    <PageHeader
      title="Opportunity Catalog"
      subtitle={
        scope === 'for-you'
          ? `${matches.length} ranked for your passport · ${strongMatches} strong matches`
          : `${catalog.length} verified listings · ${matches.length} scored for you`
      }
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
              className="w-full h-12 bg-white/[0.05] border border-white/[0.10] rounded-full pl-11 pr-4 text-[15px] placeholder-[#8B8B96] text-[#F5F5F7] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:border-[#8B5CF6]/20 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
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

          {/* Advanced filters: scope + sort */}
          {showFilters && (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <p className="text-xs text-[#A1A1AA] mb-2 font-medium">Show</p>
                <div className="flex gap-2">
                  {SCOPE_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setScope(s.value)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                        scope === s.value
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/40 text-[#A78BFA]'
                          : 'bg-white/[0.03] border-white/10 text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
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

          {(isStale || matchError) && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-xs text-amber-200">
              {isStale
                ? 'Matching is not initialised yet. Apply the latest Supabase migration to score listings against your passport.'
                : matchError}
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
          {busy ? (
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
          ) : needsRun ? (
            <div className="text-center py-20 max-w-md mx-auto">
              <p className="text-[#F5F5F7] font-medium">No matches computed yet</p>
              <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
                Your passport has not been scored against the catalog yet. Run a match to rank every listing
                against your skills, location and goals — the result is saved to your profile.
              </p>
              <button
                type="button"
                onClick={() => void runMatches()}
                disabled={isRunning}
                className="mt-5 inline-flex items-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 rounded-full"
              >
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isRunning ? 'Matching…' : 'Run my matches'}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Search className="w-10 h-10 text-[#8B8B96] mx-auto mb-4" />
              <p className="text-[#F5F5F7] font-medium">No opportunities match your filters</p>
              <p className="text-sm text-[#A1A1AA] mt-2">Try broadening your search or lowering the match threshold</p>
              <div className="flex justify-center gap-3 mt-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setSelectedType(''); setMinMatch(0); }}
                  className="bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm hover:bg-white/15 text-white"
                >
                  Reset all filters
                </button>
                {scope === 'for-you' && catalog.length > matches.length && (
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className="bg-white/10 border border-white/10 px-4 py-2 rounded-full text-sm hover:bg-white/15 text-white"
                  >
                    Browse all {catalog.length} listings
                  </button>
                )}
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
                  match={opp.match as MatchPayload | null}
                  isSaved={savedJobs.includes(getOpportunityKey(opp))}
                  onSave={toggleSave}
                />
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="pt-8 pb-4 flex flex-col items-center gap-3">
              <p className="text-center text-xs text-[#8B8B96]">
                Every score is computed server-side by the Pathify matching engine and stored with your passport.
              </p>
              <button
                type="button"
                onClick={() => void runMatches()}
                disabled={isRunning}
                className="inline-flex items-center gap-1.5 text-xs text-[#A78BFA] hover:text-white disabled:opacity-60 transition-colors"
              >
                {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {isRunning ? 'Recomputing matches…' : `Recompute my matches (${matches.length} stored)`}
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar: Vertical Slider Filter */}
        <aside className="w-full lg:w-44 shrink-0 flex flex-col items-center">
          <div className="sticky top-24 w-full">
            <VerticalFitSlider
              score={matches.length > 0 ? matches[0].match.score : 0}
              minScore={minMatch}
              onMinScoreChange={(newMin) => setMinMatch(newMin)}
            />
          </div>
        </aside>
      </div>
    </PageHeader>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-[#A1A1AA] text-sm">Loading opportunities…</div>
      </div>
    }>
      <OpportunitiesInner />
    </Suspense>
  );
}
