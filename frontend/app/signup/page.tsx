'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Building2, User } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

const COUNTRIES = ['Nigeria','Kenya','Ghana','Rwanda','South Africa','Ethiopia','Egypt','Morocco','Senegal','Uganda','Tanzania','Cameroon','Zambia','Zimbabwe','Botswana','Benin','Global / Remote'];

type Role = 'individual' | 'organization';

const ROLE_OPTIONS: { id: Role; title: string; body: string; icon: typeof User }[] = [
  {
    id: 'individual',
    title: 'Individual',
    body: 'I want to discover opportunities, track applications and grow my career.',
    icon: User,
  },
  {
    id: 'organization',
    title: 'Organization',
    body: 'I want to find talent, review passports and run outreach from one pipeline.',
    icon: Building2,
  },
];

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const selectedRole = ROLE_OPTIONS.find(r => r.id === role);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // `account_type` is read by `public.handle_new_user()`, which validates
        // it against the same vocabulary the DB check uses and falls back to
        // 'individual'. Never send `role` here: that column holds the job
        // title, and writing 'individual' into it would arrive as the user's
        // profession.
        data: {
          name,
          country,
          account_type: role,
          ...(role === 'organization' ? { org_name: name } : {}),
        },
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
    <div className="relative flex min-h-screen flex-col bg-zinc-950 text-white selection:bg-violet-500/30">
      <div
        aria-hidden="true"
        className="pathify-glow pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      <header className="relative z-10 px-5 pt-6 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
          <span className="text-base font-semibold tracking-tight text-white">Pathify</span>
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center px-5 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto w-full max-w-xl">
          {/* Step indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              <span>
                Step {step} of 2 · {step === 1 ? 'Your identity' : 'Your account'}
              </span>
              <span className="font-mono normal-case tracking-normal text-violet-400">Join Pathify</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-300"
                style={{ width: step === 1 ? '50%' : '100%' }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8">
            {/* STEP 1 — role picker */}
            {step === 1 && (
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Who is this account for?
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Pick one to start. It decides which workspace you land in — talent
                  accounts get a passport and matches, organizations get a talent
                  pipeline.
                </p>

                <div className="mt-6 space-y-3">
                  {ROLE_OPTIONS.map(option => {
                    const selected = role === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setRole(option.id)}
                        aria-pressed={selected}
                        className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all sm:p-5 ${
                          selected
                            ? 'border-violet-500/40 bg-violet-500/10 ring-1 ring-violet-500/30'
                            : 'border-white/10 bg-zinc-950/40 hover:border-violet-500/40'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                            selected
                              ? 'border-violet-500/40 bg-violet-500/20 text-violet-300'
                              : 'border-white/10 bg-white/5 text-zinc-400'
                          }`}
                        >
                          <option.icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-base font-medium text-white">{option.title}</span>
                            <span
                              className={`h-4 w-4 shrink-0 rounded-full border transition-colors ${
                                selected ? 'border-violet-400 bg-violet-500' : 'border-zinc-600'
                              }`}
                            />
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-zinc-400">
                            {option.body}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={!role}
                  onClick={() => setStep(2)}
                  className="group mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-500 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
                >
                  Continue
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </button>

                <p className="mt-5 text-center text-sm text-zinc-400">
                  Already have an account?{' '}
                  <Link href="/login" className="font-medium text-violet-400 transition-colors hover:text-violet-300">
                    Log in
                  </Link>
                </p>
              </div>
            )}

            {/* STEP 2 — account details */}
            {step === 2 && (
              <div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
                    {selectedRole?.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
                  >
                    Change
                  </button>
                </div>

                <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {role === 'organization' ? 'Create your organization account' : 'Create your account'}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {role === 'organization'
                    ? 'You can rename the organization and set its focus during setup.'
                    : 'One profile for matching, applications, and tracking.'}
                </p>

                <form onSubmit={handleSignup} className="mt-7 space-y-5">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-white">
                      {role === 'organization' ? 'Organization name' : 'Full name'}
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      autoComplete="organization"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={role === 'organization' ? 'e.g. Zenvest' : 'Aisha Bello'}
                      className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="country" className="block text-sm font-medium text-white">
                      Country
                    </label>
                    <select
                      id="country"
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                    >
                      {COUNTRIES.map(c => <option key={c} value={c} className="bg-zinc-950">{c}</option>)}
                    </select>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      {role === 'organization'
                        ? 'Used to scope your hiring regions. You can add more during setup.'
                        : <>This sets the jurisdiction on your passport ID — for example{' '}
                          <span className="font-mono text-violet-400">PYF-8X29K-4</span>.</>}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-white">
                      Email
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
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                    />
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      Use 6+ characters. We will email you a confirmation link from Pathify.
                    </p>
                  </div>

                  {errorMsg && (
                    <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm leading-relaxed text-red-300">
                      {errorMsg}
                    </p>
                  )}
                  {infoMsg && (
                    <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm leading-relaxed text-emerald-300">
                      {infoMsg}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group h-11 w-full rounded-lg bg-violet-500 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      {loading ? 'Creating your account…' : 'Create account'}
                      {!loading && (
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      )}
                    </span>
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-zinc-400">
                  Already have an account?{' '}
                  <Link href="/login" className="font-medium text-violet-400 transition-colors hover:text-violet-300">
                    Log in
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
