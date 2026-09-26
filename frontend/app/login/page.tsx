'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      // Friendlier mapping
      let msg = error.message;
      if (msg.includes('Email not confirmed')) msg = 'Please confirm your email first — check your inbox for the link from Pathify.';
      else if (msg.includes('Invalid login')) msg = 'We couldn’t sign you in. Check your email and password.';
      setErrorMsg(msg);
      return;
    }

    // Check onboarding completion
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();

      if (profile && !profile.onboarding_completed) {
        router.push('/onboarding');
        router.refresh();
        return;
      }
    }

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[#080414] bg-[radial-gradient(ellipse_at_top,_#3b107c4D_0%,_#080414_50%,_#04020a_100%)] flex items-center justify-center p-4 sm:p-6 text-[#F5F5F7]">
      <div className="w-full max-w-md bg-white/[0.05] backdrop-blur-lg border border-white/[0.10] rounded-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[#8B5CF6]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7">
              <circle cx="6" cy="18" r="2" /><circle cx="6" cy="6" r="2" /><circle cx="18" cy="12" r="2" />
              <path d="M8 17.5L16 13" /><path d="M8 6.5L16 11" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-black tracking-tighter bg-gradient-to-r from-[#F5F5F7] to-[#8B5CF6] bg-clip-text text-transparent leading-none">PATHIFY</h1>
            <span className="text-[10px] tracking-[0.18em] uppercase text-[#A1A1AA]">By Pathfinder Labs</span>
          </div>
        </div>
        <h2 className="text-xl font-bold mt-6 mb-1">Welcome back to Pathify</h2>
        <p className="text-sm text-[#A1A1AA] mb-6 leading-relaxed">Sign in to see matches tailored to your skills and save opportunities</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Email address</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="aisha@example.com"
              className="mt-1 w-full h-11 bg-black/30 border border-white/10 rounded-full px-4 text-base sm:text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
            />
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full h-11 bg-black/30 border border-white/10 rounded-full px-4 text-base sm:text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
            />
          </div>

          {errorMsg && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3 leading-relaxed">{errorMsg}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full h-11 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-bold rounded-full transition-colors shadow-[0_0_16px_rgba(139,92,246,0.25)]"
          >
            {loading ? 'Signing you in…' : 'Continue'}
          </button>
        </form>

        <p className="text-sm text-[#A1A1AA] mt-6 text-center">
          New to Pathify? <Link href="/signup" className="text-[#8B5CF6] hover:text-[#A78BFA] font-medium">Create free account</Link>
        </p>
        <p className="text-xs text-[#8B8B96] mt-3 text-center leading-relaxed">Tip: Check your inbox for a confirmation email after you sign up. Didn’t get it? Try resending from signup.</p>
      </div>
    </div>
  );
}
