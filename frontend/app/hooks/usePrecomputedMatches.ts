'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchBreakdown } from '@/lib/matching';

/**
 * Client access to the server-computed match table.
 *
 * ## Why this exists
 *
 * The dashboard and the catalog used to each import the scoring engine and run
 * it over the full catalog in the browser, on every filter keystroke and every
 * re-render. Three problems, in increasing order of badness:
 *
 *  1. The browser copy of the score was not the server's. `calculateFullMatch`
 *     only forwards skills/country/goals, so `yearsExperience`,
 *     `preferredLocations` and `preferredTypes` were never passed and every
 *     client-side score silently took the "no data" branch. The same listing
 *     showed a different number in the feed than it did in a digest email.
 *  2. `opportunities_cache.match_score` is whatever the actor happened to write
 *     for one arbitrary user, so treating it as "this user's score" was wrong.
 *  3. It was O(catalog) on the main thread, on every render.
 *
 * `POST /api/match` is the only writer of `user_opportunity_matches` (the table
 * has no client INSERT policy), and `GET /api/match` is the only reader. So
 * both pages read from here and never score anything themselves.
 */

export interface MatchPayload {
  score: number;
  matched: string[];
  gap: string[];
  breakdown: MatchBreakdown;
  explanation: string;
}

export interface MatchedOpportunity {
  application_url: string;
  title: string;
  organization: string | null;
  location: string | null;
  opportunity_type: string | null;
  skills_required: unknown;
  deadline: string | null;
  verification_status: string | null;
  source_domain: string | null;
  match: MatchPayload;
  [key: string]: unknown;
}

export type MatchScope = 'for-you' | 'all';

export interface UsePrecomputedMatches {
  matches: MatchedOpportunity[];
  matchByUrl: Map<string, MatchPayload>;
  isLoading: boolean;
  /** Set when the match table does not exist yet (migration not applied). */
  isStale: boolean;
  error: string;
  runMatches: () => Promise<number>;
  isRunning: boolean;
}

/**
 * The single ingestion point for `/api/match`.
 *
 * The route is now deliberately fallible: a degraded or partially-computed
 * response is a normal state, and a row can reach here without a `match` block
 * (or with a `score` that is not a number). Every consumer reads `row.match.score`
 * directly, so a loose row would take the whole page down with it. Normalising
 * here turns "one odd row" into an unscored listing, which already renders.
 */
function normalizeMatches(raw: unknown): MatchedOpportunity[] {
  if (!Array.isArray(raw)) return [];
  const rows: MatchedOpportunity[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.application_url !== 'string' || !row.application_url) continue;

    const rawMatch = row.match && typeof row.match === 'object' ? (row.match as Record<string, unknown>) : {};
    const score = typeof rawMatch.score === 'number' && Number.isFinite(rawMatch.score) ? rawMatch.score : 0;
    const list = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : [];

    rows.push({
      ...(row as Record<string, unknown>),
      match: {
        score,
        matched: list(rawMatch.matched),
        gap: list(rawMatch.gap),
        breakdown:
          rawMatch.breakdown && typeof rawMatch.breakdown === 'object'
            ? (rawMatch.breakdown as MatchBreakdown)
            : ({} as MatchBreakdown),
        explanation: typeof rawMatch.explanation === 'string' ? rawMatch.explanation : '',
      },
    } as MatchedOpportunity);
  }

  return rows;
}

export function usePrecomputedMatches(limit = 60): UsePrecomputedMatches {
  const [matches, setMatches] = useState<MatchedOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  // Guards against a setState after unmount when a user navigates away mid-run.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/match?limit=${limit}`, { cache: 'no-store' });
      if (!res.ok) {
        // 401 simply means "not signed in" — an anonymous visitor has no
        // matches, which is a valid state, not an error.
        if (res.status === 401) {
          if (mounted.current) {
            setMatches([]);
            setError('');
          }
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!mounted.current) return;

      if (data.error) {
        setError(String(data.error));
        return;
      }
      setMatches(normalizeMatches(data.matches));
      setIsStale(Boolean(data.stale));
      setError('');
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : 'Could not load matches');
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    let cancelled = false;
    // Inlined rather than calling `load()` so the state updates are visibly
    // after an `await`, not synchronous in the effect body.
    (async () => {
      try {
        const res = await fetch(`/api/match?limit=${limit}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 401) {
          setMatches([]);
          setError('');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setError(String(data.error));
          return;
        }
        setMatches(normalizeMatches(data.matches));
        setIsStale(Boolean(data.stale));
        setError('');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load matches');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  /**
   * Ask the server to recompute and persist matches, then reload.
   * Resolves to the number of matches stored, or 0 on failure.
   */
  const runMatches = useCallback(async () => {
    setIsRunning(true);
    setError('');
    try {
      const res = await fetch('/api/match', { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        if (mounted.current) {
          setError(detail?.error || `Match run failed (HTTP ${res.status})`);
        }
        return 0;
      }
      const data = await res.json();
      await load();
      return typeof data.matched === 'number' ? data.matched : 0;
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Match run failed');
      }
      return 0;
    } finally {
      if (mounted.current) setIsRunning(false);
    }
  }, [load]);

  const matchByUrl = new Map<string, MatchPayload>();
  for (const row of matches) {
    if (row?.application_url) matchByUrl.set(row.application_url, row.match);
  }

  return { matches, matchByUrl, isLoading, isStale, error, runMatches, isRunning };
}

/** Flatten a `skills_required` value that may be strings or rich skill objects. */
export function skillNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push(entry.trim());
    } else if (entry && typeof entry === 'object') {
      const canonical = (entry as { canonical?: unknown }).canonical;
      if (typeof canonical === 'string' && canonical.trim()) out.push(canonical.trim());
    }
    if (out.length >= 40) break;
  }
  return out;
}
