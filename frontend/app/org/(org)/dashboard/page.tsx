'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { ConnectionRuleNote } from '@/components/connections/ConnectionsWorkbench';
import { useUserStore } from '@/app/store';

/**
 * /org/dashboard — the organisation's home.
 *
 * It answers the only three questions a hiring side opens the product with:
 * who wants to talk to me, who should I approach, and is my profile complete
 * enough to be taken seriously. All three are read from APIs, so a brand-new
 * account sees a checklist rather than three empty panels — a dashboard that
 * renders "0" everywhere tells an organization the product is broken.
 */

interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  requester_label: string;
  recipient_label: string;
  status: 'pending' | 'accepted' | 'declined';
  message: string | null;
  created_at: string;
}

interface TalentResult {
  id: string;
  source: 'live' | 'baseline';
  name: string;
  role: string;
  country: string;
  skills: string[];
  compatibility: number | null;
  matched: string[];
  gap: string[];
  reachable: boolean;
}

const CARD = 'rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl';

export default function OrgDashboardPage() {
  const {
    id: userId,
    org_name,
    org_focus,
    org_skills,
    org_geo,
    isHydrated,
    account_type,
  } = useUserStore();

  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [talent, setTalent] = useState<TalentResult[]>([]);
  const [talentSource, setTalentSource] = useState('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [connectionsRes, talentRes] = await Promise.all([
        fetch('/api/connections', { cache: 'no-store' }),
        fetch('/api/org/talent/search?limit=6', { cache: 'no-store' }),
      ]);

      const connectionsData = (await connectionsRes.json().catch(() => ({}))) as {
        connections?: Connection[];
        error?: string;
      };
      if (connectionsRes.ok) {
        setConnections(Array.isArray(connectionsData.connections) ? connectionsData.connections : []);
      }

      const talentData = (await talentRes.json().catch(() => ({}))) as {
        results?: TalentResult[];
        source?: string;
        error?: string;
      };
      if (talentRes.ok) {
        setTalent(Array.isArray(talentData.results) ? talentData.results : []);
        setTalentSource(talentData.source ?? 'live');
      }

      if (!connectionsRes.ok && !talentRes.ok) {
        setError(connectionsData.error || talentData.error || 'Could not load your workspace.');
      } else {
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Awaited inside a nested async function: a bare `void load()` reads as a
    // synchronous state write from the effect (react-hooks/set-state-in-effect).
    void (async () => {
      await load();
    })();
  }, [isHydrated, load]);

  const incoming = useMemo(
    () => (connections ?? []).filter((c) => c.status === 'pending' && c.recipient_id === userId),
    [connections, userId]
  );
  const active = useMemo(
    () => (connections ?? []).filter((c) => c.status === 'accepted'),
    [connections]
  );
  const sent = useMemo(
    () => (connections ?? []).filter((c) => c.status === 'pending' && c.requester_id === userId),
    [connections, userId]
  );

  // A profile nobody can act on is the most common reason outreach stalls.
  const profileSteps = [
    { label: 'Organization name', done: Boolean(org_name) },
    { label: 'Talent focus', done: (org_focus ?? []).length > 0 },
    { label: 'Skills you hire for', done: (org_skills ?? []).length > 0 },
    { label: 'Geographic focus', done: (org_geo ?? []).length > 0 },
  ];
  const completedSteps = profileSteps.filter((step) => step.done).length;
  const profileReady = completedSteps === profileSteps.length;

  const stats = [
    { label: 'Incoming', value: loading ? '…' : String(incoming.length), hint: 'requests waiting on you', icon: Users },
    { label: 'Active', value: loading ? '…' : String(active.length), hint: 'connections you can message', icon: MessageSquare },
    { label: 'Sent', value: loading ? '…' : String(sent.length), hint: 'requests awaiting reply', icon: ArrowRight },
    { label: 'Profile', value: `${completedSteps}/4`, hint: 'setup steps complete', icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={account_type === 'investor' ? 'Investor workspace' : 'Organization workspace'}
        title={org_name ? `Welcome back, ${org_name}` : 'Your workspace'}
        subtitle="Pipeline, requests and the shortlist — with the next useful action always in reach."
        actions={
          <Link
            href="/org/talent"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            <Search className="h-4 w-4" />
            Search talent
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError('');
              void load();
            }}
            className="font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B8B96]">
                  {stat.label}
                </p>
                <Icon className="h-3.5 w-3.5 text-violet-400/70" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#F5F5F7]">{stat.value}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">{stat.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------------- setup checklist */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
                <Building2 className="h-4 w-4 text-violet-400" />
                Profile readiness
              </h2>
              <p className="mt-1 text-xs text-[#8B8B96]">
                Every field here is what talent sees before accepting.
              </p>
            </div>
            <span className="text-xs font-semibold tabular-nums text-[#8B8B96]">
              {completedSteps}/4
            </span>
          </header>

          <ul className="space-y-2">
            {profileSteps.map((step) => (
              <li
                key={step.label}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                  step.done
                    ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-100'
                    : 'border-white/10 bg-white/[0.03] text-[#C8C8D0]'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    step.done
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/15 text-[#8B8B96]'
                  }`}
                >
                  {step.done ? '✓' : ''}
                </span>
                {step.label}
              </li>
            ))}
          </ul>

          <Link
            href="/org/settings"
            className="group mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-sm font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
          >
            {profileReady ? 'Review profile' : 'Complete your profile'}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>

          {!profileReady && (
            <p className="mt-3 text-xs leading-relaxed text-[#8B8B96]">
              Matching ranks talent against your skills — with none listed, every profile scores
              the same.
            </p>
          )}
        </section>

        {/* -------------------------------------------------------- shortlist */}
        <section className={`${CARD} p-5 sm:p-6 lg:col-span-2`}>
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
                <Sparkles className="h-4 w-4 text-violet-400" />
                Who to approach first
              </h2>
              <p className="mt-1 text-xs text-[#8B8B96]">
                Ranked against the skills you hire for.{' '}
                {talentSource !== 'live' &&
                  'Baseline profiles are included so the list is never empty; only live passports can be contacted.'}
              </p>
            </div>
            <Link
              href="/org/talent"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
            >
              Open marketplace
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[#8B8B96]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your shortlist…
            </div>
          ) : talent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
              <p className="text-sm font-medium text-[#C8C8D0]">
                No profiles to show under your current filters.
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#8B8B96]">
                The marketplace fills as talent publishes passports. Your own skills are what
                make the ranking useful once they do.
              </p>
              <Link
                href="/org/settings"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
              >
                Set your hiring skills
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {talent.slice(0, 4).map((person) => (
                <li
                  key={person.id}
                  className="rounded-xl border border-white/10 bg-zinc-950/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#F5F5F7]">{person.name}</p>
                      <p className="truncate text-xs text-[#8B8B96]">
                        {[person.role, person.country].filter(Boolean).join(' · ') || 'Talent'}
                      </p>
                    </div>
                    {person.compatibility !== null && (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                          person.compatibility >= 70
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                            : person.compatibility >= 40
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              : 'border-white/10 bg-white/[0.04] text-[#C8C8D0]'
                        }`}
                      >
                        {person.compatibility}%
                      </span>
                    )}
                  </div>

                  {person.skills.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {person.skills.slice(0, 4).map((skill) => (
                        <li
                          key={skill}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-[#C8C8D0]"
                        >
                          {skill}
                        </li>
                      ))}
                      {person.skills.length > 4 && (
                        <li className="px-1 py-0.5 text-[11px] text-[#8B8B96]">
                          +{person.skills.length - 4}
                        </li>
                      )}
                    </ul>
                  )}

                  <p className="mt-3 text-[11px] text-[#8B8B96]">
                    {person.source === 'baseline'
                      ? 'Baseline profile — appears in search until they join.'
                      : person.matched.length > 0
                        ? `Shares ${person.matched.length} of your skills`
                        : 'Live passport'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConnectionRuleNote mode="org" />
    </div>
  );
}
