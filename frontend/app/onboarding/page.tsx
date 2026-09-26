'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  GraduationCap,
  Sparkles,
  Target,
  Briefcase,
  Sliders,
  ChevronRight,
  ChevronLeft,
  Check,
  Shield,
  Loader2,
  X
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useUserStore } from '@/app/store';
import { useProfileAutosave } from '@/app/hooks/useAutosave';
import { calculateProfileCompleteness } from '@/app/types/passport';

const POPULAR_SKILLS = [
  'React', 'TypeScript', 'Next.js', 'Python', 'FastAPI', 'Node.js',
  'PostgreSQL', 'Tailwind CSS', 'Docker', 'Machine Learning',
  'UI/UX Design', 'Figma', 'Product Management', 'Data Science',
  'AWS', 'Go', 'Flutter', 'GraphQL', 'Rust'
];

const CAREER_GOALS = [
  'Remote Job', 'Fellowship', 'Hackathon', 'Internship',
  'Startup Funding', 'Scholarship', 'Open Source', 'Mentorship'
];

const COUNTRIES = [
  'Nigeria', 'Kenya', 'Ghana', 'Rwanda', 'South Africa',
  'Ethiopia', 'Egypt', 'Morocco', 'Senegal', 'Uganda',
  'Tanzania', 'Cameroon', 'Zambia', 'Zimbabwe', 'Global / Remote'
];

const WORK_MODES = [
  { id: 'remote', label: 'Remote First' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'onsite', label: 'Onsite' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const user = useUserStore();
  const { scheduleSave, saveImmediately, status: autosaveStatus } = useProfileAutosave({ debounceMs: 800 });

  const [step, setStep] = useState(1);
  const [skillInput, setSkillInput] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Check auth and initial state
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }
      // If already completed, redirect to dashboard
      if (user.onboarding_completed) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [supabase, user.onboarding_completed, router]);

  const handleNext = () => {
    if (step < 7) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleSkill = (skill: string) => {
    const current = user.skills || [];
    const exists = current.includes(skill);
    const updated = exists ? current.filter((s) => s !== skill) : [...current, skill];
    scheduleSave({ skills: updated });
  };

  const addCustomSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !(user.skills || []).includes(trimmed)) {
      scheduleSave({ skills: [...(user.skills || []), trimmed] });
      setSkillInput('');
    }
  };

  const toggleGoal = (goal: string) => {
    const current = user.goals || [];
    const exists = current.includes(goal);
    const updated = exists ? current.filter((g) => g !== goal) : [...current, goal];
    scheduleSave({ goals: updated });
  };

  const addCustomGoal = () => {
    const trimmed = customGoal.trim();
    if (trimmed && !(user.goals || []).includes(trimmed)) {
      scheduleSave({ goals: [...(user.goals || []), trimmed] });
      setCustomGoal('');
    }
  };

  const toggleWorkMode = (mode: string) => {
    const current = user.metadata?.preferences?.workMode || [];
    const exists = current.includes(mode);
    const updated = exists ? current.filter((m) => m !== mode) : [...current, mode];
    scheduleSave({
      metadata: {
        ...user.metadata,
        preferences: {
          ...(user.metadata?.preferences || { locations: [], opportunityTypes: [] }),
          workMode: updated,
        },
      },
    });
  };

  const handleComplete = async () => {
    setIsFinalizing(true);
    try {
      await saveImmediately({
        onboarding_completed: true,
      });
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      console.warn('Error completing onboarding:', e);
      router.push('/dashboard');
    } finally {
      setIsFinalizing(false);
    }
  };

  const completeness = calculateProfileCompleteness(user);

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7] flex flex-col justify-between p-4 sm:p-6 lg:p-10">
      {/* Top Header */}
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] flex items-center justify-center text-white shadow-[0_0_16px_rgba(139,92,246,0.35)]">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-black tracking-tight text-white block">PATHIFY PASSPORT</span>
            <span className="text-[10px] tracking-widest uppercase text-[#8B8B96] block">Talent Onboarding</span>
          </div>
        </div>

        {/* Autosave status pill */}
        <div className="flex items-center gap-2">
          {autosaveStatus === 'saving' && (
            <span className="text-xs text-[#A78BFA] flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {autosaveStatus === 'saved' && (
            <span className="text-xs text-[#10B981] flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          <span className="text-xs font-mono text-[#A1A1AA] bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded-full">
            Step {step} of 7
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-2xl w-full mx-auto my-4">
        <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#10B981] transition-all duration-300"
            style={{ width: `${(step / 7) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Step Card */}
      <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col justify-center my-6">
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.10] rounded-3xl p-6 sm:p-8 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
          {/* STEP 1: Basic Information */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA] block mb-1">Step 1 · Identity</span>
                <h2 className="text-2xl font-black text-white">Let’s start with your identity</h2>
                <p className="text-sm text-[#A1A1AA] mt-1">This will be tied to your persistent Pathify Talent Passport.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={user.name || ''}
                    onChange={(e) => scheduleSave({ name: e.target.value })}
                    placeholder="e.g. Aisha Bello"
                    className="w-full h-12 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Primary Role / Title</label>
                  <input
                    type="text"
                    value={user.role || ''}
                    onChange={(e) => scheduleSave({ role: e.target.value })}
                    placeholder="e.g. Software Engineer or Product Designer"
                    className="w-full h-12 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>

                <div>
                  <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Country</label>
                  <select
                    value={user.country || 'Nigeria'}
                    onChange={(e) => scheduleSave({ country: e.target.value })}
                    className="w-full h-12 bg-[#080414] border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c} className="bg-[#080414] text-white">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Education */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA] block mb-1">Step 2 · Background</span>
                <h2 className="text-2xl font-black text-white">Education & Background</h2>
                <p className="text-sm text-[#A1A1AA] mt-1">Helps match scholarships, student fellowships, and graduate roles. Optional.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Institution / University</label>
                  <input
                    type="text"
                    value={user.metadata?.education?.institution || ''}
                    onChange={(e) =>
                      scheduleSave({
                        metadata: {
                          ...user.metadata,
                          education: {
                            ...(user.metadata?.education || { program: '', field: '', level: '', graduationYear: '' }),
                            institution: e.target.value,
                          },
                        },
                      })
                    }
                    placeholder="e.g. University of Lagos or ALX Academy"
                    className="w-full h-12 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Field of Study</label>
                    <input
                      type="text"
                      value={user.metadata?.education?.field || ''}
                      onChange={(e) =>
                        scheduleSave({
                          metadata: {
                            ...user.metadata,
                            education: {
                              ...(user.metadata?.education || { institution: '', program: '', level: '', graduationYear: '' }),
                              field: e.target.value,
                            },
                          },
                        })
                      }
                      placeholder="e.g. Computer Science"
                      className="w-full h-12 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Graduation Year</label>
                    <input
                      type="text"
                      value={user.metadata?.education?.graduationYear || ''}
                      onChange={(e) =>
                        scheduleSave({
                          metadata: {
                            ...user.metadata,
                            education: {
                              ...(user.metadata?.education || { institution: '', program: '', field: '', level: '' }),
                              graduationYear: e.target.value,
                            },
                          },
                        })
                      }
                      placeholder="e.g. 2025"
                      className="w-full h-12 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Skills */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA] block mb-1">Step 3 · Competencies</span>
                <h2 className="text-2xl font-black text-white">What are your core skills?</h2>
                <p className="text-sm text-[#A1A1AA] mt-1">Our 4-factor matching engine uses these to compute your fit percentages.</p>
              </div>

              {/* Add custom skill */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())}
                  placeholder="Type a skill and press Enter"
                  className="flex-1 h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                />
                <button
                  type="button"
                  onClick={addCustomSkill}
                  className="px-4 h-11 bg-[#8B5CF6] hover:bg-[#7C3AED] rounded-xl text-xs font-bold text-white transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Selected skills */}
              {(user.skills || []).length > 0 && (
                <div className="pt-2">
                  <span className="text-xs uppercase tracking-wider text-[#A1A1AA] block mb-2 font-semibold">Your selected skills ({(user.skills || []).length}):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(user.skills || []).map((s) => (
                      <span
                        key={s}
                        onClick={() => toggleSkill(s)}
                        className="px-3 py-1 text-xs font-medium rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40 cursor-pointer flex items-center gap-1.5 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                      >
                        {s} <X className="w-3 h-3" />
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular skills suggestions */}
              <div className="pt-2">
                <span className="text-xs uppercase tracking-wider text-[#8B8B96] block mb-2 font-semibold">Quick Add:</span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {POPULAR_SKILLS.filter((s) => !(user.skills || []).includes(s)).map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className="px-3 py-1 text-xs rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-white/20 text-[#A1A1AA] hover:text-white transition-colors"
                    >
                      + {skill}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Career Goals */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA] block mb-1">Step 4 · Ambitions</span>
                <h2 className="text-2xl font-black text-white">What are you looking for?</h2>
                <p className="text-sm text-[#A1A1AA] mt-1">Select the opportunities that best align with your immediate goals.</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                {CAREER_GOALS.map((goal) => {
                  const selected = (user.goals || []).includes(goal);
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => toggleGoal(goal)}
                      className={`p-3.5 rounded-2xl border text-left text-sm font-medium transition-all flex items-center justify-between ${
                        selected
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-[0_0_16px_rgba(139,92,246,0.2)]'
                          : 'bg-white/[0.03] border-white/[0.08] text-[#A1A1AA] hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <span>{goal}</span>
                      {selected && <Check className="w-4 h-4 text-[#A78BFA]" />}
                    </button>
                  );
                })}
              </div>

              {/* Custom goal */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomGoal())}
                  placeholder="Add custom goal (e.g. AI Research)"
                  className="flex-1 h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                />
                <button
                  type="button"
                  onClick={addCustomGoal}
                  className="px-4 h-11 bg-white/[0.08] hover:bg-white/15 rounded-xl text-xs font-semibold text-white transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Experience & Projects */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA] block mb-1">Step 5 · Portfolio</span>
                <h2 className="text-2xl font-black text-white">Experience & Project Highlights</h2>
                <p className="text-sm text-[#A1A1AA] mt-1">Briefly summarize your experience or notable projects. Optional.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">Professional Bio / Summary</label>
                  <textarea
                    rows={3}
                    value={user.metadata?.bio || ''}
                    onChange={(e) =>
                      scheduleSave({
                        metadata: {
                          ...user.metadata,
                          bio: e.target.value,
                        },
                      })
                    }
                    placeholder="Briefly describe what you build, your passions, and what drives you…"
                    className="w-full bg-black/40 border border-white/15 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Opportunity Preferences */}
          {step === 6 && (
            <div className="space-y-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#A78BFA] block mb-1">Step 6 · Preferences</span>
                <h2 className="text-2xl font-black text-white">Work Mode & Discovery Settings</h2>
                <p className="text-sm text-[#A1A1AA] mt-1">Configure how you prefer to collaborate and find opportunities.</p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block">Preferred Work Modes</label>
                <div className="grid grid-cols-3 gap-2">
                  {WORK_MODES.map((mode) => {
                    const selected = (user.metadata?.preferences?.workMode || []).includes(mode.id);
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => toggleWorkMode(mode.id)}
                        className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all ${
                          selected
                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                            : 'bg-white/[0.03] border-white/[0.08] text-[#8B8B96] hover:text-white'
                        }`}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 7: Review & Issue Passport */}
          {step === 7 && (
            <div className="space-y-5 text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8B5CF6]/20 to-[#6366F1]/10 border border-[#8B5CF6]/30 flex items-center justify-center mx-auto shadow-[0_0_32px_rgba(139,92,246,0.2)]">
                <Shield className="w-8 h-8 text-[#A78BFA]" />
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#10B981] block mb-1">Ready to Issue</span>
                <h2 className="text-2xl font-black text-white">Your Talent Passport is configured!</h2>
                <p className="text-sm text-[#A1A1AA] mt-1 max-w-md mx-auto">
                  Your profile is {completeness}% complete. You can update any of these details anytime in your settings.
                </p>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-2xl p-4 max-w-sm mx-auto text-left space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#8B8B96]">Holder:</span>
                  <span className="text-white font-medium">{user.name || 'Anonymous User'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8B8B96]">Region:</span>
                  <span className="text-white font-medium">{user.country || 'Global'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8B8B96]">Skills mapped:</span>
                  <span className="text-[#A78BFA] font-bold">{(user.skills || []).length} competencies</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#8B8B96]">Goals:</span>
                  <span className="text-white font-medium">{(user.goals || []).slice(0, 2).join(', ') || 'Opportunities'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Step Actions */}
          <div className="mt-8 pt-4 border-t border-white/[0.08] flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-xs text-[#A1A1AA] hover:text-white px-3 py-2 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={handleNext}
              disabled={isFinalizing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-bold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shadow-[0_0_16px_rgba(139,92,246,0.3)] transition-all"
            >
              {isFinalizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Finalizing…
                </>
              ) : step === 7 ? (
                <>
                  Complete & Open Dashboard <Check className="w-4 h-4" />
                </>
              ) : (
                <>
                  Continue <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom note */}
      <div className="text-center text-xs text-[#8B8B96] max-w-md mx-auto">
        Your Passport is private-first. Only verified metadata you explicitly share is publicly viewable.
      </div>
    </div>
  );
}
