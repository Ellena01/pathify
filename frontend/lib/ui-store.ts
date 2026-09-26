'use client';

import { create } from 'zustand';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Transient UI state that must reach chrome outside the page subtree.
 *
 * Autosave status used to be passed from each page into `<AppShell
 * autosaveStatus={...}>`. Once the shell moved into the route-group layout
 * there was no prop path from a page to the header, so this store carries it
 * instead. Deliberately NOT persisted: it is per-session feedback only.
 */
interface UiStore {
  autosaveStatus: AutosaveStatus;
  setAutosaveStatus: (status: AutosaveStatus) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  autosaveStatus: 'idle',
  setAutosaveStatus: (autosaveStatus) => set({ autosaveStatus }),
}));
