'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Bookmark, ExternalLink,
  MapPin, Calendar, Building2, Tag, Zap, Shield, ChevronRight,
  BookOpen, Target, TrendingUp
} from 'lucide-react';
import { useUserStore } from '../../store';
import { calculateFullMatch, getOpportunityKey } from '../../utils/score';
import { createClient } from '@/utils/supabase/client';
import { AppShell } from '@/components/layout/AppShell';

function typeLabel(t: string) {
  return (t || 'opportunity').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#A1A1AA]">{label}</span>
        <span className="text-[#F5F5F7] font-medium">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const decodedId = decodeURIComponent(id);

  const [opp, setOpp] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [trackerStage, setTrackerStage] = useState('wishlist');
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);

  const { skills: userSkills, country: userCountry, goals: userGoals } = useUserStore();
  const supabase = createClient();

  const STAGES = ['wishlist', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'];
  const STAGE_COLORS: Record<string, string> = {
    wishlist: '#8B5CF6', applied: '#3B82F6', interviewing: '#F59E0B',
    offer: '#10B981', accepted: '#10B981', rejected: '#EF4444', withdrawn: '#8B8B96'
  };

  useEffect(() => {
    const load = async () => {
      try {
        // Load all opportunities and find this one
        const res = await fetch('/api/jobs');
        if (!res.ok) throw new Error('Failed to load');
        const data: any[] = await res.json();
        const found = Array.isArray(data)
          ? data.find(o => getOpportunityKey(o) === decodedId || o.application_url === decodedId || String(o.id) === decodedId || o.title === decodedId)
          : null;
        setOpp(found || null);

        // Check saved status
        const { data: { user } } = await supabase.auth.getUser();
        setAuthUser(user);
        if (user && found) {
          const canonicalKey = getOpportunityKey(found);
          const { data: saved } = await supabase.from('saved_jobs')
            .select('job_url, job_data')
            .eq('user_id', user.id)
            .eq('job_url', canonicalKey)
            .maybeSingle();
          if (saved) {
            setIsSaved(true);
            const stage = (saved.job_data as any)?.stage;
            if (stage) setTrackerStage(stage);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [decodedId]);

  const match = opp ? calculateFullMatch(opp, userSkills, userCountry, userGoals) : null;

  const toggleSave = async () => {
    if (!authUser) { window.location.href = '/login'; return; }
    const canonicalKey = getOpportunityKey(opp) || decodedId;
    const next = !isSaved;
    setIsSaved(next);
    if (next) {
      await supabase.from('saved_jobs').insert({
        user_id: authUser.id,
        job_url: canonicalKey,
        job_data: { ...opp, stage: trackerStage },
      });
    } else {
      await supabase.from('saved_jobs').delete().eq('user_id', authUser.id).eq('job_url', canonicalKey);
    }
  };

  const updateStage = async (stage: string) => {
    setTrackerStage(stage);
    setShowStageMenu(false);
    if (!authUser) return;
    const canonicalKey = getOpportunityKey(opp) || decodedId;
    if (!isSaved) {
      setIsSaved(true);
      await supabase.from('saved_jobs').insert({
        user_id: authUser.id,
        job_url: canonicalKey,
        job_data: { ...opp, stage },
      });
    } else {
      await supabase.from('saved_jobs').update({ job_data: { ...opp, stage } })
        .eq('user_id', authUser.id).eq('job_url', canonicalKey);
    }
  };

  const domain = opp ? (() => {
    try { return new URL(opp.application_url || '').hostname.replace('www.', ''); } catch { return ''; }
  })() : '';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080414] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#8B5CF6] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#A1A1AA] text-sm">Loading opportunity…</p>
        </div>
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="min-h-screen bg-[#080414] flex items-center justify-center text-center px-4">
        <div>
          <AlertCircle className="w-12 h-12 text-[#F59E0B] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#F5F5F7]">Opportunity not found</h2>
          <p className="text-[#A1A1AA] mt-2 text-sm">This opportunity may have expired or been removed.</p>
          <Link href="/opportunities" className="mt-6 inline-flex items-center gap-2 bg-[#8B5CF6] text-white px-5 py-2.5 rounded-full font-bold text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to opportunities
          </Link>
        </div>
      </div>
    );
  }

  const scoreColor = match && match.score >= 80 ? '#10B981' : match && match.score >= 60 ? '#A78BFA' : '#8B5CF6';

  return (
    <AppShell
      title={opp.title}
      subtitle={`${opp.organization} · ${opp.location || 'Remote'}`}
      requireAuth={false}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Link Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
          <Link href="/opportunities" className="hover:text-white transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to opportunities
          </Link>
          <ChevronRight className="w-3 h-3 text-[#8B8B96]" />
          <span className="text-[#8B8B96] truncate">{opp.organization}</span>
        </div>
        {/* Hero card */}
        <div className="bg-white/[0.05] border border-white/[0.10] rounded-2xl overflow-hidden">
          {/* Top section */}
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold tracking-widest uppercase text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-2.5 py-1 rounded-full">
                    {typeLabel(opp.opportunity_type)}
                  </span>
                  {opp.verification_status === 'high' ? (
                    <span className="flex items-center gap-1 text-[11px] text-[#10B981] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verified source
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-[#F59E0B] font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" /> Check details before applying
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{opp.title}</h1>
                <p className="text-[#A1A1AA] mt-2 flex items-center gap-1.5 text-base">
                  <Building2 className="w-4 h-4 shrink-0" /> {opp.organization}
                </p>
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-[#8B8B96]">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{opp.location || 'Remote'}</span>
                  {opp.deadline && <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />Deadline: {opp.deadline}</span>}
                  {opp.amount && <span className="flex items-center gap-1.5"><Tag className="w-4 h-4" />{opp.amount}</span>}
                  {domain && <span className="flex items-center gap-1.5"><Shield className="w-4 h-4" />{domain}</span>}
                </div>
              </div>
              {/* Match score */}
              {match && (
                <div className="shrink-0 text-center">
                  <div className="relative w-20 h-20">
                    <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                      <circle
                        cx="40" cy="40" r="32" fill="none"
                        stroke={scoreColor} strokeWidth="5"
                        strokeDasharray={201} strokeDashoffset={201 - (201 * match.score) / 100}
                        strokeLinecap="round" className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black" style={{ color: scoreColor }}>{match.score}%</span>
                      <span className="text-[9px] text-[#8B8B96] font-medium">YOUR MATCH</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <a
                href={opp.application_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold py-3 px-6 rounded-full shadow-[0_8px_32px_rgba(139,92,246,0.35)] transition-all text-sm"
              >
                Apply now <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={toggleSave}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold text-sm border transition-all ${
                  isSaved
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/40 text-[#A78BFA]'
                    : 'bg-white/[0.06] border-white/[0.10] text-[#A1A1AA] hover:text-white hover:border-white/20'
                }`}
              >
                <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
                {isSaved ? 'Saved' : 'Save'}
              </button>
              {/* Tracker stage */}
              <div className="relative">
                <button
                  onClick={() => setShowStageMenu(!showStageMenu)}
                  className="flex items-center gap-2 px-4 py-3 rounded-full font-medium text-sm border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all w-full sm:w-auto justify-center"
                  style={{ color: STAGE_COLORS[trackerStage] }}
                >
                  <TrendingUp className="w-4 h-4" />
                  {trackerStage.charAt(0).toUpperCase() + trackerStage.slice(1)}
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </button>
                {showStageMenu && (
                  <div className="absolute right-0 sm:left-0 top-full mt-2 bg-[#0d0824] border border-white/[0.12] rounded-xl shadow-2xl z-20 py-1.5 min-w-[160px]">
                    {STAGES.map(s => (
                      <button
                        key={s}
                        onClick={() => updateStage(s)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                        style={{ color: s === trackerStage ? STAGE_COLORS[s] : '#A1A1AA' }}
                      >
                        {s === trackerStage && <div className="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_COLORS[s] }} />}
                        {s === trackerStage ? null : <div className="w-1.5 h-1.5" />}
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Match intelligence */}
        {match && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
            <h2 className="font-bold text-base flex items-center gap-2 mb-5">
              <Target className="w-5 h-5 text-[#8B5CF6]" /> Why this fits you
            </h2>
            <p className="text-sm text-[#A1A1AA] leading-relaxed mb-6">{match.explanation}</p>

            {/* Breakdown bars */}
            <div className="space-y-3 mb-6">
              <ScoreBar label="Skills alignment (60%)" value={match.breakdown.skills} max={60} color="#A78BFA" />
              <ScoreBar label="Location fit (20%)" value={match.breakdown.location} max={20} color="#8B5CF6" />
              <ScoreBar label="Goals alignment (10%)" value={match.breakdown.goals} max={10} color="#6D28D9" />
              <ScoreBar label="Experience fit (10%)" value={match.breakdown.experience} max={10} color="#4C1D95" />
            </div>

            {/* Skills breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#10B981] mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> You already have ({match.matched.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {match.matched.length > 0 ? match.matched.map(s => (
                    <span key={s} className="px-2.5 py-1 text-xs rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                      ✓ {s}
                    </span>
                  )) : (
                    <span className="text-xs text-[#8B8B96] italic">Add skills in your profile to see matches</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#A78BFA] mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Next to learn ({match.gap.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {match.gap.length > 0 ? match.gap.map(s => (
                    <span key={s} className="px-2.5 py-1 text-xs rounded-full bg-white/[0.05] text-[#A1A1AA] border border-white/[0.10]">
                      ○ {s}
                    </span>
                  )) : match.matched.length > 0 ? (
                    <span className="text-xs text-[#10B981]">You cover all listed skills — ready to apply!</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Description / raw data */}
        {(opp.raw_data?.description || opp.description) && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
            <h2 className="font-bold text-base flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-[#8B5CF6]" /> About this opportunity
            </h2>
            <p className="text-sm text-[#A1A1AA] leading-relaxed whitespace-pre-line">
              {opp.raw_data?.description || opp.description}
            </p>
          </div>
        )}

        {/* Skills required */}
        {opp.skills_required?.length > 0 && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
            <h2 className="font-bold text-base mb-4">Skills required</h2>
            <div className="flex flex-wrap gap-2">
              {(opp.skills_required as any[]).map((s: any) => {
                const name = typeof s === 'string' ? s : s?.canonical || '';
                const have = userSkills.map(u => u.toLowerCase()).includes(name.toLowerCase());
                return (
                  <span
                    key={name}
                    className={`px-3 py-1.5 text-sm rounded-full border ${
                      have
                        ? 'bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/25'
                        : 'bg-white/[0.04] text-[#A1A1AA] border-white/[0.10]'
                    }`}
                  >
                    {have ? '✓ ' : ''}{name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Apply CTA */}
        <div className="bg-gradient-to-r from-[#8B5CF6]/20 to-[#6D28D9]/10 border border-[#8B5CF6]/25 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#F5F5F7]">Ready to apply?</p>
            <p className="text-sm text-[#A1A1AA] mt-0.5">
              {match ? `${match.score}% match · ` : ''}{opp.organization}
            </p>
          </div>
          <a
            href={opp.application_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold px-6 py-3 rounded-full shadow-[0_8px_32px_rgba(139,92,246,0.35)] transition-all text-sm shrink-0"
          >
            Apply on {domain || 'site'} <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Back */}
        <div className="text-center pt-2 pb-6">
          <Link href="/opportunities" className="text-sm text-[#A1A1AA] hover:text-white flex items-center justify-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to all opportunities
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
