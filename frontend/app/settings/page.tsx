'use client';

import React, { useState } from 'react';
import {
  User,
  GraduationCap,
  Sparkles,
  Target,
  Sliders,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { SecondaryTabs } from '@/components/layout/SecondaryTabs';
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

export default function SettingsPage() {
  const user = useUserStore();
  const { scheduleSave, status: autosaveStatus } = useProfileAutosave({ debounceMs: 700 });
  const [skillInput, setSkillInput] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const completeness = calculateProfileCompleteness(user);

  const toggleSkill = (skill: string) => {
    const current = user.skills || [];
    const exists = current.includes(skill);
    const updated = exists ? current.filter((s) => s !== skill) : [...current, skill];
    scheduleSave({ skills: updated });
  };

  const addSkill = () => {
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

  return (
    <AppShell
      title="Profile & Settings"
      subtitle="Edit your canonical profile — all matching and recommendations update instantly"
      autosaveStatus={autosaveStatus}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Secondary Navigation Tabs */}
        <div className="border-b border-white/[0.08] pb-2">
          <SecondaryTabs
            tabs={[
              { id: 'all', label: 'All Settings' },
              { id: 'identity', label: 'Identity', icon: User },
              { id: 'skills', label: 'Skills', icon: Sparkles, badge: (user.skills || []).length },
              { id: 'goals', label: 'Goals', icon: Target },
              { id: 'education', label: 'Education & Bio', icon: GraduationCap },
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id)}
          />
        </div>

        {/* Autosave info alert */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between text-xs text-[#A1A1AA]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#A78BFA]" />
            <span>Changes autosave automatically to your permanent Supabase record.</span>
          </div>
          <span className="font-mono text-[#A78BFA] font-bold">{completeness}% completeness</span>
        </div>

        {/* Section 1: Basic Identity */}
        {(activeTab === 'all' || activeTab === 'identity') && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-5">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <User className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Basic Identity</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={user.name || ''}
                onChange={(e) => scheduleSave({ name: e.target.value })}
                className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">
                Professional Role / Headline
              </label>
              <input
                type="text"
                value={user.role || ''}
                onChange={(e) => scheduleSave({ role: e.target.value })}
                className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">
                Location / Country
              </label>
              <select
                value={user.country || 'Nigeria'}
                onChange={(e) => scheduleSave({ country: e.target.value })}
                className="w-full h-11 bg-[#080414] border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
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

        {/* Section 2: Skills & Competencies */}
        {(activeTab === 'all' || activeTab === 'skills') && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-5">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <Sparkles className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Skills & Competencies</h2>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
              placeholder="Add skill (e.g. FastAPI, Tailwind, PyTorch)"
              className="flex-1 h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
            />
            <button
              type="button"
              onClick={addSkill}
              className="px-4 h-11 bg-[#8B5CF6] hover:bg-[#7C3AED] rounded-xl text-xs font-bold text-white transition-colors"
            >
              Add
            </button>
          </div>

          {/* Active skills */}
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider text-[#A1A1AA] block font-semibold">
              Current Skills ({(user.skills || []).length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(user.skills || []).map((skill) => (
                <span
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30 cursor-pointer flex items-center gap-1.5 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 transition-colors"
                >
                  {skill} <X className="w-3 h-3" />
                </span>
              ))}
            </div>
          </div>

          {/* Quick add */}
          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
            <span className="text-xs uppercase tracking-wider text-[#8B8B96] block font-semibold">
              Popular Suggestions:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SKILLS.filter((s) => !(user.skills || []).includes(s)).slice(0, 12).map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className="px-2.5 py-1 rounded-full text-xs bg-white/[0.04] border border-white/[0.08] hover:border-white/20 text-[#A1A1AA] hover:text-white transition-colors"
                >
                  + {skill}
                </button>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* Section 3: Career Goals */}
        {(activeTab === 'all' || activeTab === 'goals') && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-4">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <Target className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Target Opportunities</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CAREER_GOALS.map((goal) => {
              const selected = (user.goals || []).includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={`p-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-between ${
                    selected
                      ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-[#8B8B96] hover:text-white'
                  }`}
                >
                  <span>{goal}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-[#A78BFA]" />}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Section 4: Education & Bio */}
        {(activeTab === 'all' || activeTab === 'education') && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-4">
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <GraduationCap className="w-4 h-4 text-[#A78BFA]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Education & Background</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">
                Institution
              </label>
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
                className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">
                Field of Study
              </label>
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
                className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs uppercase tracking-wider text-[#A1A1AA] font-semibold block mb-1">
                Professional Bio / Summary
              </label>
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
                className="w-full bg-black/40 border border-white/15 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>
          </div>
        </div>
        )}
      </div>
    </AppShell>
  );
}
