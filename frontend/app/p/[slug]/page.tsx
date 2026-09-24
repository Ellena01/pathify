import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';

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
      const { data } = await supabase.from('user_profiles').select('passport_id, name, role, country, skills, goals').eq('passport_share_slug', slug).eq('is_passport_public', true).single();
      profile = data;
    } catch {}
    if (!profile) errorMsg = e?.message || 'Passport not found or not public';
  }

  if (!profile || errorMsg) {
    return (
      <div className="min-h-screen bg-[#080414] text-[#F5F5F7] flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white/[0.05] border border-white/[0.10] backdrop-blur-lg rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <h1 className="text-lg font-bold">Link not found</h1>
          <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">This Pathify Passport is private or the link has expired. Ask the owner to set their passport to “Public” and share again.</p>
          <Link href="/" className="inline-block mt-4 text-sm text-[#8B5CF6] font-medium hover:text-[#A78BFA]">← Back to Pathify</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] text-[#F5F5F7] p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white/[0.05] backdrop-blur-lg border border-white/[0.10] rounded-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="text-[#8B5CF6]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7"><circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><path d="M8 17.5L16 13"/><path d="M8 6.5L16 11"/></svg>
          </div>
          <div><h1 className="text-[20px] font-black tracking-tighter bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent">PATHIFY PASSPORT</h1><span className="text-[10px] tracking-[0.18em] uppercase text-[#A1A1AA]">Shareable profile</span></div>
        </div>
        <div className="bg-black/30 rounded-xl p-4 border border-white/10">
          <p className="text-xs tracking-widest text-[#A1A1AA] uppercase">Passport ID</p>
          <p className="text-base sm:text-lg font-mono font-bold text-[#A78BFA] mt-1 break-all">{profile.passport_id || '—'}</p>
          <p className="text-sm font-medium mt-3">{profile.name} • {profile.role}</p>
          <p className="text-xs text-[#A1A1AA]">{profile.country}</p>
        </div>
        <div className="mt-4">
          <p className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Skills</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {(profile.skills || []).map((s: string) => <span key={s} className="px-2.5 py-1 text-xs leading-none rounded-full bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/20">{s}</span>)}
          </div>
        </div>
        {profile.goals?.length ? (
          <div className="mt-3">
            <p className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Goals</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {profile.goals.map((g: string) => <span key={g} className="px-2.5 py-1 text-xs leading-none rounded-full bg-white/5 border border-white/10 text-[#A1A1AA]">{g}</span>)}
            </div>
          </div>
        ) : null}
        <p className="text-xs text-[#8B8B96] mt-4 text-center leading-relaxed">This is a shareable preview. The owner controls what’s visible and can make it private anytime. Shared {new Date().toLocaleDateString()} · Pathify by Pathfinder Labs</p>
        <Link href="/" className="block mt-4 text-center text-sm text-[#8B5CF6] hover:text-[#A78BFA] font-medium">Explore Pathify → Find your own opportunities</Link>
      </div>
    </div>
  );
}
