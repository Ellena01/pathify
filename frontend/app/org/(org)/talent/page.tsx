'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Plus,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { searchSkills, SKILL_COUNT } from '@/lib/taxonomy';
import { useUserStore } from '@/app/store';

/**
 * /org/talent — the marketplace.
 *
 * Reads `GET /api/org/talent/search`, which ranks every discoverable passport
 * against the organization's own `org_skills` and falls back to the seeded
 * baseline directory when fewer than three live profiles match. The fallback is
 * why every result carries `source`: a baseline row is honest about not being a
 * real account, and the Connect button is disabled for it rather than firing a
 * request that RLS would reject.
 */

interface TalentResult {
  id: string;
  source: 'live' | 'baseline';
  name: string;
  role: string;
  country: string;
  location?: string | null;
  skills: string[];
  goals: string[];
  passport_id?: string | null;
  bio?: string | null;
  compatibility: number | null;
  matched: string[];
  gap: string[];
  reachable: boolean;
}

interface SearchResponse {
  results: TalentResult[];
  count: number;
  source: 'live' | 'mixed' | 'baseline';
  orgSkills: string[];
  filtered: boolean;
  message?: string;
}

interface ConnectionSummary {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
}

const CARD = 'rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl';

export default function OrgTalentPage() {
  const userId = useUserStore((s) => s.id);
  const orgSkills = useUserStore((s) => s.org_skills);
  const orgName = useUserStore((s) => s.org_name);

  const [skill, setSkill] = useState('');
  const [location, setLocation] = useState('');
  const [applied, setApplied] = useState<{ skill: string; location: string }>({ skill: '', location: '' });

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // No setState before the first await — the effect below calls this, and an
  // effect that writes state synchronously re-renders while rendering.
  // Callers that want the spinner (buttons, retry) set `loading` themselves.
  const runSearch = useCallback(async (next: { skill: string; location: string }) => {
    try {
      const params = new URLSearchParams();
      if (next.skill) params.set('skill', next.skill);
      if (next.location) params.set('location', next.location);
      params.set('limit', '24');
      const res = await fetch(`/api/org/talent/search?${params.toString()}`, { cache: 'no-store' });
      const payload = (await res.json().catch(() => ({}))) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(payload.error || 'Search failed.');
      setData(payload);
      setError('');
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Event-handler wrapper: flips the spinner *before* the request, which is
   * allowed because a click is not an effect. `runSearch` itself stays free of
   * synchronous state writes so the mount effect can call it safely.
   */
  const startSearch = useCallback(
    (next: { skill: string; location: string }) => {
      setLoading(true);
      setError('');
      void runSearch(next);
    },
    [runSearch]
  );

  // Mark the requests already on the graph so a profile never offers a second.
  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch('/api/connections', { cache: 'no-store' });
      const payload = (await res.json().catch(() => ({}))) as { connections?: ConnectionSummary[] };
      if (!res.ok) return;
      const ids = new Set<string>();
      for (const connection of payload.connections ?? []) {
        if (connection.status === 'declined') continue;
        ids.add(
          connection.requester_id === userId ? connection.recipient_id : connection.requester_id
        );
      }
      setConnectedIds(ids);
    } catch {
      // The graph is an optimisation; the request path still guards duplicates.
    }
  }, [userId]);

  useEffect(() => {
    // Awaited inside a nested async function so the loaders' setState is not
    // reachable synchronously from the effect (react-hooks/set-state-in-effect).
    void (async () => {
      await Promise.all([
        runSearch({ skill: '', location: '' }),
        loadExisting(),
      ]);
    })();
  }, [runSearch, loadExisting]);

  const suggestions = useMemo(() => {
    const query = skill.trim().toLowerCase();
    if (!query) return [];
    return searchSkills(query, 8).filter((option) => option !== applied.skill);
  }, [skill, applied.skill]);

  const connect = useCallback(
    async (recipientId: string) => {
      setBusyId(recipientId);
      setNotice('');
      try {
        const res = await fetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'request',
            recipient_id: recipientId,
            message: note.trim() || undefined,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(payload.error || 'Could not send the request.');
        setConnectedIds((prev) => new Set(prev).add(recipientId));
        setOpenFor(null);
        setNote('');
        setNotice('Request sent. You will find the reply under Outreach.');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Could not send the request.');
      } finally {
        setBusyId(null);
      }
    },
    [note]
  );

  const clearFilters = useCallback(() => {
    setSkill('');
    setLocation('');
    setApplied({ skill: '', location: '' });
    startSearch({ skill: '', location: '' });
  }, [startSearch]);

  const results = data?.results ?? [];
  const hasFilters = Boolean(applied.skill || applied.location);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Hiring"
        title="Talent marketplace"
        subtitle={
          orgSkills && orgSkills.length > 0
            ? `Ranked against the ${orgSkills.length} skill${orgSkills.length === 1 ? '' : 's'} you hire for${orgName ? ` at ${orgName}` : ''}.`
            : 'Add your hiring skills in Settings and every result here re-ranks itself against them.'
        }
        actions={
          <Link
            href="/org/settings"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
          >
            Hiring skills
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {/* ------------------------------------------------------------ filters */}
      <div className={`${CARD} mb-6 p-4 sm:p-5`}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B96]" />
            <input
              value={skill}
              onChange={(event) => setSkill(event.target.value)}
              placeholder="Skill — React, Fundraising, Data Analysis…"
              aria-label="Filter by skill"
              className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[#8B8B96] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
            />
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-zinc-950 p-2">
                {suggestions.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => {
                        setSkill(option);
                        setApplied({ skill: option, location });
                        startSearch({ skill: option, location });
                      }}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
                    >
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B96]" />
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setApplied({ skill, location });
                  startSearch({ skill, location });
                }
              }}
              placeholder="Country or city — Lagos, Kenya, Remote…"
              aria-label="Filter by location"
              className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[#8B8B96] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setApplied({ skill, location });
                startSearch({ skill, location });
              }}
              className="group inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm font-semibold text-[#C8C8D0] transition hover:border-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-[#8B8B96]">
          Searching {SKILL_COUNT} canonical skills · {data?.count ?? 0} result
          {(data?.count ?? 0) === 1 ? '' : 's'}
          {data?.source && data.source !== 'live' && ' · including clearly-marked baseline profiles'}
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
            <X className="h-4 w-4 text-violet-200/70 hover:text-white" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}{' '}
          <button
            type="button"
            onClick={() => startSearch(applied)}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------- results */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[#8B8B96]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching passports…
        </div>
      ) : results.length === 0 ? (
        <div className={`${CARD} p-8 text-center`}>
          <Sparkles className="mx-auto h-8 w-8 text-violet-400/60" />
          <p className="mt-3 text-sm font-medium text-[#C8C8D0]">
            {hasFilters ? 'No profiles match those filters.' : 'No profiles are discoverable yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-[#8B8B96]">
            {data?.message ??
              'Talent appear once their passport is marked discoverable. Try a broader skill, or clear the filters.'}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((person) => {
            const already = connectedIds.has(person.id);
            const canConnect = person.reachable && !already;
            return (
              <li key={`${person.source}-${person.id}`} className={`${CARD} flex flex-col p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[#F5F5F7]">
                      <span className="truncate">{person.name}</span>
                      {person.source === 'baseline' && (
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#8B8B96]">
                          baseline
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#8B8B96]">
                      {[person.role, person.location || person.country].filter(Boolean).join(' · ') ||
                        'Talent'}
                    </p>
                    {person.passport_id && (
                      <p className="mt-1 font-mono text-[11px] text-violet-300">{person.passport_id}</p>
                    )}
                  </div>

                  {person.compatibility !== null && (
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-lg font-bold tabular-nums ${
                          person.compatibility >= 70
                            ? 'text-emerald-300'
                            : person.compatibility >= 40
                              ? 'text-amber-300'
                              : 'text-[#C8C8D0]'
                        }`}
                      >
                        {person.compatibility}%
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-[#8B8B96]">fit</p>
                    </div>
                  )}
                </div>

                {/* Compatibility bar — only when the org has stated its skills. */}
                {person.compatibility !== null && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        person.compatibility >= 70
                          ? 'bg-emerald-400'
                          : person.compatibility >= 40
                            ? 'bg-amber-400'
                            : 'bg-white/25'
                      }`}
                      style={{ width: `${person.compatibility}%` }}
                    />
                  </div>
                )}

                {person.skills.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {person.skills.slice(0, 5).map((skillName) => (
                      <li
                        key={skillName}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          person.matched.includes(skillName)
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                            : 'border-white/10 bg-white/[0.04] text-[#C8C8D0]'
                        }`}
                      >
                        {skillName}
                      </li>
                    ))}
                    {person.skills.length > 5 && (
                      <li className="px-1 py-0.5 text-[11px] text-[#8B8B96]">
                        +{person.skills.length - 5}
                      </li>
                    )}
                  </ul>
                )}

                {person.gap.length > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-[#8B8B96]">
                    Missing your needs: {person.gap.slice(0, 3).join(', ')}
                  </p>
                )}

                {person.bio && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#8B8B96]">{person.bio}</p>
                )}

                <div className="mt-auto pt-4">
                  {already ? (
                    <span className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-200">
                      <Check className="h-3.5 w-3.5" />
                      Request sent
                    </span>
                  ) : openFor === person.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        autoFocus
                        placeholder="Why them? A specific line beats a template."
                        aria-label="Connection note"
                        className="w-full resize-none rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-xs text-white outline-none transition placeholder:text-[#8B8B96] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === person.id || !person.reachable}
                          onClick={() => void connect(person.id)}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                        >
                          {busyId === person.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Send request
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenFor(null);
                            setNote('');
                          }}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-[#C8C8D0] transition hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canConnect}
                      onClick={() => {
                        setOpenFor(person.id);
                        setNote('');
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-500 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-transparent disabled:text-[#8B8B96]"
                      title={
                        !person.reachable
                          ? 'Baseline profile — not an account on Pathify yet'
                          : 'Send a connection request'
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {person.reachable ? 'Connect' : 'Not on Pathify yet'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
