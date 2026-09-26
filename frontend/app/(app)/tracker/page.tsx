'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import {
  PIPELINE_STAGES,
  STAGE_META,
  coerceStage,
  daysUntil,
  parseTrackedRow,
  type TrackedOpportunity,
  type TrackerStage,
} from '@/lib/tracker';
import { safeHref } from '@/lib/security';

/**
 * Kanban application tracker.
 *
 * Stage changes go through `POST /api/tracker`, which authenticates the user
 * and scopes the update to their own row. The previous implementation issued
 * UPDATEs directly from the browser against `saved_jobs` — a table that had no
 * UPDATE RLS policy at all, so every stage change silently failed while the UI
 * optimistically showed success.
 *
 * Supports both drag-and-drop and click-to-advance, because drag-and-drop is
 * unusable on touch.
 */

interface DragState {
  id: string;
  from: TrackerStage;
}

export default function TrackerPage() {
  const [items, setItems] = useState<TrackedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overStage, setOverStage] = useState<TrackerStage | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/tracker', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to load tracker (${res.status})`);
      }
      const body = (await res.json()) as { items?: unknown[] };
      setItems(
        (body.items ?? [])
          .map((row) => parseTrackedRow(row as Record<string, unknown>))
          .filter((row): row is TrackedOpportunity => row !== null)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tracker');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const move = useCallback(
    async (id: string, stage: TrackerStage) => {
      const target = items.find((i) => i.id === id);
      if (!target || target.stage === stage) return;

      const previous = target.stage;

      // Optimistic update, reverted on failure.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, stage } : i)));
      setPending((prev) => new Set(prev).add(id));
      setError(null);

      try {
        const res = await fetch('/api/tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, stage }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Could not move card (${res.status})`);
        }
      } catch (e) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, stage: previous } : i)));
        setError(e instanceof Error ? e.message : 'Could not move card');
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items]
  );

  const remove = useCallback(
    async (id: string) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => i.id !== id));
      setError(null);
      try {
        const res = await fetch(`/api/tracker?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not remove card');
      } catch (e) {
        setItems(snapshot);
        setError(e instanceof Error ? e.message : 'Could not remove card');
      }
    },
    [items]
  );

  const byStage = useMemo(() => {
    const grouped = new Map<TrackerStage, TrackedOpportunity[]>();
    for (const stage of PIPELINE_STAGES) grouped.set(stage, []);
    grouped.set('rejected', []);
    grouped.set('withdrawn', []);

    for (const item of items) {
      const stage = coerceStage(item.stage);
      const bucket = grouped.get(stage);
      if (bucket) bucket.push(item);
    }
    return grouped;
  }, [items]);

  const closedItems = useMemo(
    () => [...(byStage.get('rejected') ?? []), ...(byStage.get('withdrawn') ?? [])],
    [byStage]
  );

  const activeCount = PIPELINE_STAGES.reduce(
    (sum, stage) => sum + (byStage.get(stage)?.length ?? 0),
    0
  );

  return (
    <PageHeader
      eyebrow="Progress"
      title="Application Tracker"
      subtitle="Move each opportunity through your pipeline. Drag a card, or use the stage control on each card."
      actions={
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[#A1A1AA]">
            {activeCount} active
          </span>
          {closedItems.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[#6B7280]">
              {closedItems.length} closed
            </span>
          )}
        </div>
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

      {loading ? (
        <div className="flex items-center justify-center py-24 text-[#8B8B96]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading your pipeline…
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {PIPELINE_STAGES.map((stage) => {
              const meta = STAGE_META[stage];
              const cards = byStage.get(stage) ?? [];
              const isOver = overStage === stage;

              return (
                <section
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(stage);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    const id = e.dataTransfer.getData('text/plain') || drag?.id;
                    if (id) void move(id, stage);
                    setDrag(null);
                  }}
                  aria-label={`${meta.label} — ${cards.length} item${cards.length === 1 ? '' : 's'}`}
                  className={`flex flex-col rounded-2xl border transition-colors min-h-[10rem] ${
                    isOver
                      ? 'border-[#8B5CF6]/50 bg-[#8B5CF6]/[0.07]'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  <header className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0`} />
                      <h2 className="text-[13px] font-semibold text-[#F5F5F7] truncate">
                        {meta.label}
                      </h2>
                    </div>
                    <span className="text-[11px] tabular-nums text-[#8B8B96] shrink-0 ml-2">
                      {cards.length}
                    </span>
                  </header>

                  <div className="flex-1 p-2.5 space-y-2.5">
                    {cards.length === 0 ? (
                      <p className="text-[11px] text-[#4B4B5A] px-1 py-3 text-center">
                        Drop here
                      </p>
                    ) : (
                      cards.map((card) => (
                        <Card
                          key={card.id}
                          card={card}
                          isPending={pending.has(card.id)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', card.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDrag({ id: card.id, from: card.stage });
                          }}
                          onDragEnd={() => {
                            setDrag(null);
                            setOverStage(null);
                          }}
                          onMove={(stage) => void move(card.id, stage)}
                          onRemove={() => void remove(card.id)}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {closedItems.length > 0 && (
            <section className="mt-8">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                aria-expanded={showClosed}
                className="flex items-center gap-2 text-sm font-medium text-[#8B8B96] hover:text-[#F5F5F7] transition-colors"
              >
                {showClosed ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                Closed applications ({closedItems.length})
              </button>

              {showClosed && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {closedItems.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      isPending={pending.has(card.id)}
                      onDragStart={() => undefined}
                      onDragEnd={() => undefined}
                      onMove={(stage) => void move(card.id, stage)}
                      onRemove={() => void remove(card.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </PageHeader>
  );
}

// ---------------------------------------------------------------------------

interface CardProps {
  card: TrackedOpportunity;
  isPending: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (stage: TrackerStage) => void;
  onRemove: () => void;
}

function Card({ card, isPending, onDragStart, onDragEnd, onMove, onRemove }: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const days = daysUntil(card.deadline);
  const meta = STAGE_META[card.stage];

  const deadlineTone =
    days === null || days > 14
      ? 'text-[#8B8B96]'
      : days < 0
        ? 'text-[#6B7280] line-through'
        : days <= 3
          ? 'text-[#F87171]'
          : 'text-[#FBBF24]';

  return (
    <article
      draggable={!isPending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative rounded-xl border bg-[#0d0a1f] p-3 transition-all ${
        isPending ? 'opacity-60' : 'hover:border-white/[0.14] cursor-grab active:cursor-grabbing'
      } border-white/[0.08]`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[#F5F5F7] leading-snug line-clamp-2">
          {card.title}
        </h3>
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8B5CF6] shrink-0 mt-0.5" />}
      </div>

      {card.organization && (
        <p className="mt-1 text-[11px] text-[#8B8B96] truncate">{card.organization}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {card.matchScore !== null && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">
            {card.matchScore}%
          </span>
        )}
        {card.deadline && (
          <span className={`inline-flex items-center gap-1 text-[10px] ${deadlineTone}`}>
            <Clock className="w-2.5 h-2.5" />
            {days !== null && days < 0 ? 'closed' : `${days}d`}
          </span>
        )}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
        {/* Click-to-advance: the accessible path, and the only usable one on touch. */}
        <label className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="sr-only">Stage for {card.title}</span>
          <select
            value={card.stage}
            disabled={isPending}
            onChange={(e) => onMove(coerceStage(e.target.value))}
            className={`w-full text-[11px] font-medium rounded-lg px-2 py-1.5 border bg-transparent ${meta.accent} focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/50 cursor-pointer disabled:opacity-50`}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s} className="bg-[#0d0a1f] text-[#F5F5F7]">
                {STAGE_META[s].label}
              </option>
            ))}
            <option value="rejected" className="bg-[#0d0a1f] text-[#F5F5F7]">
              Rejected
            </option>
            <option value="withdrawn" className="bg-[#0d0a1f] text-[#F5F5F7]">
              Withdrawn
            </option>
          </select>
        </label>

        <div className="flex items-center gap-0.5 shrink-0">
          <a
            href={safeHref(card.jobUrl)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${card.title}`}
            className="p-1.5 rounded-lg text-[#8B8B96] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`More actions for ${card.title}`}
            aria-expanded={menuOpen}
            className="p-1.5 rounded-lg text-[#8B8B96] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Plus className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] flex justify-end">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="inline-flex items-center gap-1.5 text-[11px] text-rose-400 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        </div>
      )}
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] py-20 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center mx-auto mb-4">
        <CheckSquare className="w-5 h-5 text-[#8B5CF6]" />
      </div>
      <h2 className="text-base font-semibold text-[#F5F5F7] mb-1.5">Your pipeline is empty</h2>
      <p className="text-sm text-[#8B8B96] max-w-sm mx-auto mb-6">
        Save opportunities you are interested in and they will appear here, ready to track from
        wishlist through to offer.
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
