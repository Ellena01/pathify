'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { homeFor } from '@/lib/universe';

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

    // Route by universe. An organization account sent to /dashboard would be
    // bounced straight back by the middleware, which is a wasted round trip
    // the user experiences as a flicker.
    const { data: { user } } = await supabase.auth.getUser();

    // Where the middleware parked them before bouncing to /login. Only a
    // same-origin absolute path is honoured: `//evil.example` is protocol-
    // relative and would be an open redirect.
    const rawNext = new URLSearchParams(window.location.search).get('next');
    const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;

    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed, account_type')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        if (!profile.onboarding_completed) {
          // Onboarding owns the post-setup redirect; `next` is honoured after.
          router.push('/onboarding');
          router.refresh();
          return;
        }
        router.push(next ?? homeFor(profile.account_type));
        router.refresh();
        return;
      }
    }

    router.push(next ?? '/dashboard');
    router.refresh();
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-5 py-12 text-white selection:bg-violet-500/30 sm:px-8">
      <div
        aria-hidden="true"
        className="pathify-glow pointer-events-none absolute inset-x-0 top-0 h-[480px]"
      />

      <Link
        href="/"
        className="relative z-10 mb-8 text-base font-semibold tracking-tight text-white transition-colors hover:text-violet-400"
      >
        Pathify
      </Link>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Welcome back.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Sign in to see your matches, pick up saved listings, and keep your tracker current.
        </p>

        <form onSubmit={handleLogin} className="mt-7 space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          {errorMsg && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm leading-relaxed text-red-300">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group h-11 w-full rounded-lg bg-violet-500 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {loading ? 'Signing you in…' : 'Log in'}
              {!loading && (
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              )}
            </span>
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-400">
          New to Pathify?{' '}
          <Link href="/signup" className="font-medium text-violet-400 transition-colors hover:text-violet-300">
            Create an account
          </Link>
        </p>
      </div>

      <p className="relative z-10 mt-6 max-w-md text-center text-xs leading-relaxed text-zinc-500">
        Confirmation emails come from Pathify by Pathfinder Labs. Didn’t get one? Try signing up
        again to resend.
      </p>
    </div>
  );
}
