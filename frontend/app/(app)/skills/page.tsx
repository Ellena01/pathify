'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, X, Check, Search, TrendingUp, Target, Layers, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { useUserStore } from '@/app/store';
import { useProfileAutosave } from '@/app/hooks/useAutosave';
import { searchSkills, normalizeSkill, SKILL_COUNT } from '@/lib/taxonomy';
import type { MatchedOpportunity } from '@/app/hooks/usePrecomputedMatches';

/**
 * /skills — the individual universe's skills inventory.
 *
 * Three questions, three sections, no empty middle:
 *
 *   1. What do I have?   → your skills, add/remove against the 96-skill taxonomy
 *   2. What is wanted?   → aggregated from the live catalog, not invented here
 *   3. What am I missing? → aggregated from the user's own stored matches
 *
 * Sections 2 and 3 are what make this different from an editable chip list:
 * the page has to be worth opening even on day one, which is why both are fed
 * by data the platform already holds. `/api/jobs` fails open to an empty array
 * and `/api/match` self-heals, so neither failure mode renders a blank panel —
 * each falls back to copy that says what is missing and where to go next.
 */

interface Stat {
  label: string;
  value: string;
  hint: string;
}

const CARD =
  'rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl';

export default function SkillsPage() {
  const { skills, isHydrated } = useUserStore();
  const { scheduleSave, status } = useProfileAutosave();

  const [query, setQuery] = useState('');
  const [demand, setDemand] = useState<Map<string, number> | null>(null);
  const [gapCounts, setGapCounts] = useState<Map<string, number> | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [demandError, setDemandError] = useState('');
  const [matchError, setMatchError] = useState('');

  const yours = useMemo(() => Array.isArray(skills) ? skills : [], [skills]);
  const yoursSet = useMemo(() => new Set(yours), [yours]);

  // ------------------------------------------------------------- in demand
  // Each loader starts with the fetch, never with a setState: an effect that
  // writes state synchronously re-renders the tree it is rendering, which is
  // exactly the cascade `react-hooks/set-state-in-effect` exists to prevent.
  const loadDemand = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const rows: unknown = await res.json();
      const counts = new Map<string, number>();
      if (Array.isArray(rows)) {
        for (const raw of rows) {
          const row = raw as { skills_required?: unknown };
          const required = Array.isArray(row.skills_required) ? row.skills_required : [];
          // Canonicalise every entry: the catalog carries whatever the crawler
          // extracted, and two spellings of one skill would split its count.
          for (const value of required) {
            const canonical = normalizeSkill(value);
            if (canonical) counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
          }
        }
      }
      setDemand(counts);
      setDemandError('');
    } catch (error) {
      setDemandError(error instanceof Error ? error.message : 'Could not reach the catalog.');
      setDemand(new Map());
    }
  }, []);

  // ----------------------------------------------------------------- gaps
  const loadGaps = useCallback(async () => {
    try {
      const res = await fetch('/api/match?limit=40', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { matches?: MatchedOpportunity[] };
      const matches = Array.isArray(data.matches) ? data.matches : [];

      const counts = new Map<string, number>();
      let matchedSkills = 0;
      let compared = 0;

      for (const match of matches) {
        const gap = match.match?.gap ?? [];
        for (const value of gap) {
          const canonical = normalizeSkill(value);
          if (canonical) counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
        }
        const covered = match.match?.matched?.length ?? 0;
        matchedSkills += covered;
        compared += covered + gap.length;
      }

      setGapCounts(counts);
      setCoverage(compared > 0 ? Math.round((matchedSkills / compared) * 100) : null);
      setMatchError('');
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'Could not load your matches.');
      setGapCounts(new Map());
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Awaiting inside a nested async function keeps the fetch off the
    // synchronous effect path (react-hooks/set-state-in-effect flags a bare
    // `void loadDemand()` because the loader writes state).
    void (async () => {
      await Promise.all([loadDemand(), loadGaps()]);
    })();
  }, [isHydrated, loadDemand, loadGaps]);

  // -------------------------------------------------------------- actions
  const addSkill = useCallback(
    (raw: string) => {
      const canonical = normalizeSkill(raw);
      if (!canonical || yoursSet.has(canonical)) return;
      scheduleSave({ skills: [...yours, canonical] });
    },
    [yours, yoursSet, scheduleSave]
  );

  const removeSkill = useCallback(
    (raw: string) => {
      const canonical = normalizeSkill(raw) ?? raw;
      if (!yoursSet.has(canonical)) return;
      scheduleSave({ skills: yours.filter((skill) => skill !== canonical) });
    },
    [yours, yoursSet, scheduleSave]
  );

  // ------------------------------------------------------------ derived UI
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchSkills(q, 8).filter((skill) => !yoursSet.has(skill));
  }, [query, yoursSet]);

  const topDemand = useMemo(() => {
    if (!demand) return [];
    return [...demand.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12);
  }, [demand]);

  const topGaps = useMemo(() => {
    if (!gapCounts) return [];
    return [...gapCounts.entries()]
      .filter(([skill]) => !yoursSet.has(skill))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10);
  }, [gapCounts, yoursSet]);

  const knownSkills = demand instanceof Map ? demand.size : 0;
  const stats: Stat[] = [
    {
      label: 'Your skills',
      value: isHydrated ? String(yours.length) : '—',
      hint: `of ${SKILL_COUNT} canonical skills`,
    },
    {
      label: 'In the catalog',
      value: demand ? String(knownSkills) : '…',
      hint: 'distinct skills wanted right now',
    },
    {
      label: 'Match coverage',
      value: coverage === null ? '—' : `${coverage}%`,
      hint: 'of requirements you already meet',
    },
    {
      label: 'Open gaps',
      value: gapCounts ? String(topGaps.length) : '…',
      hint: 'across your top matches',
    },
  ];

  const saving = status === 'saving';

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Identity"
        title="Skills inventory"
        subtitle="What you have, what is in demand, and the shortest path between the two."
        actions={
          <Link
            href="/pathways"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Open pathways
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        }
      />

      {/* ------------------------------------------------------ stat strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`${CARD} p-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B8B96]">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-[#F5F5F7]">{stat.value}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* --------------------------------------------------- your skills */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
                <Layers className="h-4 w-4 text-violet-400" />
                Your skills
              </h2>
              <p className="mt-1 text-xs text-[#8B8B96]">
                Every skill here feeds your four-factor score.
              </p>
            </div>
            <span
              className="text-xs font-medium text-[#8B8B96] tabular-nums"
              aria-live="polite"
            >
              {saving ? 'Saving…' : status === 'saved' ? 'Saved' : `${yours.length} listed`}
            </span>
          </header>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B96]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Add a skill — TypeScript, Grant Writing, Public Speaking…"
              aria-label="Search skills to add"
              className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[#8B8B96] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          {suggestions.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((skill) => (
                <li key={skill}>
                  <button
                    type="button"
                    onClick={() => {
                      addSkill(skill);
                      setQuery('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
                  >
                    <Plus className="h-3 w-3 text-violet-400" />
                    {skill}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.trim() && suggestions.length === 0 && (
            <p className="mt-2 text-xs text-[#8B8B96]">
              Not in the 96-skill taxonomy yet. Your score only counts canonical skills.
            </p>
          )}

          <div className="mt-4">
            {yours.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                <p className="text-sm font-medium text-[#C8C8D0]">No skills listed yet.</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                  Start with the skill you would be hired for tomorrow — search above, or take
                  the most demanded ones below.
                </p>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {yours.map((skill) => (
                  <li key={skill}>
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      aria-label={`Remove ${skill}`}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200"
                    >
                      {skill}
                      <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------- in demand */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                In demand now
              </h2>
              <p className="mt-1 text-xs text-[#8B8B96]">
                Counted across every visible listing in the catalog.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDemand()}
              className="rounded-lg p-1.5 text-[#8B8B96] transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Refresh demand"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </header>

          {demand === null ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[#8B8B96]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading the catalog…
            </div>
          ) : demandError || topDemand.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
              <p className="text-sm font-medium text-[#C8C8D0]">
                Demand has not been collected yet.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                {demandError ? `${demandError}. ` : ''}Browse the catalog directly — it is
                populated by the nightly sync.
              </p>
              <Link
                href="/opportunities"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
              >
                Go to opportunities
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {topDemand.map(([skill, count]) => {
                const owned = yoursSet.has(skill);
                return (
                  <li key={skill}>
                    <button
                      type="button"
                      disabled={owned}
                      onClick={() => addSkill(skill)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        owned
                          ? 'cursor-default border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-white/10 bg-white/[0.04] text-[#C8C8D0] hover:border-violet-500/50 hover:text-white'
                      }`}
                      title={owned ? 'Already in your inventory' : `Add ${skill}`}
                    >
                      {owned ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-violet-400" />}
                      {skill}
                      <span className="tabular-nums text-[#8B8B96]">{count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* --------------------------------------------------------- gaps */}
        <section className={`${CARD} p-5 sm:p-6 lg:col-span-2`}>
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
                <Target className="h-4 w-4 text-amber-400" />
                What your best matches are missing
              </h2>
              <p className="mt-1 text-xs text-[#8B8B96]">
                The skills that appear in your top matches but not on your profile, ordered by
                how often they cost you points.
              </p>
            </div>
            <Link
              href="/pathways"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
            >
              Build a plan
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          {gapCounts === null ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[#8B8B96]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading your matches…
            </div>
          ) : matchError || topGaps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <p className="text-sm font-medium text-[#C8C8D0]">
                {matchError ? 'Matches are unavailable right now.' : 'No open gaps in your top matches.'}
              </p>
              <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-[#8B8B96]">
                {matchError
                  ? `${matchError}. Nothing is broken — the inventory above still works.`
                  : yours.length === 0
                    ? 'List a few skills and Pathify will show exactly which requirements you are short on.'
                    : 'Your listed skills cover the requirements in your current matches. Add another skill to widen the net.'}
              </p>
              <Link
                href="/pathways"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
              >
                Open skill pathways
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topGaps.map(([skill, count]) => (
                <li
                  key={skill}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950/50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#F5F5F7]">{skill}</p>
                    <p className="text-xs text-[#8B8B96]">
                      missing from {count} of your top matches
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => addSkill(skill)}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
                    >
                      Add
                    </button>
                    <Link
                      href="/pathways"
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-violet-300 transition hover:border-violet-500/50 hover:text-violet-200"
                    >
                      Learn
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
