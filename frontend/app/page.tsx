'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search, CheckCircle2, Shield, Users, Target, Layers,
  ArrowRight, Compass, MessageSquare, CheckSquare, ExternalLink
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import type { User } from '@supabase/supabase-js';

type PreviewJob = {
  id?: string | number;
  title?: string;
  organization?: string;
  location?: string;
  opportunity_type?: string;
  verification_status?: string;
  application_url?: string;
  skills_required?: Array<string | { canonical?: string }>;
};

const STEPS = [
  {
    n: '01',
    icon: Layers,
    title: 'Build your passport',
    body: 'Add the skills you actually use, the work you want next, and where you want to do it. It takes about two minutes and stays private until you decide to share it.',
    tags: ['Skills', 'Goals', 'Location'],
  },
  {
    n: '02',
    icon: Target,
    title: 'Get matched from every source at once',
    body: 'We check job boards, fellowship lists, hackathons, and grant pages every hour, then score each listing against your profile so you know where you stand.',
    tags: ['Hourly sync', '4-factor score', 'Skill gaps'],
  },
  {
    n: '03',
    icon: CheckSquare,
    title: 'Track what happens next',
    body: 'Move each opportunity from wishlist to applied to interviewing to offer. One list instead of a spreadsheet you stop updating after a week.',
    tags: ['Wishlist', 'Applied', 'Offer'],
  },
];

export default function HomePage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [preview, setPreview] = useState<PreviewJob[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUser(data.user));
    fetch('/api/jobs')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setPreview(d.slice(0, 3));
      })
      .catch(() => {});
  }, []);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) {
      window.location.href = `/opportunities?q=${encodeURIComponent(q)}`;
    } else {
      window.location.href = '/opportunities';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-violet-500/30">
      {/* Header */}
      <header className="safe-top sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-6 w-6 text-violet-400"
              aria-hidden="true"
            >
              <circle cx="6" cy="18" r="2" />
              <circle cx="6" cy="6" r="2" />
              <circle cx="18" cy="12" r="2" />
              <path d="M8 17.5L16 13" />
              <path d="M8 6.5L16 11" />
            </svg>
            <span className="text-base font-semibold tracking-tight text-white">Pathify</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <Link
              href="/opportunities"
              className="hidden rounded-lg px-3 py-2 text-zinc-400 transition-colors hover:text-white sm:inline-flex"
            >
              Opportunities
            </Link>
            {authUser ? (
              <Link
                href="/dashboard"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium text-white transition-colors hover:border-violet-500/40"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-zinc-400 transition-colors hover:text-white"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-medium text-white transition-colors hover:border-violet-500/40"
                >
                  Join
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pathify-glow pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            50+ verified sources, refreshed every hour
          </p>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Where your skills meet{' '}
            <span className="text-violet-400">the right opportunity.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            Add your skills, goals, and location once. Pathify checks jobs, fellowships, and
            funding from sources you already trust, scores each one against your profile, and
            tells you what to learn next.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-violet-500 px-6 text-sm font-semibold text-white transition-colors hover:bg-violet-400"
            >
              Get Started
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/opportunities"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-6 text-sm font-medium text-white transition-colors hover:border-violet-500/40"
            >
              <Compass className="h-4 w-4 text-violet-400" />
              Browse opportunities
            </Link>
          </div>

          <p className="mt-4 text-sm text-zinc-500">
            Free to start. Your passport stays private until you share it.
          </p>

          {/* Search */}
          <div className="mt-12 max-w-2xl rounded-2xl border border-white/10 bg-zinc-900/40 p-3 backdrop-blur-xl sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="React, Python remote, Fellowship Lagos…"
                  aria-label="Search opportunities"
                  className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
              <button
                onClick={handleSearch}
                className="group inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
              >
                Search
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span>Popular:</span>
              {['Remote Jobs', 'Fellowships', 'Lagos', 'Python', 'Machine Learning'].map(t => (
                <button
                  key={t}
                  onClick={() => {
                    window.location.href = `/opportunities?q=${encodeURIComponent(t)}`;
                  }}
                  className="transition-colors hover:text-violet-400"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3-step editorial flow */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Three steps, about five minutes.
            </h2>
            <p className="mt-3 leading-relaxed text-zinc-400">
              No questionnaire marathon. You tell us what you can do and what you want, and the
              rest runs on its own from there.
            </p>
          </div>

          <ol className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map(s => (
              <li
                key={s.n}
                className="group rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl transition-colors hover:border-violet-500/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-widest text-violet-400">{s.n}</span>
                  <s.icon className="h-5 w-5 text-zinc-500 transition-colors group-hover:text-violet-400" />
                </div>
                <h3 className="mt-5 text-lg font-medium leading-snug text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {s.tags.map(t => (
                    <span
                      key={t}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Live opportunities preview */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Live opportunities
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Real listings from the Pathify catalog, refreshed daily
              </p>
            </div>
            <Link
              href="/opportunities"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
            >
              View full catalog
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {preview.length === 0 ? (
              // No invented listings. The previous version rendered three
              // hardcoded "opportunities" — including `https://example.com` as an
              // application URL and a fabricated "84% fit" — under a heading
              // promising live data. An honest empty state is the only correct
              // thing to show when the catalog has not synced yet.
              <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/40 py-14 text-center md:col-span-3">
                <p className="text-sm text-zinc-400">
                  The opportunity catalog is being refreshed. Check back shortly, or browse what is
                  live.
                </p>
                <Link
                  href="/opportunities"
                  className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
                >
                  Open the catalog
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : preview.map((opp, i) => {
              const detailHref = `/opportunities/${encodeURIComponent(opp.application_url || opp.id || String(i))}`;
              // `match_score` is the scraper's score against the actor run's
              // operator, not the visitor's — so it is deliberately NOT shown
              // here. Fit percentages appear once a visitor has a passport.
              const skills: string[] = Array.isArray(opp.skills_required)
                ? opp.skills_required
                    .map((s) => (typeof s === 'string' ? s : s?.canonical))
                    .filter((s): s is string => Boolean(s))
                    .slice(0, 3)
                : [];

              return (
                <div
                  key={opp.application_url || i}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl transition-colors hover:border-violet-500/40"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      <span>{String(opp.opportunity_type ?? '').replace(/_/g, ' ') || 'Opportunity'}</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {opp.verification_status === 'high' ? 'Verified' : 'Check Details'}
                      </span>
                    </div>

                    <Link href={detailHref} className="group mt-2 block">
                      <p className="line-clamp-2 text-base font-medium text-white transition-colors group-hover:text-violet-400">
                        {opp.title}
                      </p>
                    </Link>

                    <p className="mt-1.5 text-sm text-zinc-400">
                      {opp.organization} · {opp.location}
                    </p>

                    {skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {skills.map((s: string) => (
                          <span
                            key={s}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                    <Link
                      href={detailHref}
                      className="font-medium text-violet-400 transition-colors hover:text-violet-300"
                    >
                      View details
                    </Link>
                    <a
                      href={opp.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-white transition-colors hover:text-violet-400"
                    >
                      Apply
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature teasers */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">
              What you get
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Everything sits behind one profile.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="group rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl transition-colors hover:border-violet-500/40">
              <Shield className="h-5 w-5 text-violet-400" />
              <h3 className="mt-4 text-base font-medium text-white">A passport you control</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Your profile is private by default. Generate a public link only when you are
                applying or networking, and take it down whenever you want.
              </p>
              <p className="mt-4 truncate rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-violet-400">
                PYF-8X29K-4 → pathify.app/p/…
              </p>
              <Link
                href="/signup"
                className="group/link mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
              >
                Claim your passport
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5" />
              </Link>
            </div>

            <div className="group rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl transition-colors hover:border-violet-500/40">
              <MessageSquare className="h-5 w-5 text-violet-400" />
              <h3 className="mt-4 text-base font-medium text-white">Navigator</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Ask in plain language. Navigator runs the search against real rows in the database
                and comes back with listings and sources, not guesses.
              </p>
              <p className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
                “Remote Python fellowships for Nigerian developers”
              </p>
              <Link
                href="/dashboard"
                className="group/link mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
              >
                Open Navigator
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5" />
              </Link>
            </div>

            <div className="group rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl transition-colors hover:border-violet-500/40">
              <CheckSquare className="h-5 w-5 text-violet-400" />
              <h3 className="mt-4 text-base font-medium text-white">Application tracker</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Wishlist, applied, interviewing, offer. Every move saves to your account, so the
                tracker is the same on your laptop and your phone.
              </p>
              <p className="mt-4 rounded-lg border border-white/10 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
                Saved jobs sync to your profile the moment you move them.
              </p>
              <Link
                href="/dashboard"
                className="group/link mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 transition-colors hover:text-violet-300"
              >
                View the tracker
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/link:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium text-white">Pathify</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              Jobs, fellowships, and funding for African and emerging tech talent — sourced from
              places worth trusting.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
            <Link href="/opportunities" className="transition-colors hover:text-white">
              Opportunities
            </Link>
            <Link href="/org" className="transition-colors hover:text-white">
              For organizations
            </Link>
            <Link href="/dashboard" className="transition-colors hover:text-white">
              Dashboard
            </Link>
            <Link href="/login" className="transition-colors hover:text-white">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
