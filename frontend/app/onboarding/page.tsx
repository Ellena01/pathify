'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  X,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '@/app/store';
import { useProfileAutosave } from '@/app/hooks/useAutosave';
import { calculateProfileCompleteness } from '@/app/types/passport';
import { homeFor, isOrgAccount, type AccountType } from '@/lib/universe';
import { ORG_FOCUS_AREAS, ORG_GEOS } from '@/lib/org-options';

/**
 * Onboarding for BOTH universes in one route.
 *
 *   individual  5 steps  domain -> skills -> experience -> goals -> jurisdiction
 *   org         4 steps  identity -> focus -> skills required -> geography
 *
 * `middleware.ts` authenticates the request and redirects an already-completed
 * account away; this page only decides *which* flow to draw, from
 * `user_profiles.account_type`.
 *
 * Two things happen at completion that are not UI polish:
 *
 *   - the passport is issued (`GET /api/passport` lets the DB trigger allocate
 *     the PYF id; the client can never mint one), and
 *   - the first match run fires (`POST /api/match`), so the dashboard the user
 *     lands on is populated instead of showing an empty feed.
 *
 * The org flow deliberately does neither: an organisation has no talent
 * passport, and its matches are computed on demand by the talent search.
 */

const PROFILE_COLUMNS =
  'id, name, role, country, skills, goals, passport_id, passport_share_slug, is_passport_public, passport_issued_at, onboarding_completed, metadata, jurisdiction, is_admin, account_type, org_name, org_website, org_focus, org_skills, org_geo';

// Quick-add must draw from the canonical taxonomy: `calculateWeightedMatch`
// canonicalises both sides through `resolveSkills`, so a chip that is not one
// of the 96 canonical names would be accepted here and then silently ignored by
// every score. (FastAPI and Flutter were exactly that trap — Flutter resolves
// to Mobile Development, FastAPI to nothing at all.)
const POPULAR_SKILLS = [
  'React', 'TypeScript', 'Next.js', 'Python', 'DevOps', 'Node.js',
  'PostgreSQL', 'Tailwind CSS', 'Docker', 'Machine Learning',
  'UI/UX Design', 'Figma', 'Product Management', 'Data Science',
  'AWS', 'Go', 'Mobile Development', 'GraphQL', 'Rust',
];

const DOMAINS = [
  'Software Engineering', 'Frontend Development', 'Backend Development',
  'Mobile Development', 'Data Science', 'Machine Learning',
  'DevOps & Cloud', 'Cybersecurity', 'UI/UX Design', 'Product Management',
  'Quality Assurance', 'Data Analysis',
];

const EXPERIENCE_LEVELS = [
  { id: 'student', label: 'Student', hint: 'Studying, little or no work history' },
  { id: 'entry', label: 'Entry', hint: 'First role, internship or bootcamp grad' },
  { id: 'mid', label: 'Mid-level', hint: '2–4 years, owns features end to end' },
  { id: 'senior', label: 'Senior', hint: '5+ years, leads projects and people' },
  { id: 'expert', label: 'Expert / Lead', hint: 'Architecture, staff level or above' },
];

const CAREER_GOALS = [
  'Remote Job', 'Internship', 'Fellowship', 'Hackathon',
  'Startup Funding', 'Scholarship', 'Open Source', 'Mentorship',
];

const WORK_PREFERENCES = [
  { id: 'Remote', label: 'Remote only', hint: 'Open to roles anywhere' },
  { id: 'Nigeria', label: 'Nigeria', hint: 'Roles based in Nigeria' },
  { id: 'Africa', label: 'Africa', hint: 'Pan-African roles and programs' },
  { id: 'Global', label: 'Global', hint: 'Relocation or worldwide programs' },
];

const COUNTRIES = [
  'Nigeria', 'Kenya', 'Ghana', 'Rwanda', 'South Africa',
  'Ethiopia', 'Egypt', 'Morocco', 'Senegal', 'Uganda',
  'Tanzania', 'Cameroon', 'Zambia', 'Zimbabwe', 'Global / Remote',
];

// Focus areas and regions are shared with /org/settings — see lib/org-options.
const ORG_SKILLS = [
  'React', 'TypeScript', 'Python', 'Node.js', 'Go', 'Machine Learning',
  'Data Analysis', 'Product Management', 'UI/UX Design', 'DevOps',
  'Cloud Computing', 'Sales',
];

const FIELD_CLASS =
  'h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20';

function StepHeading({ step, total, kicker, title, hint }: {
  step: number;
  total: number;
  kicker: string;
  title: string;
  hint: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
        Step {step} of {total} · {kicker}
      </span>
      <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{hint}</p>
    </div>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
        selected
          ? 'border-violet-500/40 bg-violet-500/15 text-white'
          : 'border-white/10 bg-white/5 text-zinc-400 hover:border-violet-500/40 hover:text-white'
      }`}
    >
      <span>{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-violet-400" />}
    </button>
  );
}

function SelectedPills({ items, onRemove, empty }: {
  items: string[];
  onRemove: (item: string) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-zinc-500">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-300"
        >
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onRemove(item)}
            className="cursor-pointer"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const user = useUserStore();
  const { scheduleSave, flushPending, status: autosaveStatus } = useProfileAutosave({ debounceMs: 800 });

  const [ready, setReady] = useState(false);
  const [isOrg, setIsOrg] = useState(false);
  const [step, setStep] = useState(1);
  const [skillInput, setSkillInput] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);

  const total = isOrg ? 4 : 5;

  // Resolve the account once: auth, which universe, and whether onboarding is
  // already done (middleware also checks, but this catches a completed account
  // that is mid-edit on a fresh tab).
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login?next=/onboarding');
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', authUser.id)
        .maybeSingle();

      if (cancelled) return;

      if (profile) {
        if (profile.onboarding_completed) {
          router.replace(homeFor(profile.account_type));
          return;
        }
        useUserStore.getState().hydrate({
          id: profile.id,
          name: profile.name || authUser.user_metadata?.name || '',
          role: profile.role || '',
          country: profile.country || '',
          skills: profile.skills || [],
          goals: profile.goals || [],
          passport_id: profile.passport_id,
          passport_share_slug: profile.passport_share_slug,
          is_passport_public: profile.is_passport_public,
          passport_issued_at: profile.passport_issued_at,
          onboarding_completed: Boolean(profile.onboarding_completed),
          metadata: profile.metadata || {},
          jurisdiction: profile.jurisdiction ?? null,
          isAdmin: Boolean(profile.is_admin),
          account_type: profile.account_type ?? 'individual',
          org_name: profile.org_name ?? null,
          org_website: profile.org_website ?? null,
          org_focus: profile.org_focus ?? [],
          org_skills: profile.org_skills ?? [],
          org_geo: profile.org_geo ?? [],
        });
        setIsOrg(isOrgAccount(profile.account_type));
      } else {
        setIsOrg(isOrgAccount(useUserStore.getState().account_type));
      }

      setReady(true);
    }

    boot();
    return () => { cancelled = true; };
  }, [supabase, router]);

  const toggleListValue = useCallback(
    (key: 'skills' | 'goals', value: string) => {
      const current = (key === 'skills' ? user.skills : user.goals) ?? [];
      const exists = current.includes(value);
      const updated = exists ? current.filter((item) => item !== value) : [...current, value];
      // Written branch by branch: a computed key would widen to `string[]`
      // and silently bypass the whitelist in useProfileAutosave.
      if (key === 'skills') scheduleSave({ skills: updated });
      else scheduleSave({ goals: updated });
    },
    [scheduleSave, user.skills, user.goals]
  );

  const toggleOrgList = useCallback(
    (key: 'org_focus' | 'org_skills' | 'org_geo', value: string) => {
      const current = user[key] ?? [];
      const updated = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      if (key === 'org_focus') scheduleSave({ org_focus: updated });
      else if (key === 'org_skills') scheduleSave({ org_skills: updated });
      else scheduleSave({ org_geo: updated });
    },
    [scheduleSave, user]
  );

  const addCustomSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !(user.skills || []).includes(trimmed)) {
      scheduleSave({ skills: [...(user.skills || []), trimmed] });
      setSkillInput('');
    }
  };

  const setExperienceLevel = (id: string) => {
    scheduleSave({
      metadata: { ...user.metadata, experience_level: id },
    });
  };

  const setPreference = (id: string) => {
    scheduleSave({
      metadata: {
        ...user.metadata,
        preferences: {
          workMode: ['remote'],
          locations: id === 'Remote' || id === 'Global' ? [] : [id],
          opportunityTypes: user.metadata?.preferences?.opportunityTypes ?? ['jobs_remote', 'fellowships'],
        },
      },
    });
  };

  const preferenceValue =
    user.metadata?.preferences?.locations?.[0] ?? 'Remote';

  const canContinue = useMemo(() => {
    if (isOrg) {
      if (step === 1) return (user.org_name ?? '').trim().length > 0;
      if (step === 2) return (user.org_focus ?? []).length > 0;
      if (step === 3) return (user.org_skills ?? []).length > 0;
      if (step === 4) return (user.org_geo ?? []).length > 0;
      return true;
    }

    if (step === 1) return (user.role ?? '').trim().length > 0;
    if (step === 2) return (user.skills ?? []).length > 0;
    if (step === 3) return Boolean(user.metadata?.experience_level);
    if (step === 4) return (user.goals ?? []).length > 0;
    return true;
  }, [isOrg, step, user]);

  /**
   * Finish onboarding.
   *
   * `flushPending` (not `saveImmediately`) because the last keystroke may still
   * be debounced — otherwise the match run reads a profile that is missing the
   * skill the user just added.
   *
   * Failures are non-fatal and reported in place: the profile is already saved,
   * the dashboard renders without matches, and `/api/match` is idempotent so it
   * can be re-run. A dead catalog sync must not trap someone on a spinner.
   */
  const handleComplete = async () => {
    setIsFinalizing(true);
    setFinalError(null);
    try {
      const extra = isOrg
        ? { onboarding_completed: true, account_type: 'organization' as AccountType }
        : { onboarding_completed: true };

      const saved = await flushPending(extra);
      if (!saved) {
        setFinalError('Your profile did not confirm. Check your connection and try again.');
        setIsFinalizing(false);
        return;
      }

      if (!isOrg) {
        // Issue the passport, then seed matches. Both are best-effort: the DB
        // trigger allocates the id, and the dashboard can retry matching.
        try {
          const res = await fetch('/api/passport', { method: 'GET' });
          if (!res.ok) console.warn(`Passport issue returned ${res.status}; it will self-heal on load.`);
        } catch (passportError) {
          console.warn('Passport issue failed:', passportError);
        }

        try {
          const res = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
          if (!res.ok) console.warn(`Initial match run returned ${res.status}; the dashboard will offer a retry.`);
        } catch (matchError) {
          console.warn('Initial match run failed:', matchError);
        }
      }

      const home = homeFor(isOrg ? 'organization' : 'individual');
      router.push(home);
      router.refresh();
    } catch (e) {
      console.warn('Error completing onboarding:', e);
      setFinalError('Something went wrong finishing setup. Try again.');
      setIsFinalizing(false);
    }
  };

  const handleNext = () => {
    if (step < total) setStep(step + 1);
    else handleComplete();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
      </div>
    );
  }

  const completeness = calculateProfileCompleteness(user);

  return (
    <div className="relative flex min-h-screen flex-col justify-between bg-zinc-950 p-4 text-white selection:bg-violet-500/30 sm:p-6 lg:p-10">
      <div
        aria-hidden="true"
        className="pathify-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      {/* Top Header */}
      <div className="relative z-10 mx-auto flex w-full max-w-2xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/40 bg-violet-500/15 text-violet-300">
            {isOrg ? <Building2 className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          </div>
          <div>
            <span className="block text-sm font-semibold tracking-tight text-white">
              {isOrg ? 'Pathify for Organizations' : 'Pathify Passport'}
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {isOrg ? 'Talent pipeline setup' : 'Talent onboarding'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {autosaveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-violet-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          {autosaveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-zinc-400">
            Step {step} of {total}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative z-10 mx-auto my-4 w-full max-w-2xl">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Step Card */}
      <div className="relative z-10 mx-auto my-6 flex w-full max-w-2xl flex-1 flex-col justify-center">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
          {/* ================= ORGANIZATION FLOW ================= */}
          {isOrg && step === 1 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Identity"
                title="Name your organization"
                hint="This is what talent sees when you reach out. Add a website if you have one."
              />
              <div className="space-y-4 pt-2">
                <div>
                  <label htmlFor="org-name" className="mb-1.5 block text-sm font-medium text-white">
                    Organization or fund name
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    value={user.org_name ?? ''}
                    onChange={(e) => scheduleSave({ org_name: e.target.value })}
                    placeholder="e.g. Zenvest or Cowrywise"
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="org-site" className="mb-1.5 block text-sm font-medium text-white">
                    Website <span className="text-zinc-500">(optional)</span>
                  </label>
                  <input
                    id="org-site"
                    type="url"
                    value={user.org_website ?? ''}
                    onChange={(e) => scheduleSave({ org_website: e.target.value })}
                    placeholder="https://example.com"
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
            </div>
          )}

          {isOrg && step === 2 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Focus"
                title="What do you hire for?"
                hint="Pick the functions you recruit. Talent filters their feed by these."
              />
              <div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-4">
                {ORG_FOCUS_AREAS.map((focus) => (
                  <Chip
                    key={focus}
                    label={focus}
                    selected={(user.org_focus ?? []).includes(focus)}
                    onClick={() => toggleOrgList('org_focus', focus)}
                  />
                ))}
              </div>
            </div>
          )}

          {isOrg && step === 3 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Requirements"
                title="Key skills you hire for"
                hint="These weight the compatibility score shown on every talent profile."
              />
              <div className="flex flex-wrap gap-1.5">
                {ORG_SKILLS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleOrgList('org_skills', skill)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      (user.org_skills ?? []).includes(skill)
                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                        : 'border-white/10 bg-white/5 text-zinc-400 hover:border-violet-500/40 hover:text-white'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
              <SelectedPills
                items={user.org_skills ?? []}
                onRemove={(item) => toggleOrgList('org_skills', item)}
                empty="No skills selected yet — pick at least one."
              />
            </div>
          )}

          {isOrg && step === 4 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Geography"
                title="Where do you hire?"
                hint="Used to rank talent by location and to scope your searches."
              />
              <div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-4">
                {ORG_GEOS.map((geo) => (
                  <Chip
                    key={geo}
                    label={geo}
                    selected={(user.org_geo ?? []).includes(geo)}
                    onClick={() => toggleOrgList('org_geo', geo)}
                  />
                ))}
              </div>
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-xs leading-relaxed text-violet-200">
                Your pipeline opens with the full Pathify directory. Connection requests
                you send land in a talent member&apos;s <span className="font-semibold">Connections</span> tab,
                and accepted ones open a thread in your <span className="font-semibold">Outreach</span>.
              </div>
            </div>
          )}

          {/* ================= INDIVIDUAL FLOW ================= */}
          {!isOrg && step === 1 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Domain"
                title="What do you do?"
                hint="Your primary domain seeds your title, which the experience factor reads."
              />
              <div className="grid grid-cols-2 gap-2.5 pt-2 sm:grid-cols-3">
                {DOMAINS.map((domain) => (
                  <Chip
                    key={domain}
                    label={domain}
                    selected={user.role === domain}
                    onClick={() => scheduleSave({ role: domain })}
                  />
                ))}
              </div>
              <div>
                <label htmlFor="ob-role" className="mb-1.5 block text-sm font-medium text-white">
                  Or type your exact title
                </label>
                <input
                  id="ob-role"
                  type="text"
                  value={user.role || ''}
                  onChange={(e) => scheduleSave({ role: e.target.value })}
                  placeholder="e.g. Backend Engineer"
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          )}

          {!isOrg && step === 2 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Competencies"
                title="What are your core skills?"
                hint="Skills carry 60 of the 100 match points, so this is the step that matters most."
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())}
                  placeholder="Type a skill and press Enter"
                  className={`${FIELD_CLASS} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={addCustomSkill}
                  className="h-11 shrink-0 rounded-lg bg-violet-500 px-4 text-xs font-semibold text-white transition-colors hover:bg-violet-400"
                >
                  Add
                </button>
              </div>

              <SelectedPills
                items={user.skills || []}
                onRemove={(item) => toggleListValue('skills', item)}
                empty="Add at least one skill to continue."
              />

              <div className="pt-1">
                <span className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Quick add
                </span>
                <div className="no-scrollbar flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {POPULAR_SKILLS.filter((s) => !(user.skills || []).includes(s)).map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleListValue('skills', skill)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-violet-500/40 hover:text-white"
                    >
                      + {skill}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isOrg && step === 3 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Experience"
                title="How much experience do you have?"
                hint="Sets the seniority band used against roles that ask for 0, 4 or 6+ years."
              />
              <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
                {EXPERIENCE_LEVELS.map((level) => {
                  const selected = user.metadata?.experience_level === level.id;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setExperienceLevel(level.id)}
                      className={`rounded-xl border p-3.5 text-left transition-colors ${
                        selected
                          ? 'border-violet-500/40 bg-violet-500/15'
                          : 'border-white/10 bg-white/5 hover:border-violet-500/40'
                      }`}
                    >
                      <span className="flex items-center justify-between text-sm font-medium text-white">
                        {level.label}
                        {selected && <Check className="h-4 w-4 text-violet-400" />}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-400">{level.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isOrg && step === 4 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Ambitions"
                title="What are you looking for?"
                hint="Opportunity types are checked against every listing's type before scoring."
              />
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {CAREER_GOALS.map((goal) => (
                  <Chip
                    key={goal}
                    label={goal}
                    selected={(user.goals || []).includes(goal)}
                    onClick={() => toggleListValue('goals', goal)}
                  />
                ))}
              </div>
              <SelectedPills
                items={user.goals || []}
                onRemove={(item) => toggleListValue('goals', item)}
                empty="Select at least one goal to continue."
              />
            </div>
          )}

          {!isOrg && step === 5 && (
            <div className="space-y-5">
              <StepHeading
                step={step} total={total}
                kicker="Jurisdiction"
                title="Where should we look for you?"
                hint="Location is worth 20 match points. Remote is scored as an exact match everywhere."
              />

              <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-4">
                {WORK_PREFERENCES.map((pref) => (
                  <Chip
                    key={pref.id}
                    label={pref.label}
                    selected={preferenceValue === pref.id}
                    onClick={() => setPreference(pref.id)}
                  />
                ))}
              </div>

              <div>
                <label htmlFor="ob-country" className="mb-1.5 block text-sm font-medium text-white">
                  Country
                </label>
                <select
                  id="ob-country"
                  value={user.country || 'Nigeria'}
                  onChange={(e) => scheduleSave({ country: e.target.value })}
                  className={FIELD_CLASS}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} className="bg-zinc-950 text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Review — the passport is issued from these four facts. */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-zinc-950/60 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Holder</span>
                  <span className="font-medium text-white">{user.name || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Title</span>
                  <span className="font-medium text-white">{user.role || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Skills mapped</span>
                  <span className="font-bold text-violet-400">{(user.skills || []).length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Profile</span>
                  <span className="font-medium text-white">{completeness}% complete</span>
                </div>
              </div>
            </div>
          )}

          {finalError && (
            <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {finalError}
            </p>
          )}

          {/* Step Actions */}
          <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isFinalizing}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={handleNext}
              disabled={isFinalizing || !canContinue}
              className="group flex items-center gap-2 rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFinalizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Finishing…
                </>
              ) : step === total ? (
                <>
                  {isOrg ? 'Open your dashboard' : 'Issue passport & open dashboard'}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>

          {!canContinue && !isFinalizing && (
            <p className="mt-3 text-right text-[11px] text-zinc-500">
              {isOrg
                ? ['Name your organization to continue.', 'Select at least one focus area.', 'Select at least one required skill.', 'Select at least one region.'][step - 1]
                : ['Pick a domain or type your title.', 'Add at least one skill.', 'Select your experience level.', 'Select at least one goal.'][step - 1]}
            </p>
          )}
        </div>
      </div>

      {/* Bottom note */}
      <div className="relative z-10 mx-auto max-w-md text-center text-xs leading-relaxed text-zinc-500">
        {isOrg
          ? 'Talent only appears to you when their passport is shared, and you can withdraw a request at any time.'
          : 'Your passport is private by default. Only the metadata you explicitly share is publicly viewable.'}
      </div>
    </div>
  );
}
