import { create } from 'zustand';
import { CanonicalPassport, PassportMetadata } from './types/passport';

export interface UserStore extends CanonicalPassport {
  isAuthenticated: boolean;
  isHydrated: boolean;
  setProfile: (profile: Partial<CanonicalPassport>) => void;
  setMetadata: (metadata: Partial<PassportMetadata>) => void;
  hydrate: (profile: Partial<CanonicalPassport>) => void;
  reset: () => void;
  // deprecated alias
  setAll: (profile: Partial<CanonicalPassport>) => void;
}

const DEFAULT_METADATA: PassportMetadata = {
  education: {
    institution: '',
    program: '',
    field: '',
    level: '',
    graduationYear: '',
  },
  experience: [],
  projects: [],
  certifications: [],
  preferences: {
    workMode: ['remote'],
    locations: [],
    opportunityTypes: ['jobs_remote', 'fellowships'],
  },
  interests: [],
};

export const useUserStore = create<UserStore>((set) => ({
  id: '',
  name: '',
  role: '',
  country: '',
  skills: [],
  goals: [],
  passport_id: null,
  passport_share_slug: null,
  is_passport_public: false,
  passport_issued_at: null,
  onboarding_completed: false,
  metadata: DEFAULT_METADATA,
  isAuthenticated: false,
  isHydrated: false,

  setProfile: (profile) =>
    set((state) => ({
      ...state,
      ...profile,
      metadata: profile.metadata ? { ...state.metadata, ...profile.metadata } : state.metadata,
    })),

  setMetadata: (metadata) =>
    set((state) => ({
      ...state,
      metadata: {
        ...state.metadata,
        ...metadata,
      },
    })),

  hydrate: (profile) =>
    set((state) => ({
      ...state,
      ...profile,
      metadata: {
        ...DEFAULT_METADATA,
        ...(profile.metadata || {}),
        education: {
          ...DEFAULT_METADATA.education,
          ...(profile.metadata?.education || {}),
        },
        preferences: {
          ...DEFAULT_METADATA.preferences,
          ...(profile.metadata?.preferences || {}),
        },
      },
      isAuthenticated: Boolean(profile.id),
      isHydrated: true,
    })),

  reset: () =>
    set({
      id: '',
      name: '',
      role: '',
      country: '',
      skills: [],
      goals: [],
      passport_id: null,
      passport_share_slug: null,
      is_passport_public: false,
      passport_issued_at: null,
      onboarding_completed: false,
      metadata: DEFAULT_METADATA,
      isAuthenticated: false,
      isHydrated: true,
    }),

  setAll: (profile) =>
    set((state) => ({
      ...state,
      ...profile,
    })),
}));