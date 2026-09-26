'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const COUNTRIES = ['Nigeria','Kenya','Ghana','Rwanda','South Africa','Ethiopia','Egypt','Morocco','Senegal','Uganda','Tanzania','Cameroon','Zambia','Zimbabwe','Botswana','Benin','Global / Remote'];

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, country },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      let msg = error.message;
      if (msg.includes('User already registered')) msg = 'An account with this email exists. Try signing in.';
      else if (msg.toLowerCase().includes('rate limit') || msg.includes('over_email')) msg = 'Too many attempts — please wait 10–15 minutes or try a different email. If this persists, contact support.';
      else if (msg.includes('Email not confirmed')) msg = 'Please confirm your email first — check your inbox.';
      setErrorMsg(msg);
      return;
    }
    // If email confirmations disabled, Supabase returns a session immediately — route to onboarding
    if (data.session) {
      router.push('/onboarding');
      router.refresh();
      return;
    }
    // Otherwise show confirmation hint (when enabled)
    setInfoMsg('Account created — you can now sign in directly (email confirmation is off for this project). Go to Sign in.');
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
        <h2 className="text-xl font-bold mt-6 mb-1">Create your Pathify account</h2>
        <p className="text-sm text-[#A1A1AA] mb-6 leading-relaxed">Get opportunities matched to your skills — and see what to learn next</p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Full name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Aisha Bello"
              className="mt-1 w-full h-11 bg-black/30 border border-white/10 rounded-full px-4 text-base sm:text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
            />
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Country</label>
            <select value={country} onChange={e=>setCountry(e.target.value)} className="mt-1 w-full h-11 bg-black/30 border border-white/10 rounded-full px-4 text-base sm:text-sm text-[#F5F5F7] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20">
              {COUNTRIES.map(c => <option key={c} value={c} className="bg-[#080414]">{c}</option>)}
            </select>
            <p className="text-[11px] text-[#8B8B96] mt-1">Sets your passport <span className="font-mono text-[#A78BFA]">PTQ-{country==='Global / Remote'?'GL':country.slice(0,2).toUpperCase()}-2026-XXXX</span> — keeps African-first story.</p>
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="aisha@gmail.com"
              className="mt-1 w-full h-11 bg-black/30 border border-white/10 rounded-full px-4 text-base sm:text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
            />
          </div>
          <div>
            <label className="text-xs tracking-widest uppercase text-[#A1A1AA] font-semibold">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-1 w-full h-11 bg-black/30 border border-white/10 rounded-full px-4 text-base sm:text-sm text-[#F5F5F7] placeholder-[#8B8B96] focus:outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
            />
            <p className="text-xs text-[#A1A1AA] mt-1.5 leading-relaxed">Use 6+ characters. You’ll confirm your email next — look for a link from Pathify by Pathfinder Labs.</p>
          </div>

          {errorMsg && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3 leading-relaxed">{errorMsg}</p>}
          {infoMsg && <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 leading-relaxed">{infoMsg}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full h-11 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-60 text-white text-sm font-bold rounded-full transition-colors shadow-[0_0_16px_rgba(139,92,246,0.25)]"
          >
            {loading ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-[#A1A1AA] mt-6 text-center">
          Already have an account? <Link href="/login" className="text-[#8B5CF6] hover:text-[#A78BFA] font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
