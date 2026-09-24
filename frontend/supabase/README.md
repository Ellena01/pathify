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
CRON_SECRET=bf845d65b4de9cf841a7e3efdf49aa2cf3189743224debe741b63918a525f38b # openssl rand -hex 32
RESEND_API_KEY=re_... # for alerts@pathify.app daily digest
ALERTS_FROM_EMAIL=Pathify <alerts@pathify.app>
NEXT_PUBLIC_SITE_URL=https://pathify.app
# Optional BEST LLM (Apify Actor env also):
GEMINI_API_KEY=...  # or OPENAI_API_KEY
```
Recent `CRON_SECRET` rotated to `bf845d…38b` — set same in Vercel Env + Apify Actor env secrets. Never expose `SUPABASE_SERVICE_ROLE_KEY`/`APIFY_TOKEN`/`RESEND_API_KEY` to browser.

Sync is now **Apify webhook primary** (`Apify Scheduler → POST /api/sync` with `x-cron-secret`), not Vercel cron. `vercel.json` only crons `/api/alerts/dispatch 0 7 * * *`.

## 5. Test Locally
```bash
npm install
npm run dev # http://localhost:3000
# Signup → check email → confirm → login → edit skills → bookmark → verify Supabase tables
```

## 6. Schedule Flow (see ACTOR_SCHEDULING.md)
Actor (Apify Scheduler) → Dataset → POST /api/sync (cron secret) → Supabase `opportunities_cache` → Frontend reads via /api/jobs (cached first)
