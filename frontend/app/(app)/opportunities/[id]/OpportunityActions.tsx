'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, TrendingUp, Check, Loader2, ExternalLink } from 'lucide-react';
import { STAGE_META, TRACKER_STAGES, isTrackerStage, type TrackerStage } from '@/lib/tracker';
import { createClient } from '@/utils/supabase/client';

/**
 * The only client-side part of the opportunity detail page.
 *
 * Save and stage changes go through `/api/tracker`, not straight to Supabase
 * from the browser. Two reasons, both learned the hard way:
 *
 *  1. The previous version issued `UPDATE saved_jobs SET job_data = ...` from
 *     the client. `saved_jobs` had no UPDATE RLS policy at all, so every stage
 *     change failed silently while the optimistic UI showed success.
 *  2. `stage` is now a real constrained column, not anonymous jsonb. Writing it
 *     from the browser would mean re-implementing the allowed-value list here,
 *     which is how the three copies of the stage list drifted apart in the
 *     first place.
 *
 * Initial state arrives as props from the server component, so there is no
 * client-side fetch waterfall before the page can render.
 */

export interface OpportunityActionsProps {
  applicationUrl: string;
  title: string;
  organization: string | null;
  location: string | null;
  opportunityType: string | null;
  deadline: string | null;
  /** Skills to snapshot into `job_data` at save time. */
  skillsRequired: unknown;
  isSignedIn: boolean;
  initiallySaved: boolean;
  initialSavedId: string | null;
  initialStage: TrackerStage | null;
  sourceDomain: string | null;
}

export function OpportunityActions({
  applicationUrl,
  title,
  organization,
  location,
  opportunityType,
  deadline,
  skillsRequired,
  isSignedIn,
  initiallySaved,
  initialSavedId,
  initialStage,
  sourceDomain,
}: OpportunityActionsProps) {
  const router = useRouter();
  const supabase = createClient();

  const [saved, setSaved] = useState(initiallySaved);
  const [savedId, setSavedId] = useState<string | null>(initialSavedId);
  const [stage, setStage] = useState<TrackerStage>(initialStage ?? 'wishlist');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the stage menu on an outside click or Escape. Without this the menu
  // stays open behind the page once the user scrolls.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const requireAuth = () => {
    if (!isSignedIn) {
      router.push(`/login?next=${encodeURIComponent(`/opportunities/${encodeURIComponent(applicationUrl)}`)}`);
      return false;
    }
    return true;
  };

  /**
   * The `job_data` snapshot. Purpose-built rather than spreading a whole row:
   * `raw_data` in particular is a 16 KiB scraper blob and has no business in
   * every `saved_jobs` row.
   */
  const snapshot = (nextStage: TrackerStage) => ({
    title,
    organization,
    location,
    opportunity_type: opportunityType,
    deadline,
    skills_required: skillsRequired,
    stage: nextStage,
  });

  const toggleSave = async () => {
    if (!requireAuth()) return;
    setError('');

    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      try {
        if (next) {
          const { data, error: insertError } = await supabase
            .from('saved_jobs')
            .insert({
              user_id: (await supabase.auth.getUser()).data.user?.id,
              job_url: applicationUrl,
              job_data: snapshot(stage),
              stage,
            })
            .select('id')
            .single();
          if (insertError) throw insertError;
          setSavedId(data?.id ?? null);
        } else {
          if (savedId) {
            // Preferred: the server route, which authorises by session.
            const res = await fetch(`/api/tracker?id=${encodeURIComponent(savedId)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          } else {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user) return;
            const { error: deleteError } = await supabase
              .from('saved_jobs')
              .delete()
              .eq('user_id', auth.user.id)
              .eq('job_url', applicationUrl);
            if (deleteError) throw deleteError;
          }
          setSavedId(null);
        }
      } catch (e) {
        setSaved(next); // roll back the optimistic flip
        setError(e instanceof Error ? e.message : 'Could not update your tracker');
      }
    });
  };

  const moveStage = async (next: TrackerStage) => {
    setMenuOpen(false);
    if (!requireAuth()) return;
    if (next === stage && saved) return;
    setError('');

    const previousStage = stage;
    setStage(next);

    startTransition(async () => {
      try {
        // Not saved yet: create the row in the target stage.
        if (!saved || !savedId) {
          const { data: auth } = await supabase.auth.getUser();
          if (!auth.user) return;
          const { data, error: insertError } = await supabase
            .from('saved_jobs')
            .insert({
              user_id: auth.user.id,
              job_url: applicationUrl,
              job_data: snapshot(next),
              stage: next,
            })
            .select('id')
            .single();
          if (insertError) throw insertError;
          setSaved(true);
          setSavedId(data?.id ?? null);
          return;
        }

        // Already saved: move it server-side. `.eq('user_id', user.id)` is the
        // authorisation check.
        const res = await fetch('/api/tracker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedId, stage: next }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail?.error || `HTTP ${res.status}`);
        }
      } catch (e) {
        setStage(previousStage);
        setError(e instanceof Error ? e.message : 'Could not move this application');
      }
    });
  };

  const meta = STAGE_META[stage];
  const applyLabel = sourceDomain ? `Apply on ${sourceDomain}` : 'Apply now';

  return (
    <div className="space-y-4">
      {/* Primary actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-bold py-3 px-6 rounded-full shadow-[0_8px_32px_rgba(139,92,246,0.35)] transition-all text-sm"
        >
          {applyLabel} <ExternalLink className="w-4 h-4" />
        </a>

        <button
          type="button"
          onClick={toggleSave}
          disabled={isPending}
          className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full font-bold text-sm border transition-all disabled:opacity-60 ${
            saved
              ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/40 text-[#A78BFA]'
              : 'bg-white/[0.06] border-white/[0.10] text-[#A1A1AA] hover:text-white hover:border-white/20'
          }`}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Bookmark className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />
          )}
          {saved ? 'Saved' : 'Save'}
        </button>

        {/* Stage selector — a real <select> on narrow viewports, a menu on wide.
            Both paths call the same handler, so there is no touch-hostile UI. */}
        <div className="relative" ref={menuRef}>
          <label className="sr-only" htmlFor="stage-select">
            Application stage
          </label>
          <div className="hidden sm:block">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-full font-medium text-sm border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all disabled:opacity-60"
              style={{ color: meta.dot.replace('bg-', '') }}
            >
              <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
              {meta.label}
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-full mt-2 bg-[#0d0824] border border-white/[0.12] rounded-xl shadow-2xl z-20 py-1.5 min-w-[190px]"
              >
                {TRACKER_STAGES.map((candidate) => {
                  const candidateMeta = STAGE_META[candidate];
                  return (
                    <button
                      key={candidate}
                      type="button"
                      role="option"
                      aria-selected={candidate === stage}
                      onClick={() => moveStage(candidate)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-white/[0.05] transition-colors flex items-center gap-2"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${candidateMeta.dot}`} />
                      <span className={candidate === stage ? 'text-white font-medium' : 'text-[#A1A1AA]'}>
                        {candidateMeta.label}
                      </span>
                      {candidate === stage && <Check className="w-3.5 h-3.5 ml-auto text-[#8B5CF6]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <select
            id="stage-select"
            value={stage}
            onChange={(e) => {
              const next = e.target.value;
              if (isTrackerStage(next)) moveStage(next);
            }}
            disabled={isPending}
            className="sm:hidden w-full px-4 py-3 rounded-full text-sm bg-white/[0.04] border border-white/10 text-[#F5F5F7] focus:outline-none focus:border-[#8B5CF6] disabled:opacity-60"
          >
            {TRACKER_STAGES.map((candidate) => (
              <option key={candidate} value={candidate} className="bg-[#080414]">
                {STAGE_META[candidate].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!isSignedIn && (
        <p className="text-xs text-[#8B8B96]">
          Sign in to save this opportunity and track it through to an offer.
        </p>
      )}
    </div>
  );
}
