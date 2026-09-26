'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '@/app/store';
import { CanonicalPassport } from '@/app/types/passport';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions {
  debounceMs?: number;
  onSuccess?: () => void;
  onError?: (err: any) => void;
}

/**
 * Reusable debounced autosave hook
 * Synchronizes local changes to Supabase public.user_profiles and hydrates useUserStore.
 * Provides subtle micro-feedback: 'idle' | 'saving' | 'saved' | 'error'
 */
export function useProfileAutosave(options: UseAutosaveOptions = {}) {
  const { debounceMs = 1000, onSuccess, onError } = options;
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<CanonicalPassport>>({});

  const supabase = createClient();
  const { setProfile } = useUserStore();

  const performSave = useCallback(async (updates: Partial<CanonicalPassport>) => {
    try {
      setStatus('saving');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus('idle');
        return;
      }

      // Format payload for public.user_profiles
      const payload: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.role !== undefined) payload.role = updates.role;
      if (updates.country !== undefined) payload.country = updates.country;
      if (updates.skills !== undefined) payload.skills = updates.skills;
      if (updates.goals !== undefined) payload.goals = updates.goals;
      if (updates.is_passport_public !== undefined) payload.is_passport_public = updates.is_passport_public;
      if (updates.passport_share_slug !== undefined) payload.passport_share_slug = updates.passport_share_slug;
      if (updates.onboarding_completed !== undefined) payload.onboarding_completed = updates.onboarding_completed;
      if (updates.metadata !== undefined) payload.metadata = updates.metadata;

      const { data, error } = await supabase
        .from('user_profiles')
        .update(payload)
        .eq('id', user.id)
        .select('*')
        .single();

      if (error) {
        // If metadata or onboarding_completed column not migrated yet in user DB, retry without them
        if (error.message.includes('metadata') || error.message.includes('onboarding_completed') || error.message.includes('column')) {
          delete payload.metadata;
          delete payload.onboarding_completed;
          const { data: retryData, error: retryError } = await supabase
            .from('user_profiles')
            .update(payload)
            .eq('id', user.id)
            .select('*')
            .single();
          if (retryError) throw retryError;
          setProfile(retryData);
        } else {
          throw error;
        }
      } else if (data) {
        setProfile(data);
      }

      setStatus('saved');
      setLastSavedAt(new Date());
      onSuccess?.();

      // Return to idle after 2.5s
      setTimeout(() => {
        setStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, 2500);
    } catch (err: any) {
      console.warn('Autosave error:', err?.message || err);
      setStatus('error');
      onError?.(err);
    }
  }, [supabase, setProfile, onSuccess, onError]);

  const scheduleSave = useCallback((updates: Partial<CanonicalPassport>) => {
    // Merge into local store immediately for fluid UI
    setProfile(updates);
    pendingUpdatesRef.current = {
      ...pendingUpdatesRef.current,
      ...updates,
      metadata: updates.metadata
        ? { ...(pendingUpdatesRef.current.metadata || {}), ...updates.metadata }
        : pendingUpdatesRef.current.metadata,
    };

    setStatus('saving');

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      const updatesToSend = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {};
      performSave(updatesToSend);
    }, debounceMs);
  }, [debounceMs, performSave, setProfile]);

  // Flush immediately if unmounting with pending changes
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (Object.keys(pendingUpdatesRef.current).length > 0) {
        performSave(pendingUpdatesRef.current);
      }
    };
  }, [performSave]);

  return {
    status,
    lastSavedAt,
    scheduleSave,
    saveImmediately: performSave,
  };
}
