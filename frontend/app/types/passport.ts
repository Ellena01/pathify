export interface Education {
  institution?: string;
  program?: string;
  field?: string;
  level?: string;
  graduationYear?: string;
}

export interface ExperienceItem {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  url?: string;
  skills: string[];
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface OpportunityPreferences {
  workMode?: string[]; // e.g. ['remote', 'hybrid', 'onsite']
  locations?: string[];
  opportunityTypes?: string[]; // e.g. ['jobs_remote', 'fellowships', 'hackathons']
}

export interface PassportMetadata {
  education?: Education;
  experience?: ExperienceItem[];
  projects?: ProjectItem[];
  certifications?: CertificationItem[];
  preferences?: OpportunityPreferences;
  interests?: string[];
  bio?: string;
}

export interface CanonicalPassport {
  id: string;
  name: string;
  role: string;
  country: string;
  skills: string[];
  goals: string[];
  passport_id: string | null;
  passport_share_slug: string | null;
  is_passport_public: boolean;
  passport_issued_at: string | null;
  onboarding_completed: boolean;
  metadata: PassportMetadata;
}

/**
 * Calculates deterministic profile completeness score (0-100%)
 * Weighting:
 * - Basic Identity (name, country, role): 20%
 * - Skills (>= 3 skills): 20%
 * - Goals (>= 1 goal): 15%
 * - Education: 15%
 * - Experience / Projects: 15%
 * - Preferences / Interests: 15%
 */
export function calculateProfileCompleteness(profile: Partial<CanonicalPassport>): number {
  if (!profile) return 0;
  let score = 0;

  // 1. Basic Identity (20%)
  if (profile.name && profile.name.trim() !== '') score += 8;
  if (profile.country && profile.country.trim() !== '' && profile.country !== 'XX') score += 6;
  if (profile.role && profile.role.trim() !== '') score += 6;

  // 2. Skills (20%)
  const skillsCount = Array.isArray(profile.skills) ? profile.skills.length : 0;
  if (skillsCount >= 5) score += 20;
  else if (skillsCount >= 3) score += 15;
  else if (skillsCount >= 1) score += 10;

  // 3. Career Goals (15%)
  const goalsCount = Array.isArray(profile.goals) ? profile.goals.length : 0;
  if (goalsCount >= 2) score += 15;
  else if (goalsCount >= 1) score += 10;

  // 4. Education (15%)
  const edu = profile.metadata?.education;
  if (edu && (edu.institution || edu.field || edu.level)) {
    if (edu.institution && (edu.field || edu.level)) score += 15;
    else score += 8;
  }

  // 5. Experience / Projects (15%)
  const expCount = Array.isArray(profile.metadata?.experience) ? profile.metadata.experience.length : 0;
  const projCount = Array.isArray(profile.metadata?.projects) ? profile.metadata.projects.length : 0;
  if (expCount > 0 && projCount > 0) score += 15;
  else if (expCount > 0 || projCount > 0) score += 10;

  // 6. Preferences / Interests (15%)
  const interestsCount = Array.isArray(profile.metadata?.interests) ? profile.metadata.interests.length : 0;
  const prefCount = Array.isArray(profile.metadata?.preferences?.opportunityTypes) ? profile.metadata.preferences.opportunityTypes.length : 0;
  if (interestsCount > 0 && prefCount > 0) score += 15;
  else if (interestsCount > 0 || prefCount > 0) score += 8;

  return Math.min(100, Math.max(0, score));
}
