import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { Shield, CheckCircle2, Compass, ArrowRight, Share2 } from 'lucide-react';

export default async function PublicPassportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params;
  const slug = raw?.toUpperCase();
  const supabase = await createClient();
  let profile: any = null;
  let errorMsg: string | null = null;

  try {
    const { data, error } = await supabase.rpc('get_public_passport', { slug });
    if (error) throw error;
    profile = Array.isArray(data) ? data[0] : data;
    if (!profile) throw new Error('Not found');
  } catch (e: any) {
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('passport_id, name, role, country, skills, goals')
        .eq('passport_share_slug', slug)
        .eq('is_passport_public', true)
        .single();
      profile = data;
    } catch {}
    if (!profile) errorMsg = e?.message || 'Passport not found or not public';
  }

  if (!profile || errorMsg) {
    return (
      <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7] flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
            <Shield className="w-6 h-6 text-[#8B8B96]" />
          </div>
          <h1 className="text-lg font-bold">Passport Not Found or Private</h1>
          <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
            This Pathify Passport is private or the link has changed. Passports are private by default unless explicitly shared by their owner.
          </p>
          <Link href="/" className="inline-flex items-center gap-1.5 mt-5 text-sm text-[#8B5CF6] font-semibold hover:text-[#A78BFA]">
            ← Return to Pathify Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7] p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white/[0.05] backdrop-blur-xl border border-white/[0.12] rounded-3xl p-6 sm:p-8 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        
        {/* Brand & Badge Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="text-[#8B5CF6]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]">
                <circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 17.5L16 13"/><path d="M8 6.5L16 11"/>
              </svg>
            </div>
            <div>
              <h1 className="text-[18px] sm:text-[20px] font-black tracking-tighter bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent">
                PATHIFY PASSPORT
              </h1>
              <span className="text-[10px] tracking-[0.18em] uppercase text-[#A1A1AA]">
                Verified Talent Credential
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/25 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
          </span>
        </div>

        {/* Identity Card */}
        <div className="bg-black/40 rounded-2xl p-5 border border-white/10 shadow-inner">
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] uppercase tracking-wider font-semibold">
            <span>Passport ID</span>
            <span className="text-[#8B5CF6]">Portable Credential</span>
          </div>
          <p className="text-lg sm:text-xl font-mono font-bold text-[#A78BFA] mt-1 break-all tracking-wider">
            {profile.passport_id || 'PTQ-TALENT-2026'}
          </p>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-white">{profile.name}</p>
              <p className="text-xs text-[#A1A1AA] mt-0.5">{profile.role}</p>
            </div>
            <span className="text-xs text-[#A1A1AA] bg-white/5 border border-white/10 rounded-full px-3 py-1">
              📍 {profile.country || 'Global'}
            </span>
          </div>
        </div>

        {/* Skills Section */}
        <div className="mt-5">
          <p className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold mb-2">
            Verified Skill Competencies
          </p>
          <div className="flex flex-wrap gap-2">
            {(profile.skills || []).map((s: string) => (
              <span
                key={s}
                className="px-3 py-1 text-xs font-medium rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/25"
              >
                ✓ {s}
              </span>
            ))}
          </div>
        </div>

        {/* Career Goals Section */}
        {profile.goals?.length ? (
          <div className="mt-5">
            <p className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold mb-2">
              Career Trajectory & Goals
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.goals.map((g: string) => (
                <span key={g} className="px-3 py-1 text-xs rounded-full bg-white/5 border border-white/10 text-[#A1A1AA]">
                  🎯 {g}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Call to action & footer */}
        <div className="mt-8 pt-4 border-t border-white/[0.08] space-y-3">
          <Link
            href="/opportunities"
            className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-3 rounded-full font-bold text-sm text-center flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all"
          >
            <Compass className="w-4 h-4" /> Explore Matched Opportunities
          </Link>

          <p className="text-[11px] text-[#8B8B96] text-center leading-relaxed">
            This is a cryptographically verifiable talent passport preview. The holder retains full ownership and can revoke public access anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
