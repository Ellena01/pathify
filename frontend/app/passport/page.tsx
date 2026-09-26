'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Copy,
  Check,
  Share2,
  ExternalLink,
  Edit3,
  CheckCircle2,
  GraduationCap,
  Briefcase,
  Target,
  Sparkles,
  Lock,
  Globe
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useUserStore } from '@/app/store';
import { calculateProfileCompleteness } from '@/app/types/passport';
import { createClient } from '@/utils/supabase/client';

export default function PassportPage() {
  const user = useUserStore();
  const supabase = createClient();
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);

  const completeness = calculateProfileCompleteness(user);

  const copyPassportId = async () => {
    if (!user.passport_id) return;
    await navigator.clipboard.writeText(user.passport_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const copyShareLink = async () => {
    if (!user.passport_share_slug) return;
    const url = `${window.location.origin}/p/${user.passport_share_slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const togglePublic = async () => {
    setIsTogglingPublic(true);
    try {
      const res = await fetch('/api/passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_public' }),
      });
      const data = await res.json();
      if (!data.error) {
        user.setProfile({
          is_passport_public: data.is_passport_public,
          passport_share_slug: data.passport_share_slug,
        });
      }
    } catch (err) {
      console.warn('Failed to toggle public state:', err);
    } finally {
      setIsTogglingPublic(false);
    }
  };

  return (
    <AppShell
      title="Talent Passport"
      subtitle="Your portable, cryptographically structured professional credential"
    >
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Passport Identity Credential Card */}
        <div className="bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent border border-white/[0.12] rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.4)] relative overflow-hidden">
          {/* Subtle glow background */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] flex items-center justify-center text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white">PORTABLE TALENT PASSPORT</h2>
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#A78BFA]">
                  {user.country ? `${user.country} Jurisdiction` : 'Global Credential'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  user.is_passport_public
                    ? 'bg-emerald-500/15 text-[#10B981] border-emerald-500/25'
                    : 'bg-white/5 text-[#A1A1AA] border-white/10'
                }`}
              >
                {user.is_passport_public ? (
                  <>
                    <Globe className="w-3.5 h-3.5 text-[#10B981]" /> Public Credential
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-[#8B8B96]" /> Private Credential
                  </>
                )}
              </span>

              <button
                onClick={togglePublic}
                disabled={isTogglingPublic}
                className="text-xs font-semibold px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/10 text-white border border-white/10 transition-colors"
              >
                {user.is_passport_public ? 'Make Private' : 'Enable Sharing'}
              </button>
            </div>
          </div>

          {/* Passport ID Banner */}
          <div className="my-6 p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8B8B96] block mb-0.5">
                Passport Identifier (Unique & Immutable)
              </span>
              <span className="text-lg sm:text-xl font-mono font-black text-[#A78BFA] tracking-wider">
                {user.passport_id || 'Generating Passport…'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyPassportId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-semibold text-white border border-white/10 transition-all"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId ? 'Copied ID' : 'Copy ID'}</span>
              </button>

              {user.is_passport_public && user.passport_share_slug && (
                <button
                  onClick={copyShareLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-xs font-semibold text-[#A78BFA] border border-[#8B5CF6]/30 transition-all"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied' : 'Share Link'}</span>
                </button>
              )}
            </div>
          </div>

          {/* User Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-[#8B8B96] font-semibold">Holder Identity</span>
              <p className="text-base font-bold text-white">{user.name || 'Not set'}</p>
              <p className="text-xs text-[#A1A1AA]">{user.role || 'Independent Technologist'}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-[#8B8B96] font-semibold">Location / Base</span>
              <p className="text-base font-bold text-white">{user.country || 'Global / Remote'}</p>
              <p className="text-xs text-[#A1A1AA]">
                Issued {user.passport_issued_at ? new Date(user.passport_issued_at).toLocaleDateString() : 'Active'}
              </p>
            </div>
          </div>

          {/* Completeness Bar */}
          <div className="mt-6 pt-4 border-t border-white/[0.08] space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#A1A1AA] font-semibold">Profile Completeness</span>
              <span className="font-mono font-bold text-[#A78BFA]">{completeness}%</span>
            </div>
            <div className="h-2 bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#10B981] rounded-full transition-all duration-700"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Skills & Competencies */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#A78BFA]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Verified Skills & Tools</h3>
            </div>
            <Link href="/settings" className="text-xs text-[#8B5CF6] hover:text-[#A78BFA] font-semibold flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> Edit in Settings
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {(user.skills || []).length > 0 ? (
              user.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/25"
                >
                  ✓ {skill}
                </span>
              ))
            ) : (
              <span className="text-xs text-[#8B8B96] italic">No skills added yet. Visit Settings to add skills for matching.</span>
            )}
          </div>
        </div>

        {/* Section 3: Career Goals & Education */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[#A78BFA]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Target Opportunities</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {(user.goals || []).length > 0 ? (
                user.goals.map((goal) => (
                  <span
                    key={goal}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-white/[0.04] border border-white/10 text-white"
                  >
                    🎯 {goal}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[#8B8B96] italic">No goals defined yet.</span>
              )}
            </div>
          </div>

          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-lg space-y-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#A78BFA]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Education</h3>
            </div>
            {user.metadata?.education?.institution ? (
              <div className="text-xs space-y-1">
                <p className="font-bold text-white">{user.metadata.education.institution}</p>
                <p className="text-[#A1A1AA]">
                  {user.metadata.education.field || 'General Study'} · Class of {user.metadata.education.graduationYear || 'Present'}
                </p>
              </div>
            ) : (
              <span className="text-xs text-[#8B8B96] italic">No educational background recorded.</span>
            )}
          </div>
        </div>

        {/* Public view preview callout */}
        {user.is_passport_public && user.passport_share_slug && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              <span className="text-xs text-emerald-300">
                Your Passport is public. Anyone with your link can view verified credentials.
              </span>
            </div>
            <a
              href={`/p/${user.passport_share_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-[#10B981] hover:underline flex items-center gap-1"
            >
              Open public page <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}
