'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Route,
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  Target,
  Hammer,
  Flag,
  Sparkles,
} from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { getPathway, hasBespokePathway } from '@/lib/pathways';
import { skillCategory } from '@/lib/taxonomy';
import { resolveSkills } from '@/lib/taxonomy';
import { useUserStore } from '@/app/store';

/**
 * Skill pathways.
 *
 * Aggregates the skills blocking the user's best matches and turns each into a
 * concrete, ordered plan with a project and a milestone.
 *
 * Gap data comes from `/api/match`, which persists `skill_gap` per opportunity.
 * When no matches have been computed yet the page falls back to comparing the
 * user's declared skills against the catalogue, so it is never a dead end.
 */

interface MatchedOpportunity {
  application_url: string;
  title?: string;
  organization?: string;
  match: { score: number; gap: string[] };
}

type GapSource = { skill: string; blocked: number; topScore: number; titles: string[] };

export default function PathwaysPage() {
  const user = useUserStore();
  const [gaps, setGaps] = useState<GapSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMatches, setHasMatches] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/match?limit=50', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to load matches (${res.status})`);
      }
      const body = (await res.json()) as { matches?: MatchedOpportunity[] };
      const matches = body.matches ?? [];

      setHasMatches(matches.length > 0);

      // Count how many opportunities each missing skill is blocking, and keep
      // the highest-scoring ones so the user sees the stakes.
      const accumulator = new Map<string, { count: number; topScore: number; titles: string[] }>();
      for (const match of matches) {
        const gap = Array.isArray(match.match?.gap) ? match.match.gap : [];
        for (const raw of gap) {
          if (typeof raw !== 'string' || !raw) continue;
          const entry = accumulator.get(raw) ?? { count: 0, topScore: 0, titles: [] };
          entry.count += 1;
          if ((match.match?.score ?? 0) > entry.topScore) {
            entry.topScore = match.match?.score ?? 0;
            entry.titles = [match.title ?? 'Untitled'];
          } else if (entry.titles.length < 3) {
            entry.titles.push(match.title ?? 'Untitled');
          }
          accumulator.set(raw, entry);
        }
      }

      setGaps(
        [...accumulator.entries()]
          .map(([skill, v]) => ({ skill, blocked: v.count, topScore: v.topScore, titles: v.titles }))
          .sort((a, b) => b.blocked - a.blocked || b.topScore - a.topScore)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your skill gaps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // With no computed matches, fall back to skills the user has not declared,
  // so the page still offers a concrete next step.
  const fallbackGaps = useMemo<GapSource[]>(() => {
    if (hasMatches || user.skills.length === 0) return [];
    const owned = new Set(resolveSkills(user.skills).map((s) => s.canonical.toLowerCase()));
    return ['Python', 'React', 'TypeScript', 'SQL', 'Git']
      .filter((s) => !owned.has(s.toLowerCase()))
      .map((skill) => ({ skill, blocked: 0, topScore: 0, titles: [] }));
  }, [hasMatches, user.skills]);

  const displayed = gaps.length > 0 ? gaps : fallbackGaps;

  return (
    <PageHeader
      eyebrow="Progress"
      title="Skill Pathways"
      subtitle={
        hasMatches
          ? 'Each pathway is the shortest credible route to closing a gap that is currently costing you matches.'
          : 'Run a match to see exactly which skills are blocking you, then follow a plan for each.'
      }
      actions={
        !hasMatches ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] px-3.5 py-2 text-xs font-semibold text-white transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Run my matches
          </Link>
        ) : undefined
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-300"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-[#8B8B96]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Working out your gaps…
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {displayed.map((gap) => (
            <PathwayCard key={gap.skill} gap={gap} showStakes={gap.blocked > 0} />
          ))}
        </div>
      )}
    </PageHeader>
  );
}

// ---------------------------------------------------------------------------

interface PathwayCardProps {
  gap: GapSource;
  showStakes: boolean;
}

function PathwayCard({ gap, showStakes }: PathwayCardProps) {
  const pathway = useMemo(() => getPathway(gap.skill), [gap.skill]);
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const bespoke = hasBespokePathway(gap.skill);
  const category = skillCategory(gap.skill);

  const completedCount = done.size;
  const progress = Math.round((completedCount / pathway.steps.length) * 100);

  const toggle = (index: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <header className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#F5F5F7]">{pathway.skill}</h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-white/[0.06] text-[#8B8B96]">
                {category}
              </span>
              {bespoke ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">
                  Curated
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] text-[#6B7280]">
                  General plan
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-[#8B8B96] leading-relaxed">{pathway.summary}</p>
          </div>

          {showStakes && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold tabular-nums text-[#F5F5F7] leading-none">
                {gap.blocked}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#8B8B96] mt-1">
                blocked
              </p>
            </div>
          )}
        </div>

        {showStakes && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#8B8B96]">
            <Target className="w-3 h-3 text-[#8B5CF6]" />
            <span>
              Your best blocked match is {gap.topScore}%
              {gap.titles[0] ? ` — ${gap.titles[0]}` : ''}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#10B981] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-[#8B8B96] shrink-0">
            {completedCount}/{pathway.steps.length}
          </span>
          <span className="text-[11px] text-[#6B7280] shrink-0">
            ~{pathway.durationWeeks}w
          </span>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-[#8B8B96] hover:text-[#F5F5F7] border-t border-white/[0.06] transition-colors"
      >
        {expanded ? 'Hide' : 'Show'} step-by-step plan
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="p-5 pt-4 border-t border-white/[0.06] space-y-5">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#8B5CF6] mb-2.5">
              Steps
            </h3>
            <ol className="space-y-2">
              {pathway.steps.map((step, index) => {
                const isDone = done.has(index);
                return (
                  <li key={step.title}>
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-pressed={isDone}
                      className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                        isDone
                          ? 'border-[#10B981]/25 bg-[#10B981]/[0.07]'
                          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isDone
                            ? 'bg-[#10B981] border-[#10B981]'
                            : 'border-white/[0.15] bg-transparent'
                        }`}
                      >
                        {isDone ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : (
                          <span className="text-[10px] tabular-nums text-[#8B8B96]">
                            {index + 1}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[13px] font-semibold ${
                            isDone ? 'text-[#10B981] line-through' : 'text-[#F5F5F7]'
                          }`}
                        >
                          {step.title}
                        </span>
                        <span className="block mt-1 text-xs text-[#8B8B96] leading-relaxed">
                          {step.detail}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-[#8B8B96]">
                            {step.effort}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#8B5CF6]/10 text-[#A78BFA] border border-[#8B5CF6]/15">
                            {step.resource}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Hammer className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#8B8B96]">
                  Build this
                </h3>
              </div>
              <p className="text-[13px] font-semibold text-[#F5F5F7] mb-1">
                {pathway.project.title}
              </p>
              <p className="text-xs text-[#8B8B96] leading-relaxed">{pathway.project.brief}</p>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Flag className="w-3.5 h-3.5 text-[#10B981]" />
                <h3 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#8B8B96]">
                  Milestone
                </h3>
              </div>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">{pathway.milestone}</p>
            </div>
          </div>

          <p className="text-xs text-[#6B7280] leading-relaxed border-l-2 border-white/[0.08] pl-3">
            {pathway.why}
          </p>
        </div>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] py-20 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20 flex items-center justify-center mx-auto mb-4">
        <Route className="w-5 h-5 text-[#10B981]" />
      </div>
      <h2 className="text-base font-semibold text-[#F5F5F7] mb-1.5">No gaps to close</h2>
      <p className="text-sm text-[#8B8B96] max-w-sm mx-auto mb-6">
        You are matching everything in your current pipeline. Add more skills to your passport, or
        browse opportunities in a new direction.
      </p>
      <Link
        href="/opportunities"
        className="inline-flex items-center gap-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-[0_0_20px_rgba(139,92,246,0.25)]"
      >
        Browse opportunities
      </Link>
    </div>
  );
}
