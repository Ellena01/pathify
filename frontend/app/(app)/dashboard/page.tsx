'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Search, CheckCircle2, AlertCircle, Bookmark,
  Filter, RefreshCw, Loader2, CheckSquare, Layers, ExternalLink, ChevronRight
} from 'lucide-react';
import { useUserStore } from '@/app/store';
import { createClient } from '@/utils/supabase/client';
import { getOpportunityKey } from '@/app/utils/score';
import { usePrecomputedMatches, type MatchedOpportunity } from '@/app/hooks/usePrecomputedMatches';
import { STAGE_META, type TrackerStage } from '@/lib/tracker';
import { PageHeader } from '@/components/layout/PageHeader';
import { PathifyDome } from '@/components/visual/PathifyDome';
import { SecondaryTabs } from '@/components/layout/SecondaryTabs';

/**
 * The personalised dashboard.
 *
 * Two deliberate changes from the previous version:
 *
 * 1. **No `fallbackOpportunities`.** The feed used to initialise to three
 *    hardcoded records ("Andela Global", "DeepLearning Hub", "AfroTech Labs")
 *    with `https://example.com/...` application URLs, and those stayed on screen
 *    whenever `/api/jobs` was slow, down, or empty. Fictional companies
 *    presented as verified listings is worse than an empty state, so the feed
 *    is now either real data or an explicit empty state with a retry.
 *
 * 2. **No client-side scoring.** `calculateMatch` ran the engine in the browser
 *    on every render — three times per render in the status bar alone. Scores,
 *    matched skills and gaps all come from `GET /api/match` now, which reads the
 *    same table `POST /api/match` writes.
 */

const OPPORTUNITY_TYPES = [
  { value: '', label: 'All' },
  { value: 'jobs_remote', label: 'Remote Jobs' },
  { value: 'jobs_hybrid', label: 'Hybrid' },
  { value: 'jobs_onsite', label: 'On-site' },
  { value: 'internships', label: 'Internships' },
  { value: 'hackathons', label: 'Hackathons' },
  { value: 'fellowships', label: 'Fellowships' },
  { value: 'scholarships', label: 'Scholarships' },
  { value: 'grants', label: 'Grants' },
  { value: 'conferences', label: 'Conferences' },
  { value: 'events', label: 'Events' },
];

export default function PathifyDashboard() {
  const [activeTab, setActiveTab] = useState<'feed' | 'tracker'>('feed');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Saved jobs & Application Tracker state
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [savedRecords, setSavedRecords] = useState<any[]>([]);
  const [authUser, setAuthUser] = useState<any>(null);

  const { skills: userSkills, hydrate, country } = useUserStore();
  const supabase = createClient();

  const {
    matches,
    matchByUrl,
    isLoading,
    isStale,
    error,
    runMatches,
    isRunning,
  } = usePrecomputedMatches(60);

  // Auth + profile + saved jobs hydration
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setAuthUser(user);
        if (user) {
          const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
          if (profile) {
            hydrate({
              name: profile.name || user.user_metadata?.name || user.email?.split('@')[0] || '',
              role: profile.role || '',
              country: profile.country || '',
              skills: profile.skills || [],
              goals: profile.goals || [],
            });
          }
          const { data: saves } = await supabase.from('saved_jobs').select('*').eq('user_id', user.id);
          if (saves) {
            setSavedRecords(saves);
            setSavedJobs(saves.map((r: any) => r.job_url));
          }
        }
      } catch (e) {
        console.warn('Could not hydrate profile:', e);
      }
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (!session?.user) {
        setSavedJobs([]);
        setSavedRecords([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const strongMatchCount = useMemo(
    () => matches.filter((m) => m.match.score >= 60).length,
    [matches]
  );

  const filteredOpportunities = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return matches.filter((opp) => {
      if (selectedType && opp.opportunity_type !== selectedType) return false;
      if (!q) return true;
      return (
        String(opp.title ?? '').toLowerCase().includes(q) ||
        String(opp.organization ?? '').toLowerCase().includes(q) ||
        String(opp.location ?? '').toLowerCase().includes(q) ||
        String(opp.source_domain ?? '').toLowerCase().includes(q) ||
        opp.match.matched.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [matches, searchTerm, selectedType]);

  const toggleSaveJob = async (rawKey: string, opp?: any) => {
    const jobKey = getOpportunityKey(opp || rawKey);
    const isSaved = savedJobs.includes(jobKey);
    setSavedJobs(prev => isSaved ? prev.filter(k => k !== jobKey) : [...prev, jobKey]);
    if (!authUser) return;
    try {
      if (isSaved) {
        await supabase.from('saved_jobs').delete().eq('user_id', authUser.id).eq('job_url', jobKey);
        setSavedRecords(prev => prev.filter(r => getOpportunityKey(r.job_url) !== jobKey));
      } else {
        const record = { job_data: opp || {}, stage: 'wishlist' };
        const { data } = await supabase
          .from('saved_jobs')
          .insert({ user_id: authUser.id, job_url: jobKey, job_data: record.job_data, stage: 'wishlist' })
          .select('*')
          .single();
        if (data) setSavedRecords(prev => [...prev, data]);
      }
    } catch (err) {
      // Roll back the optimistic update.
      console.warn('Could not update tracker:', err);
      setSavedJobs(prev => isSaved ? [...prev, jobKey] : prev.filter(k => k !== jobKey));
    }
  };

  /** Match score for a saved row: prefer the persisted match, else the snapshot. */
  const scoreForSaved = (jobUrl: string, jobData: any): number | null => {
    const persisted = matchByUrl.get(jobUrl)?.score;
    if (typeof persisted === 'number') return persisted;
    if (typeof jobData?.match_score === 'number') return jobData.match_score;
    return null;
  };

  const needsMatchRun = !isLoading && matches.length === 0 && !isStale;

  return (
    <PageHeader
      title="Dashboard"
      subtitle="Personalized Opportunity Intelligence & Application Tracker"
    >
      {/* Live status bar */}
      <div className="bg-white/[0.04] border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-y-2 text-[13px] text-[#A1A1AA]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 font-medium tabular-nums">
              <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse" />
              {isLoading ? 'Loading your matches…' : `${matches.length} opportunities ranked for you`}
            </span>
            <span className="opacity-30 hidden sm:inline">·</span>
            <span className="text-[#A78BFA] font-medium">{strongMatchCount} strong matches for your skills</span>
            <span className="opacity-30">·</span>
            <span className="text-white">{savedJobs.length} in your tracker</span>
          </div>

          <div className="flex items-center gap-3 ml-auto text-xs">
            <Link href="/opportunities" className="text-[#8B5CF6] hover:text-[#A78BFA] font-medium flex items-center gap-1">
              Browse full catalog <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10 space-y-8">
        {/* Spatial Opportunity Dome */}
        <PathifyDome
          totalOpportunities={matches.length}
          strongMatches={strongMatchCount}
          userCountry={country || 'Global / Remote'}
          userSkills={userSkills || []}
        />

        {/* View Switcher Tabs using SecondaryTabs primitive */}
        <div className="flex items-center justify-between border-b border-white/[0.10] pb-2">
          <SecondaryTabs
            tabs={[
              { id: 'feed', label: 'Opportunities Feed', icon: Layers },
              {
                id: 'tracker',
                label: 'Application Tracker',
                icon: CheckSquare,
                badge: savedRecords.length > 0 ? savedRecords.length : undefined,
              },
            ]}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as 'feed' | 'tracker')}
          />

          <Link
            href="/opportunities"
            className="hidden md:flex items-center gap-1 text-xs text-[#8B5CF6] hover:text-white transition-colors"
          >
            Open Advanced Catalog View →
          </Link>
        </div>

        {/* TAB 1: OPPORTUNITIES FEED */}
        {activeTab === 'feed' && (
          <div>
            {matches.length > 0 && (
              <div className="flex flex-col gap-6 mb-8">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B96] z-10" />
                  <input
                    type="text"
                    placeholder="Search by role, skill, or organization — e.g., “React”, “Fellowship Lagos”"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="relative w-full h-12 bg-white/[0.05] border border-white/[0.10] rounded-full pl-11 pr-4 text-[15px] text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:border-[#8B5CF6]/20 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
                  />
                </div>

                <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar flex-nowrap sm:flex-wrap -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 snap-x">
                  <Filter className="w-4 h-4 text-[#8B8B96] shrink-0" />
                  <span className="text-[11px] tracking-[0.14em] uppercase text-[#A1A1AA] mr-2 shrink-0">Filter:</span>
                  {OPPORTUNITY_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedType(t.value)}
                      className={`shrink-0 snap-start px-3.5 py-1.5 rounded-full text-[13px] font-medium border min-h-8 transition-all ${
                        selectedType === t.value
                          ? 'bg-[#8B5CF6] border-[#8B5CF6] text-white shadow-[0_0_12px_rgba(139,92,246,0.35)]'
                          : 'bg-white/[0.03] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:border-white/15 hover:bg-white/[0.06]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                  <span className="text-xs text-[#8B8B96] ml-2 shrink-0">{filteredOpportunities.length} opportunities</span>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-20 text-[#A1A1AA]">Ranking the catalog against your passport — one moment…</div>
            ) : isStale ? (
              <div className="text-center py-20 max-w-md mx-auto">
                <p className="text-[#F5F5F7] font-medium">Matching is not initialised yet</p>
                <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
                  Apply <code className="text-[#A78BFA]">supabase/migrations/20260926_hardening_passport_v2.sql</code> to
                  create the match table, then re-run matching.
                </p>
              </div>
            ) : error ? (
              <div className="text-center py-20 max-w-md mx-auto">
                <p className="text-[#F5F5F7] font-medium">Could not load your matches</p>
                <p className="text-sm text-[#A1A1AA] mt-2">{error}</p>
                <button
                  onClick={() => void runMatches()}
                  disabled={isRunning}
                  className="mt-4 inline-flex items-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 rounded-full"
                >
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Try again
                </button>
              </div>
            ) : needsMatchRun ? (
              <div className="text-center py-20 max-w-md mx-auto">
                <p className="text-[#F5F5F7] font-medium">No matches computed yet</p>
                <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
                  {userSkills && userSkills.length > 0
                    ? 'Rank the catalog against your skills, location and goals. The result is saved to your profile.'
                    : 'Add a few skills to your passport first — matching scores every listing against your skills, location and goals.'}
                </p>
                {userSkills && userSkills.length > 0 && (
                  <button
                    onClick={() => void runMatches()}
                    disabled={isRunning}
                    className="mt-5 inline-flex items-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-bold px-5 py-2.5 rounded-full"
                  >
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isRunning ? 'Matching…' : 'Run my matches'}
                  </button>
                )}
                {(!userSkills || userSkills.length === 0) && (
                  <Link
                    href="/settings"
                    className="mt-5 inline-block bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold px-5 py-2.5 rounded-full"
                  >
                    Add skills
                  </Link>
                )}
              </div>
            ) : filteredOpportunities.length === 0 ? (
              <div className="text-center py-20 max-w-xl mx-auto">
                <p className="text-[#F5F5F7] font-medium">No matches for these filters yet</p>
                <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">Try broadening your search or clear active filters.</p>
                <button
                  onClick={() => { setSearchTerm(''); setSelectedType(''); }}
                  className="mt-4 bg-white/10 border border-white/10 rounded-full px-5 py-2 text-sm hover:bg-white/15"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredOpportunities.map((opp, index) => (
                  <MatchCard
                    key={getOpportunityKey(opp) || index}
                    opp={opp}
                    isSaved={savedJobs.includes(getOpportunityKey(opp))}
                    onSave={toggleSaveJob}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: APPLICATION TRACKER */}
        {activeTab === 'tracker' && (
          <div className="space-y-6">
            <div className="bg-white/[0.05] border border-white/[0.10] rounded-2xl p-6 backdrop-blur-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-[#8B5CF6]" />
                    Application Tracker
                  </h2>
                  <p className="text-sm text-[#A1A1AA] mt-1">
                    Manage your active opportunities from initial discovery to offers. Stored in your private profile.
                  </p>
                </div>
                <Link
                  href="/tracker"
                  className="bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold px-4 py-2.5 rounded-full transition-all"
                >
                  Open Kanban view →
                </Link>
              </div>
            </div>

            {savedRecords.length === 0 ? (
              <div className="text-center py-20 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-8">
                <Bookmark className="w-10 h-10 text-[#8B8B96] mx-auto mb-3 opacity-60" />
                <h3 className="text-base font-semibold">No saved opportunities yet</h3>
                <p className="text-sm text-[#A1A1AA] max-w-md mx-auto mt-2">
                  Bookmark opportunities from the feed or catalog to organize them across wishlist, applied, interviewing, and offer stages.
                </p>
                <button
                  onClick={() => setActiveTab('feed')}
                  className="mt-6 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-bold px-6 py-2.5 rounded-full"
                >
                  Browse opportunities now
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {savedRecords.map((record: any, idx: number) => {
                  const jobData = record.job_data || {};
                  const jobKey = record.job_url || getOpportunityKey(jobData) || String(idx);
                  const currentStage = record.stage || 'wishlist';
                  const stageMeta = STAGE_META[currentStage as TrackerStage] ?? STAGE_META.wishlist;
                  const matchScore = scoreForSaved(jobKey, jobData);
                  const detailHref = `/opportunities/${encodeURIComponent(jobKey)}`;

                  return (
                    <div
                      key={record.id ?? jobKey}
                      className="bg-white/[0.05] border border-white/[0.10] rounded-2xl p-5 flex flex-col justify-between backdrop-blur-lg hover:border-white/20 transition-all shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] tracking-widest uppercase text-[#A1A1AA] font-semibold">
                            {String(jobData.opportunity_type ?? 'Opportunity').replace(/_/g, ' ')}
                          </span>
                          {matchScore !== null ? (
                            <span className="text-xs font-mono text-[#10B981] font-bold">{matchScore}% match</span>
                          ) : (
                            <span className="text-[10px] text-[#8B8B96]">Not scored</span>
                          )}
                        </div>

                        <Link href={detailHref} className="block group">
                          <h4 className="text-base font-semibold group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                            {jobData.title || 'Untitled Opportunity'}
                          </h4>
                        </Link>
                        <p className="text-xs text-[#A1A1AA] mt-1">
                          {jobData.organization || 'Organization'} · {jobData.location || 'Remote'}
                        </p>

                        {/* Stage is read-only here on purpose: moving a card is
                            /api/tracker's job, which authenticates the user and
                            writes the constrained `stage` column. The browser
                            used to UPDATE `job_data.stage` directly, which had no
                            RLS policy and silently failed. */}
                        <div className="mt-4 pt-4 border-t border-white/[0.08]">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                            Status Stage
                          </p>
                          <span className="mt-1.5 inline-block px-3 py-1 text-xs rounded-full bg-white/[0.06] border border-white/10 text-white">
                            {stageMeta.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs">
                        <button
                          onClick={() => toggleSaveJob(jobKey, jobData)}
                          className="text-[#8B8B96] hover:text-rose-400 transition-colors"
                        >
                          Remove
                        </button>

                        <div className="flex items-center gap-2">
                          <Link href={detailHref} className="text-[#A78BFA] hover:underline font-medium">
                            Details
                          </Link>
                          {jobData.application_url && (
                            <a
                              href={jobData.application_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-full font-medium inline-flex items-center gap-1"
                            >
                              Apply <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </PageHeader>
  );
}

function MatchCard({
  opp,
  isSaved,
  onSave,
}: {
  opp: MatchedOpportunity;
  isSaved: boolean;
  onSave: (key: string, opp?: any) => void;
}) {
  const { match } = opp;
  const matchScore = match.score;
  const isHighMatch = matchScore >= 60;
  const jobKey = getOpportunityKey(opp);
  const displayType = (String(opp.opportunity_type ?? '').replace(/_/g, ' ') || 'Remote Job')
    .replace(/\b\w/g, (m) => m.toUpperCase());
  const orgDomain = opp.source_domain || (() => {
    try { return new URL(opp.application_url).hostname.replace('www.', ''); } catch { return ''; }
  })();
  const total = match.matched.length + match.gap.length;
  const detailHref = `/opportunities/${encodeURIComponent(jobKey)}`;

  return (
    <div className="bg-white/[0.05] backdrop-blur-lg border border-white/[0.10] rounded-2xl flex flex-col justify-between overflow-hidden group hover:border-[#8B5CF6]/40 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
      <div className="p-6 border-b border-white/[0.08]">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-bold tracking-widest uppercase text-[#A1A1AA]">
              {displayType}
            </span>
            <Link href={detailHref} className="block mt-1">
              <h3 className="text-[16px] font-semibold text-[#F5F5F7] leading-tight group-hover:text-[#A78BFA] transition-colors line-clamp-2">
                {opp.title}
              </h3>
            </Link>
            <p className="text-[13px] text-[#A1A1AA] mt-1 truncate">{opp.organization} · {opp.location || 'Remote'}</p>
            {orgDomain && <p className="text-xs text-[#A78BFA]/80 mt-0.5">{orgDomain}</p>}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {opp.verification_status === 'high' ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#10B981] uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold text-[#F59E0B] uppercase tracking-wider">
                <AlertCircle className="w-3.5 h-3.5" /> Unverified
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 bg-white/[0.01]">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-12 h-12 flex items-center justify-center bg-black/40 rounded-full border border-white/10 shrink-0">
            <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke={isHighMatch ? "#10B981" : "#8B5CF6"}
                strokeWidth="4"
                strokeDasharray="126"
                strokeDashoffset={126 - (126 * matchScore) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <span className="relative z-10 text-xs font-bold text-[#F5F5F7]">{matchScore}%</span>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-[#A1A1AA] font-semibold mb-0.5">Match Rating</p>
            <p className="text-xs text-[#F5F5F7] font-medium leading-tight">
              {matchScore >= 70
                ? `Strong match — covers ${match.matched.length} of ${total} skills`
                : 'Good foundation — growth potential'}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="text-xs text-[#A1A1AA] w-14 shrink-0 mt-0.5">Matched:</span>
            <div className="flex flex-wrap gap-1.5">
              {match.matched.slice(0, 3).map((skill) => (
                <span key={skill} className="px-2 py-0.5 text-xs rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/25">
                  ✓ {skill}
                </span>
              ))}
              {match.matched.length === 0 && (
                <span className="text-xs text-[#8B8B96] italic">None yet</span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <span className="text-xs text-[#A1A1AA] w-14 shrink-0 mt-0.5">Gaps:</span>
            <div className="flex flex-wrap gap-1.5">
              {match.gap.slice(0, 2).map((skill) => (
                <span key={skill} className="px-2 py-0.5 text-xs rounded-full bg-white/[0.06] text-[#A1A1AA] border border-white/10">
                  ○ {skill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between bg-black/20">
        <button
          onClick={() => onSave(jobKey, opp)}
          title={isSaved ? 'Remove from Tracker' : 'Save to Tracker'}
          className={`p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/5 transition-colors ${
            isSaved ? 'text-[#8B5CF6]' : 'text-[#A1A1AA] hover:text-white'
          }`}
        >
          <Bookmark className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} />
        </button>

        <div className="flex items-center gap-3">
          <Link href={detailHref} className="text-xs font-medium text-[#A78BFA] hover:text-white transition-colors">
            Details & Fit →
          </Link>
          {opp.application_url && (
            <a
              href={opp.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full transition-colors"
            >
              Apply <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
