import { create } from 'zustand';

export interface UserProfile {
  id?: string;
  name: string;
  role: string;
  country: string;
  skills: string[];
  goals: string[];
  passport_id?: string | null;
  passport_share_slug?: string | null;
  is_passport_public?: boolean;
  passport_issued_at?: string | null;
}

interface UserStore extends UserProfile {
  setProfile: (profile: Partial<UserProfile>) => void;
  hydrate: (profile: UserProfile) => void;
  // deprecated alias for hydrate
  setAll: (profile: UserProfile) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  name: "Ada",
  role: "Software Engineer",
  country: "Nigeria",
  skills: ["React", "TypeScript", "Next.js"], // Ada's current stack
  goals: ["Remote Job", "Fellowship"],
  passport_id: null,
  passport_share_slug: null,
  is_passport_public: false,
  passport_issued_at: null,
  setProfile: (profile) => set((state) => ({ ...state, ...profile })),
  hydrate: (profile) => set({ ...profile }),
  setAll: (profile) => set({ ...profile }),
}));