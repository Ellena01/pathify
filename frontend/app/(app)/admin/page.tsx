'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
  Activity,
  Database,
  Users,
  Radio,
  ListChecks,
  RefreshCw,
} from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { OPPORTUNITY_TYPE_LABELS, normalizeOpportunityType } from '@/lib/matching';
import { safeHref } from '@/lib/security';

/**
 * Platform administration.
 *
 * Every number here is a real database aggregate — there is no mock data and no
 * synthetic fallback. If the schema is missing a table the page says so rather
 * than rendering zeros that look like a healthy platform.
 *
 * Access is enforced server-side in `/api/admin/metrics` by checking
 * `user_profiles.is_admin` with the service-role client. Hiding the nav item is
 * cosmetic; the API is the boundary.
 */

interface Metrics {
  totalOpportunities: number;
  verifiedOpportunities: number;
  rejectedOpportunities: number;
  totalUsers: number;
  onboardedUsers: number;
  alertsOptedIn: number;
  computedMatches: number;
  trackedApplications: number;
  activeSources: number;
  totalSources: number;
}

interface SourceStat {
  domain: string;
  total: number;
  byType: Record<string, number>;
  verified: number;
  pending: number;
  lastSeen: string | null;
  ageDays: number | null;
  withDeadline: number;
  health: 'healthy' | 'stale' | 'dead';
}

interface QueueItem {
  application_url: string;
  title: string;
  organization: string | null;
  location: string | null;
  opportunity_type: string | null;
  source_domain: string | null;
  first_seen_at: string | null;
  deadline: string | null;
  review_note: string | null;
}

interface AuditEntry {
  id: number;
  action: string;
  target_url: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

interface AdminPayload {
  metrics: Metrics;
  sources: SourceStat[];
  types: Record<string, number>;
  queue: QueueItem[];
  audit: AuditEntry[];
}

const STATUS_TABS = [
  { value: 'review_recommended', label: 'Needs review' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'high', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusTab, setStatusTab] = useState('review_recommended');
  const [busyUrl, setBusyUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await fetch(`/api/admin/metrics?queueStatus=${statusTab}`, {
        cache: 'no-store',
      });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to load metrics (${res.status})`);
      }
      setData((await res.json()) as AdminPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin metrics');
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (url: string, status: 'high' | 'rejected') => {
      setBusyUrl(url);
      setError(null);
      try {
        const res = await fetch('/api/admin/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, status }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || 'Could not record decision');
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not record decision');
      } finally {
        setBusyUrl(null);
      }
    },
    [load]
  );

  if (forbidden) {
    return (
      <PageHeader eyebrow="Platform" title="Admin" subtitle="Restricted area">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-8 text-center">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-[#F5F5F7] mb-1.5">Access denied</h2>
          <p className="text-sm text-[#8B8B96] max-w-sm mx-auto">
            This account does not have administrator privileges. Set{' '}
            <code className="text-[#A78BFA]">is_admin = true</code> on your{' '}
            <code className="text-[#A78BFA]">user_profiles</code> row to grant access.
          </p>
        </div>
      </PageHeader>
    );
  }

  return (
    <PageHeader
      eyebrow="Platform"
      title="Administration"
      subtitle="Live platform metrics, source health, and listing moderation. All figures are read directly from the database."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-2 text-xs font-semibold text-[#F5F5F7] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-300"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-[#8B8B96]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading platform state…
        </div>
      ) : data ? (
        <div className="space-y-8">
          <section aria-label="Key metrics">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat
                icon={Database}
                label="Opportunities"
                value={data.metrics.totalOpportunities}
                hint={`${data.metrics.verifiedOpportunities} verified · ${data.metrics.rejectedOpportunities} rejected`}
              />
              <Stat
                icon={Users}
                label="Registered users"
                value={data.metrics.totalUsers}
                hint={`${data.metrics.onboardedUsers} onboarded · ${data.metrics.alertsOptedIn} alert opt-in`}
              />
              <Stat
                icon={Radio}
                label="Active sources"
                value={`${data.metrics.activeSources}/${data.metrics.totalSources}`}
                hint={
                  data.metrics.totalSources === 0
                    ? 'No source data yet'
                    : data.metrics.activeSources === 0
                      ? 'All sources stale'
                      : `${data.metrics.totalSources - data.metrics.activeSources} stale`
                }
              />
              <Stat
                icon={ListChecks}
                label="Matches computed"
                value={data.metrics.computedMatches}
                hint={`${data.metrics.trackedApplications} tracked applications`}
              />
            </div>
          </section>

          <section aria-label="Source health">
            <SectionHeading icon={Activity} title="Source health" />
            {data.sources.length === 0 ? (
              <EmptyRow message="No opportunities have been synced yet." />
            ) : (
              <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[46rem]">
                    <thead>
                      <tr className="border-b border-white/[0.08] bg-white/[0.02] text-left">
                        <Th>Source</Th>
                        <Th align="right">Listings</Th>
                        <Th align="right">Verified</Th>
                        <Th align="right">Pending</Th>
                        <Th align="right">With deadline</Th>
                        <Th align="right">Last seen</Th>
                        <Th align="right">Health</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources.map((source) => (
                        <tr
                          key={source.domain}
                          className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02]"
                        >
                          <Td>
                            <span className="font-medium text-[#F5F5F7]">{source.domain}</span>
                            <span className="block text-[11px] text-[#6B7280]">
                              {Object.entries(source.byType)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 2)
                                .map(([type, n]) => `${OPPORTUNITY_TYPE_LABELS[normalizeOpportunityType(type)]} ${n}`)
                                .join(' · ')}
                            </span>
                          </Td>
                          <Td align="right" mono>{source.total}</Td>
                          <Td align="right" mono>{source.verified}</Td>
                          <Td align="right" mono>{source.pending}</Td>
                          <Td align="right" mono>{source.withDeadline}</Td>
                          <Td align="right" mono>
                            {source.ageDays === null ? '—' : `${source.ageDays}d ago`}
                          </Td>
                          <Td align="right">
                            <HealthBadge health={source.health} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section aria-label="Moderation queue">
            <SectionHeading icon={ShieldCheck} title="Verification queue" />

            <div className="flex flex-wrap gap-1.5 mb-4">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusTab(tab.value)}
                  aria-pressed={statusTab === tab.value}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    statusTab === tab.value
                      ? 'bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/30'
                      : 'bg-white/[0.03] text-[#8B8B96] border-white/[0.08] hover:bg-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {data.queue.length === 0 ? (
              <EmptyRow message={`Nothing in "${STATUS_TABS.find((t) => t.value === statusTab)?.label}".`} />
            ) : (
              <ul className="space-y-2">
                {data.queue.map((item) => (
                  <li
                    key={item.application_url}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[13px] font-semibold text-[#F5F5F7] truncate">
                        {item.title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[#8B8B96] truncate">
                        {[item.organization, item.location, item.source_domain]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    <a
                      href={safeHref(item.application_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#8B5CF6] hover:text-[#A78BFA] shrink-0"
                    >
                      Inspect source
                    </a>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void decide(item.application_url, 'high')}
                        disabled={busyUrl === item.application_url}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#10B981]/25 bg-[#10B981]/10 hover:bg-[#10B981]/20 px-2.5 py-1.5 text-[11px] font-semibold text-[#10B981] transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />
                        Verify
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(item.application_url, 'rejected')}
                        disabled={busyUrl === item.application_url}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-400 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Audit log">
            <SectionHeading icon={ListChecks} title="Recent moderation activity" />
            {data.audit.length === 0 ? (
              <EmptyRow message="No moderation decisions recorded yet." />
            ) : (
              <ul className="space-y-1.5">
                {data.audit.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-2 text-[11px] text-[#8B8B96] rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                  >
                    <span className="font-medium text-[#A1A1AA]">
                      {entry.from_status ?? '—'} → {entry.to_status ?? '—'}
                    </span>
                    <span className="truncate max-w-md">{entry.target_url}</span>
                    {entry.note && <span className="text-[#6B7280]">{entry.note}</span>}
                    <span className="ml-auto tabular-nums text-[#6B7280] shrink-0">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </PageHeader>
  );
}

// ---------------------------------------------------------------------------

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-[#8B5CF6]" />
        <span className="text-[11px] uppercase tracking-wider text-[#8B8B96] font-semibold">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-[#F5F5F7] leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-[#6B7280] leading-snug">{hint}</p>}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-[#F5F5F7] mb-3">
      <Icon className="w-4 h-4 text-[#8B5CF6]" />
      {title}
    </h2>
  );
}

function HealthBadge({ health }: { health: SourceStat['health'] }) {
  const map = {
    healthy: { label: 'Healthy', className: 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/25' },
    stale: { label: 'Stale', className: 'bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/25' },
    dead: { label: 'Dead', className: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
  }[health];

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${map.className}`}
    >
      {map.label}
    </span>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] px-4 py-8 text-center text-sm text-[#6B7280]">
      {message}
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] uppercase tracking-wider font-semibold text-[#8B8B96] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-[#A1A1AA] ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
