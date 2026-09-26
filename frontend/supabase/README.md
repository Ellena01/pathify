# Pathify Supabase Setup — New Project "pathify"

## 1. Create Project
1. Go to https://supabase.com → New Project → name `pathify` (choose region closest to users, e.g., EU Frankfurt if Africa/EU).
2. Wait for provisioning, copy `Project URL` and `anon key` from Settings → API.

## 2. Enable Email Confirmation
Settings → Authentication → Email Auth:
- For MVP to avoid `5/hour` rate limits on free tier, **uncheck** `Enable email confirmations` (recommended). Then signup auto-logs in and goes to `/dashboard` without email. Keep Supabase default SMTP for now.
- If you keep confirmations ON (spec), set `Site URL` to your Vercel deployment (e.g., https://pathify.vercel.app) and add Redirect URLs: `https://pathify.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`. Note: keep confirmations ON will trigger `over_email_send_rate_limit` quickly on free tier.
- Frontend `app/signup/page.tsx` already handles both: if session exists auto-push to `/dashboard`, else shows “check email”.

## 3. Run Schema
In Supabase SQL Editor, paste and run **in order**:
1. `supabase/schema.sql` (at `frontend/supabase/schema.sql`).
Creates:
- `user_profiles` (FK auth.users, name/role/country/skills/goals)
- `saved_jobs` (user_id + job_url unique)
- `opportunities_cache` (Scheduled Actor → Dataset → cached)
with RLS policies.
2. `supabase/migrations/20260924_passport_org_alerts_navigator.sql` — adds `passport_id / share_slug / synthetic_profiles (14 seeds) / alerts / navigator indexes`.
3. `supabase/migrations/20260924_fix_rls_and_security.sql` — hardens `opportunities_cache` update to `service_role` only, adds `user_profiles delete` policy.
4. `supabase/migrations/20260926_extended_passport_onboarding.sql` — extended `metadata` jsonb, `onboarding_completed` flag.
5. `supabase/migrations/20260926_hardening_passport_v2.sql` — **required.** Closes the world-writable `opportunities_cache` update policy, revokes the unauthenticated `generate_share_slug` RPC, moves passports to `PYF-XXXXX-C`, adds `first_seen_at`, the `saved_jobs` UPDATE policy, `user_opportunity_matches`, and the admin audit log.

Verify:
```sql
select * from user_profiles limit 1;
select * from opportunities_cache limit 5;
select * from synthetic_profiles limit 3; -- should show 14 previews
```

## 4. Env
Copy `.env.example` → `.env.local` and fill:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey... # Settings → API → service_role (server-only!)
APIFY_TOKEN=apify_api_...
APIFY_DATASET_ID=7vWfQxcWXaL9qJShK
CRON_SECRET=<generate: openssl rand -hex 32>
RESEND_API_KEY=re_... # for alerts@pathify.app daily digest
ALERTS_FROM_EMAIL=Pathify <alerts@pathify.app>
NEXT_PUBLIC_SITE_URL=https://pathify.app
# Optional BEST LLM (Apify Actor env also):
GEMINI_API_KEY=...  # or OPENAI_API_KEY
```

> **Never commit a real secret.** Generate `CRON_SECRET` per environment and
> store it in Vercel + Apify Actor env only. A previous revision of this file
> contained a live value; it is treated as compromised and must be rotated.

Set the *same* `CRON_SECRET` in Vercel Env and in the Apify Actor env. Never
expose `SUPABASE_SERVICE_ROLE_KEY` / `APIFY_TOKEN` / `RESEND_API_KEY` to the browser.

Auth for scheduled endpoints is `Authorization: Bearer $CRON_SECRET` only —
header-presence checks such as `x-vercel-cron` are **not** authentication,
because any header a client can set is not a secret.

Sync is **Apify webhook primary** (`Apify Scheduler → POST /api/sync` with
`Authorization: Bearer $CRON_SECRET`). `vercel.json` only crons
`/api/alerts/dispatch 0 7 * * *`.

## 5. Test Locally
```bash
npm install
npm run dev # http://localhost:3000
# Signup → check email → confirm → login → edit skills → bookmark → verify Supabase tables
```

## 6. Schedule Flow (see ACTOR_SCHEDULING.md)
Actor (Apify Scheduler) → Dataset → POST /api/sync (cron secret) → Supabase `opportunities_cache` → Frontend reads via /api/jobs (cached first)
