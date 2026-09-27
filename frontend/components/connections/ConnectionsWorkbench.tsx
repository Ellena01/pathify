'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clock,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import { SecondaryTabs } from '@/components/layout/SecondaryTabs';
import { useUserStore } from '@/app/store';

/**
 * The shared connection surface.
 *
 * `/connections` (talent) and `/org/outreach` (organisation) render this same
 * component with a different `mode`, because the two are one conversation
 * viewed from opposite ends: the request the org sends is the request the
 * individual reads. Keeping a single implementation is what stops the two
 * sides from disagreeing about what "pending" or "accepted" means.
 *
 * Everything here is a read/write against three routes the server owns:
 *
 *   GET  /api/connections?directory=1   my graph + the opposite directory
 *   POST /api/connections               request | respond | withdraw
 *   GET  /api/outreach[?connection_id]  threads | one thread
 *   POST /api/outreach                  send a message (accepted only)
 *
 * Labels and statuses are never invented client-side — `requester_label`,
 * `recipient_label` and `status` come back from the database, where a trigger
 * and RLS own them.
 */

interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  requester_label: string;
  recipient_label: string;
  requester_account_type: string;
  recipient_passport_id: string | null;
  status: 'pending' | 'accepted' | 'declined';
  message: string | null;
  created_at: string;
  updated_at: string;
}

interface DirectoryEntry {
  id: string;
  kind: 'organization' | 'talent';
  label: string;
  sub: string | null;
  focus: string[];
  skills: string[];
  passport_id: string | null;
  reachable: boolean;
}

interface ThreadMessage {
  id: string;
  connection_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface Thread extends Connection {
  counterpart: { id: string; label: string; passport_id: string | null };
  last_message: { body: string; created_at: string; sender_id: string } | null;
}

const CARD = 'rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl';

const STATUS_PILL: Record<Connection['status'], string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  accepted: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  declined: 'border-white/10 bg-white/[0.04] text-[#8B8B96]',
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '';
  const delta = Date.now() - parsed;
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ConnectionsWorkbenchProps {
  mode: 'individual' | 'org';
}

export function ConnectionsWorkbench({ mode }: ConnectionsWorkbenchProps) {
  const isOrgMode = mode === 'org';
  const userId = useUserStore((s) => s.id);
  const isHydrated = useUserStore((s) => s.isHydrated);

  const [tab, setTab] = useState<'requests' | 'directory' | 'messages'>('requests');
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Active thread.
  //
  // Messages are cached per thread rather than held in a single slot that an
  // effect resets on every switch: a slot would need `setMessages(null)` in an
  // effect body — a synchronous write during render — and it would re-fetch a
  // thread the user already read. Keyed by id, a thread loads once, survives
  // tab changes, and `undefined` still means "not loaded yet".
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesByThread, setMessagesByThread] = useState<
    Record<string, ThreadMessage[] | undefined>
  >({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const myId = userId || '';
  const messages: ThreadMessage[] | null | undefined = activeId
    ? messagesByThread[activeId]
    : null;

  const loadGraph = useCallback(async () => {
    try {
      const res = await fetch('/api/connections?directory=1', { cache: 'no-store' });
      const data = (await res.json()) as { connections?: Connection[]; directory?: DirectoryEntry[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not load connections.');
      setConnections(Array.isArray(data.connections) ? data.connections : []);
      setDirectory(Array.isArray(data.directory) ? data.directory : []);
      setError('');
    } catch (err) {
      setConnections((prev) => prev ?? []);
      setError(err instanceof Error ? err.message : 'Could not load connections.');
    }
  }, []);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch('/api/outreach', { cache: 'no-store' });
      const data = (await res.json()) as { threads?: Thread[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not load messages.');
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch (err) {
      setThreads((prev) => prev ?? []);
      setError(err instanceof Error ? err.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Awaited inside a nested async function: a bare `void loadGraph()` would
    // be read as a synchronous state write from the effect body
    // (react-hooks/set-state-in-effect).
    void (async () => {
      await Promise.all([loadGraph(), loadThreads()]);
    })();
  }, [isHydrated, loadGraph, loadThreads]);

  useEffect(() => {
    const threadId = activeId;
    if (!threadId || messagesByThread[threadId]) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/outreach?connection_id=${encodeURIComponent(threadId)}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as { messages?: ThreadMessage[]; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not load the thread.');
        if (!cancelled) {
          setMessagesByThread((prev) => ({
            ...prev,
            [threadId]: Array.isArray(data.messages) ? data.messages : [],
          }));
        }
      } catch (err) {
        if (!cancelled) {
          setMessagesByThread((prev) => ({ ...prev, [threadId]: [] }));
          setNotice(err instanceof Error ? err.message : 'Could not load the thread.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, messagesByThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages?.length]);

  // ------------------------------------------------------------- mutations
  const postConnection = useCallback(
    async (payload: Record<string, unknown>) => {
      setNotice('');
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'That did not go through.');
      await Promise.all([loadGraph(), loadThreads()]);
    },
    [loadGraph, loadThreads]
  );

  const respond = useCallback(
    async (id: string, status: 'accepted' | 'declined') => {
      setBusyId(id);
      try {
        await postConnection({ action: 'respond', id, status });
        setNotice(status === 'accepted' ? 'Connection accepted — you can message now.' : 'Request declined.');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Could not update the request.');
      } finally {
        setBusyId(null);
      }
    },
    [postConnection]
  );

  const withdraw = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await postConnection({ action: 'withdraw', id });
        setNotice('Request withdrawn.');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Could not withdraw the request.');
      } finally {
        setBusyId(null);
      }
    },
    [postConnection]
  );

  const sendRequest = useCallback(
    async (recipientId: string) => {
      setBusyId(recipientId);
      try {
        await postConnection({ action: 'request', recipient_id: recipientId });
        setNotice('Request sent. You will see it under Sent.');
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Could not send the request.');
      } finally {
        setBusyId(null);
      }
    },
    [postConnection]
  );

  const sendMessage = useCallback(
    async (connectionId: string) => {
      const body = draft.trim();
      if (!body || sending) return;
      setSending(true);
      setNotice('');
      try {
        const res = await fetch('/api/outreach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connection_id: connectionId, body }),
        });
        const data = (await res.json().catch(() => ({}))) as { message?: ThreadMessage; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not send the message.');
        setMessagesByThread((prev) => ({
          ...prev,
          [connectionId]: [...(prev[connectionId] ?? []), data.message as ThreadMessage],
        }));
        setDraft('');
        await loadThreads();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Could not send the message.');
      } finally {
        setSending(false);
      }
    },
    [draft, sending, loadThreads]
  );

  // -------------------------------------------------------------- derived
  const counterpartOf = useCallback(
    (connection: Connection) => {
      const iAmRequester = connection.requester_id === myId;
      return {
        label: iAmRequester ? connection.recipient_label : connection.requester_label,
        passportId: iAmRequester ? connection.recipient_passport_id : null,
        id: iAmRequester ? connection.recipient_id : connection.requester_id,
      };
    },
    [myId]
  );

  const incoming = useMemo(
    () =>
      (connections ?? []).filter((c) => c.status === 'pending' && c.recipient_id === myId),
    [connections, myId]
  );
  const sent = useMemo(
    () => (connections ?? []).filter((c) => c.status === 'pending' && c.requester_id === myId),
    [connections, myId]
  );
  const settled = useMemo(
    () => (connections ?? []).filter((c) => c.status !== 'pending'),
    [connections]
  );

  /** Ids that already have an open or settled connection, so the directory stops offering them. */
  const connectedIds = useMemo(
    () => new Set((connections ?? []).map((c) => (c.requester_id === myId ? c.recipient_id : c.requester_id))),
    [connections, myId]
  );

  const activeThread = useMemo(
    () => (threads ?? []).find((t) => t.id === activeId) ?? null,
    [threads, activeId]
  );

  const tabs = isOrgMode
    ? [
        { id: 'requests', label: 'Requests', icon: Users, badge: incoming.length || undefined },
        { id: 'messages', label: 'Messages', icon: MessageSquare, badge: threads?.length || undefined },
      ]
    : [
        { id: 'requests', label: 'Requests', icon: Users, badge: incoming.length || undefined },
        { id: 'directory', label: 'Directory', icon: ShieldCheck },
        { id: 'messages', label: 'Messages', icon: MessageSquare, badge: threads?.length || undefined },
      ];

  return (
    <div className="mx-auto max-w-6xl">
      <SecondaryTabs
        tabs={tabs}
        activeTab={tab}
        onTabChange={(next) => setTab(next as 'requests' | 'directory' | 'messages')}
        className="mb-6"
      />

      {notice && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            aria-label="Dismiss"
            className="text-violet-200/70 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}{' '}
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => {
              setError('');
              setLoading(true);
              void loadGraph();
              void loadThreads();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ------------------------------------------------------- requests */}
      {tab === 'requests' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={`${CARD} p-5 sm:p-6`}>
            <h2 className="text-base font-semibold text-[#F5F5F7]">Waiting on you</h2>
            <p className="mt-1 text-xs text-[#8B8B96]">
              {isOrgMode
                ? 'Talent who asked to connect with your organization.'
                : 'Organizations that reached out to your passport.'}
            </p>

            <div className="mt-4 space-y-3">
              {incoming.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                  <p className="text-sm font-medium text-[#C8C8D0]">Nothing waiting on you.</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                    {isOrgMode
                      ? 'Keep your skills and focus current — talent accept faster when the ask is specific.'
                      : 'Make your passport public under Settings to appear in the organization directory.'}
                  </p>
                  <Link
                    href={isOrgMode ? '/org/talent' : '/settings'}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                  >
                    {isOrgMode ? 'Search talent' : 'Open settings'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                incoming.map((connection) => {
                  const other = counterpartOf(connection);
                  return (
                    <article
                      key={connection.id}
                      className="rounded-xl border border-white/10 bg-zinc-950/50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#F5F5F7]">{other.label}</p>
                          {other.passportId && (
                            <p className="mt-0.5 font-mono text-[11px] text-violet-300">{other.passportId}</p>
                          )}
                          <p className="mt-1 text-xs text-[#8B8B96]">{formatWhen(connection.created_at)}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[connection.status]}`}
                        >
                          {connection.status}
                        </span>
                      </div>
                      {connection.message && (
                        <p className="mt-3 text-sm leading-relaxed text-[#C8C8D0]">
                          “{connection.message}”
                        </p>
                      )}
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === connection.id}
                          onClick={() => void respond(connection.id, 'accepted')}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                        >
                          {busyId === connection.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busyId === connection.id}
                          onClick={() => void respond(connection.id, 'declined')}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 text-xs font-semibold text-[#C8C8D0] transition hover:border-white/20 hover:text-white disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" />
                          Decline
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className={`${CARD} p-5 sm:p-6`}>
            <h2 className="text-base font-semibold text-[#F5F5F7]">Sent by you</h2>
            <p className="mt-1 text-xs text-[#8B8B96]">
              Open requests expire from this list once the other side responds.
            </p>

            <div className="mt-4 space-y-3">
              {sent.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                  <p className="text-sm font-medium text-[#C8C8D0]">You have not sent a request.</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                    {isOrgMode
                      ? 'Find someone worth hiring in the talent marketplace.'
                      : 'Browse the directory to reach an organization first.'}
                  </p>
                  <Link
                    href={isOrgMode ? '/org/talent' : '/connections'}
                    onClick={(event) => {
                      if (!isOrgMode) {
                        event.preventDefault();
                        setTab('directory');
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                  >
                    {isOrgMode ? 'Search talent' : 'Open directory'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                sent.map((connection) => {
                  const other = counterpartOf(connection);
                  return (
                    <article
                      key={connection.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-950/50 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F5F5F7]">{other.label}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[#8B8B96]">
                          <Clock className="h-3 w-3" />
                          sent {formatWhen(connection.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[connection.status]}`}
                        >
                          {connection.status}
                        </span>
                        <button
                          type="button"
                          disabled={busyId === connection.id}
                          onClick={() => void withdraw(connection.id)}
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-[#8B8B96] transition hover:border-red-500/40 hover:text-red-200 disabled:opacity-60"
                        >
                          Withdraw
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {settled.length > 0 && (
              <div className="mt-6 border-t border-white/[0.08] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8B8B96]">
                  Earlier
                </p>
                <ul className="mt-3 space-y-2">
                  {settled.slice(0, 6).map((connection) => {
                    const other = counterpartOf(connection);
                    return (
                      <li
                        key={connection.id}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="truncate text-[#C8C8D0]">{other.label}</span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[connection.status]}`}
                        >
                          {connection.status}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ------------------------------------------------------ directory */}
      {tab === 'directory' && !isOrgMode && (
        <section className={`${CARD} p-5 sm:p-6`}>
          <h2 className="text-base font-semibold text-[#F5F5F7]">Organizations on Pathify</h2>
          <p className="mt-1 text-xs text-[#8B8B96]">
            Funds and companies that completed onboarding. A request opens a conversation —
            they see your passport only once you accept.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {directory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center sm:col-span-2">
                <p className="text-sm font-medium text-[#C8C8D0]">No organizations have joined yet.</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-[#8B8B96]">
                  The directory fills as organizations finish onboarding. Until then, your
                  passport and matches keep working exactly as before.
                </p>
                <Link
                  href="/opportunities"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                >
                  Browse opportunities
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              directory.map((entry) => {
                const already = connectedIds.has(entry.id);
                return (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-white/10 bg-zinc-950/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[#F5F5F7]">
                          <Users className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                          {entry.label}
                        </p>
                        {entry.sub && <p className="mt-0.5 truncate text-xs text-[#8B8B96]">{entry.sub}</p>}
                      </div>
                    </div>

                    {entry.focus.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {entry.focus.slice(0, 4).map((focus) => (
                          <li
                            key={focus}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-[#C8C8D0]"
                          >
                            {focus}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-4">
                      {already ? (
                        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200">
                          <Check className="h-3.5 w-3.5" />
                          Requested
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === entry.id || !entry.reachable}
                          onClick={() => void sendRequest(entry.id)}
                          className="group inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-500 px-3 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyId === entry.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- messages */}
      {tab === 'messages' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <section className={`${CARD} p-4`}>
            <div className="flex items-center justify-between px-2 pb-3">
              <h2 className="text-sm font-semibold text-[#F5F5F7]">Conversations</h2>
              <span className="text-xs text-[#8B8B96] tabular-nums">{threads?.length ?? 0}</span>
            </div>

            <ul className="space-y-1.5">
              {loading ? (
                <li className="flex items-center gap-2 px-2 py-6 text-sm text-[#8B8B96]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading threads…
                </li>
              ) : threads === null || threads.length === 0 ? (
                <li className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                  <p className="text-sm font-medium text-[#C8C8D0]">No conversations yet.</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                    Messaging unlocks the moment a connection is accepted — cold outreach has no
                    inbox here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('requests')}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200"
                  >
                    Review requests
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </li>
              ) : (
                threads.map((thread) => {
                  const isActive = thread.id === activeId;
                  return (
                    <li key={thread.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(thread.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? 'border-violet-500/40 bg-violet-500/10'
                            : 'border-transparent hover:border-white/10 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[#F5F5F7]">
                            {thread.counterpart.label}
                          </span>
                          <span className="shrink-0 text-[11px] text-[#8B8B96]">
                            {formatWhen(thread.last_message?.created_at ?? thread.updated_at)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#8B8B96]">
                          {thread.last_message?.body ?? 'Connection accepted — say hello.'}
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className={`${CARD} flex min-h-[28rem] flex-col p-4`}>
            {!activeThread ? (
              <div className="m-auto max-w-sm text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-violet-400/60" />
                <p className="mt-3 text-sm font-medium text-[#C8C8D0]">Pick a conversation</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                  Threads are one per accepted connection. Both sides see the same history, and
                  neither can edit it after sending.
                </p>
              </div>
            ) : (
              <>
                <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-2 pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#F5F5F7]">
                      {activeThread.counterpart.label}
                    </p>
                    {activeThread.counterpart.passport_id && (
                      <p className="truncate font-mono text-[11px] text-violet-300">
                        {activeThread.counterpart.passport_id}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[activeThread.status]}`}
                  >
                    {activeThread.status}
                  </span>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto px-1 py-4">
                  {!messages ? (
                    <div className="flex items-center gap-2 text-sm text-[#8B8B96]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                      <p className="text-sm font-medium text-[#C8C8D0]">No messages yet.</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                        {activeThread.message
                          ? `Opening line from the request: “${activeThread.message}”`
                          : 'Say what you are looking for — specific asks get specific answers.'}
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const mine = message.sender_id === myId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                              mine
                                ? 'bg-violet-500 text-white'
                                : 'border border-white/10 bg-white/[0.05] text-[#E4E4E7]'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                            <p
                              className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-[#8B8B96]'}`}
                            >
                              {formatWhen(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMessage(activeThread.id);
                  }}
                  className="flex items-end gap-2 border-t border-white/[0.08] pt-3"
                >
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage(activeThread.id);
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                    aria-label="Message"
                    className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition placeholder:text-[#8B8B96] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="group inline-flex h-11 items-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default ConnectionsWorkbench;

/** Shared footer note used by both pages, so the rule reads the same twice. */
export function ConnectionRuleNote({ mode }: { mode: 'individual' | 'org' }) {
  return (
    <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-[#8B8B96]">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
      {mode === 'org'
        ? 'Organizations can only approach passports marked discoverable, and messages open after the talent accepts.'
        : 'Your name and passport number are attached automatically — you never type them into a request, and nothing is shared before you accept.'}
    </p>
  );
}

