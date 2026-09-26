import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, AlertCircle, MapPin, Calendar, Building2,
  Tag, Shield, ChevronRight, BookOpen, Target, Zap, Loader2,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { sanitizeExternalUrl } from '@/lib/security';
import { coerceStage } from '@/lib/tracker';
import { buildSubject, hasMatchableProfile, type ProfileRow } from '@/lib/profile-subject';
import { calculateMatch, matchResultFromStored, type MatchResult } from '@/lib/matching';
import { OpportunityActions } from './OpportunityActions';

/**
 * Opportunity detail.
 *
 * A Server Component. The previous version was a client component that fetched
 * `/api/jobs` and `.find()`-ed the record out of the returned catalog — so every
 * detail view downloaded up to 200 rows, each carrying a `raw_data` blob, to
 * display one listing, and the page rendered a spinner for the whole download.
 *
 * `opportunities_cache.application_url` is the primary key, so this reads one
 * row directly. The user's match comes from `user_opportunity_matches` (its own
 * composite primary key) or, if they have never run a match, from the one
 * deterministic engine in `lib/matching.ts` — never from a browser-side
 * recompute, and never from `opportunities_cache.match_score`, which is the
 * *scraper run operator's* score and not the visitor's.
 *
 * All three reads are issued together, so there is no waterfall. Interactivity
 * is confined to `<OpportunityActions>`, which receives its initial state as
 * props and therefore renders on the first paint.
 */

export const dynamic = 'force-dynamic';

/**
 * Explicit column list, so the detail page never pulls the `raw_data` blob (up
 * to 16 KiB per row) it does not render.
 *
 * MUST stay a single-line string literal. TypeScript widens a multi-line `+`
 * concatenation to `string`, and supabase-js then cannot parse the select and
 * types the result as `GenericStringError` — so every `opp.title` fails to
 * compile. Do not "tidy" this into a multi-line concatenation.
 */
const OPPORTUNITY_COLUMNS = `application_url, title, organization, location, opportunity_type, skills_required, verification_status, source_domain, source_platform, deadline, amount, description`;

function typeLabel(t: string | null) {
  return (t || 'opportunity').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#A1A1AA]">{label}</span>
        <span className="text-[#F5F5F7] font-medium tabular-nums">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The segment is percent-encoded by every link that reaches this page.
  // `decodeURIComponent` throws on a malformed sequence, so guard it — a bad URL
  // should be a 404, not a 500.
  let applicationUrl: string | null = null;
  try {
    applicationUrl = sanitizeExternalUrl(decodeURIComponent(id));
  } catch {
    applicationUrl = null;
  }
  if (!applicationUrl) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [opportunityResult, matchResult, trackerResult] = await Promise.all([
    supabase
      .from('opportunities_cache')
      .select(OPPORTUNITY_COLUMNS)
      .eq('application_url', applicationUrl)
      .eq('is_active', true)
      .neq('verification_status', 'rejected')
      .maybeSingle(),

    user
      ? supabase
          .from('user_opportunity_matches')
          .select('score, matched_skills, skill_gap, breakdown, explanation')
          .eq('user_id', user.id)
          .eq('opportunity_url', applicationUrl)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    user
      ? supabase
          .from('saved_jobs')
          .select('id, stage')
          .eq('user_id', user.id)
          .eq('job_url', applicationUrl)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // A listing that was retired (`is_active = false`) or rejected by a moderator
  // is indistinguishable from one that never existed, by design: reporting
  // which would leak the moderation queue.
  if (opportunityResult.error || !opportunityResult.data) notFound();

  const opp = opportunityResult.data;

  // --- Match: read the persisted score, else score once on the server ------
  let match: MatchResult | null = null;
  if (matchResult.data) {
    match = matchResultFromStored(matchResult.data as Record<string, unknown>);
  } else if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('country, role, skills, goals, metadata')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) {
      const subject = buildSubject(profile as ProfileRow);
      if (hasMatchableProfile(subject)) {
        match = calculateMatch(opp as Record<string, unknown>, subject);
      }
    }
  }

  const skills = (Array.isArray(opp.skills_required) ? opp.skills_required : [])
    .map((s: unknown) => (typeof s === 'string' ? s : (s as { canonical?: string })?.canonical ?? ''))
    .filter(Boolean);

  const owned = new Set(match?.matched.map((s) => s.toLowerCase()) ?? []);
  const domain = opp.source_domain || (() => {
    try { return new URL(opp.application_url).hostname.replace('www.', ''); } catch { return ''; }
  })();

  const description = (opp.description as string | null)?.trim() || '';
  const scoreColor = !match ? '#8B8B96' : match.score >= 80 ? '#10B981' : match.score >= 60 ? '#A78BFA' : '#8B5CF6';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#A1A1AA] pt-2">
        <Link href="/opportunities" className="hover:text-white transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to opportunities
        </Link>
        {opp.organization && (
          <>
            <ChevronRight className="w-3 h-3 text-[#8B8B96]" />
            <span className="text-[#8B8B96] truncate">{opp.organization}</span>
          </>
        )}
      </nav>

      {/* Hero */}
      <article className="bg-white/[0.05] border border-white/[0.10] rounded-2xl overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[#A78BFA] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-2.5 py-1 rounded-full">
                  {typeLabel(opp.opportunity_type)}
                </span>
                {opp.verification_status === 'high' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#10B981] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified source
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#F59E0B] font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" /> Check details before applying
                  </span>
                )}
                {opp.source_platform && (
                  <span className="text-[10px] font-medium text-[#8B8B96] border border-white/10 rounded-full px-2 py-0.5">
                    via {opp.source_platform}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{opp.title}</h1>

              <p className="text-[#A1A1AA] mt-2 flex items-center gap-1.5 text-base">
                <Building2 className="w-4 h-4 shrink-0" /> {opp.organization}
              </p>

              <div className="flex flex-wrap gap-4 mt-3 text-sm text-[#8B8B96]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />{opp.location || 'Remote'}
                </span>
                {opp.deadline && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />Deadline: {opp.deadline}
                  </span>
                )}
                {opp.amount && (
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="w-4 h-4" />{opp.amount}
                  </span>
                )}
                {domain && (
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />{domain}
                  </span>
                )}
              </div>
            </div>

            {/* Match ring, or an honest "not scored" state. Never a fabricated 0%. */}
            {match ? (
              <div className="shrink-0 text-center">
                <div className="relative w-20 h-20">
                  <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90" aria-hidden="true">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                    <circle
                      cx="40" cy="40" r="32" fill="none"
                      stroke={scoreColor} strokeWidth="5"
                      strokeDasharray="201" strokeDashoffset={201 - (201 * match.score) / 100}
                      strokeLinecap="round" className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black tabular-nums" style={{ color: scoreColor }}>
                      {match.score}%
                    </span>
                    <span className="text-[9px] text-[#8B8B96] font-medium">YOUR MATCH</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="shrink-0 text-center w-20">
                <div className="w-20 h-20 rounded-full border border-dashed border-white/15 flex items-center justify-center">
                  <Target className="w-6 h-6 text-[#8B8B96]" />
                </div>
                <span className="text-[9px] text-[#8B8B96] font-medium mt-1.5 block leading-tight">
                  {user ? 'Add skills to score' : 'Sign in to score'}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6">
            <OpportunityActions
              applicationUrl={opp.application_url}
              title={opp.title}
              organization={opp.organization}
              location={opp.location}
              opportunityType={opp.opportunity_type}
              deadline={opp.deadline}
              skillsRequired={skills}
              isSignedIn={Boolean(user)}
              initiallySaved={Boolean(trackerResult.data)}
              initialSavedId={trackerResult.data?.id ?? null}
              initialStage={trackerResult.data ? coerceStage(trackerResult.data.stage) : null}
              sourceDomain={domain || null}
            />
          </div>
        </div>
      </article>

      {/* Match intelligence */}
      {match ? (
        <section className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
          <h2 className="font-bold text-base flex items-center gap-2 mb-5">
            <Target className="w-5 h-5 text-[#8B5CF6]" /> Why this fits you
          </h2>
          {match.explanation && (
            <p className="text-sm text-[#A1A1AA] leading-relaxed mb-6">{match.explanation}</p>
          )}

          <div className="space-y-3 mb-6">
            <ScoreBar label="Skills alignment (60%)" value={match.breakdown.skills} max={60} color="#A78BFA" />
            <ScoreBar label="Location fit (20%)" value={match.breakdown.location} max={20} color="#8B5CF6" />
            <ScoreBar label="Goals alignment (10%)" value={match.breakdown.goals} max={10} color="#6D28D9" />
            <ScoreBar label="Experience fit (10%)" value={match.breakdown.experience} max={10} color="#4C1D95" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#10B981] mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> You already have ({match.matched.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {match.matched.length > 0 ? (
                  match.matched.map((s) => (
                    <span key={s} className="px-2.5 py-1 text-xs rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                      ✓ {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[#8B8B96] italic">None of the listed skills yet</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A78BFA] mb-2 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Next to learn ({match.gap.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {match.gap.length > 0 ? (
                  match.gap.map((s) => (
                    <span key={s} className="px-2.5 py-1 text-xs rounded-full bg-white/[0.05] text-[#A1A1AA] border border-white/[0.10]">
                      ○ {s}
                    </span>
                  ))
                ) : match.matched.length > 0 ? (
                  <span className="text-xs text-[#10B981]">You cover every listed skill — ready to apply.</span>
                ) : null}
              </div>
            </div>
          </div>

          {match.gap.length > 0 && (
            <Link
              href="/pathways"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#A78BFA] hover:text-white transition-colors"
            >
              Get a learning plan for your skill gaps →
            </Link>
          )}
        </section>
      ) : (
        <section className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
          <h2 className="font-bold text-base flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-[#8B5CF6]" /> Why you are seeing this
          </h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed">
            {user
              ? 'Add a few skills to your passport and Pathify will score every listing in the catalog against them — skills, location, goals and experience.'
              : 'Create a free Pathify Passport and every listing is ranked against your skills, location, goals and experience. The score is stored with your profile, so it is the same number in your feed, your email digest and on this page.'}
          </p>
          <Link
            href={user ? '/settings' : '/signup'}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#A78BFA] hover:text-white transition-colors"
          >
            {user ? 'Add skills to your passport' : 'Create your passport'} →
          </Link>
        </section>
      )}

      {/* Description */}
      {description && (
        <section className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
          <h2 className="font-bold text-base flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-[#8B5CF6]" /> About this opportunity
          </h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed whitespace-pre-line">{description}</p>
        </section>
      )}

      {/* Skills required */}
      {skills.length > 0 && (
        <section className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6">
          <h2 className="font-bold text-base mb-4">Skills required</h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((name) => {
              const have = owned.has(name.toLowerCase());
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
        </section>
      )}

      {/* Closing CTA */}
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
          className="inline-flex items-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold px-6 py-3 rounded-full shadow-[0_8px_32px_rgba(139,92,246,0.35)] transition-all text-sm shrink-0"
        >
          Apply on {domain || 'site'} <ExternalLinkIcon />
        </a>
      </div>

      <div className="text-center pt-2 pb-6">
        <Link href="/opportunities" className="text-sm text-[#A1A1AA] hover:text-white inline-flex items-center justify-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to all opportunities
        </Link>
      </div>
    </div>
  );
}

/** Kept local so the hero CTA does not pull the whole lucide surface. */
function ExternalLinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

/** Route-level error boundary target. Kept minimal; Next renders the default 404 otherwise. */
export function Loading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-7 h-7 text-[#8B5CF6] animate-spin mx-auto mb-3" />
        <p className="text-[#A1A1AA] text-sm">Loading opportunity…</p>
      </div>
    </div>
  );
}
