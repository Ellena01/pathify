# Pathify Supabase Setup — New Project "pathify"

## 1. Create Project
1. Go to https://supabase.com → New Project → name `pathify` (choose region closest to users, e.g., EU Frankfurt if Africa/EU).
2. Wait for provisioning, copy `Project URL` and `anon key` from Settings → API.

## 2. Enable Email Confirmation (required)
Settings → Authentication → Email Auth:
- Enable `Enable email confirmations` (required per spec)
- Set `Site URL` to your Vercel deployment (e.g., https://pathify.vercel.app)
- Add Redirect URLs: `https://pathify.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
- Configure SMTP if you want custom emails; Supabase default works for MVP.

## 3. Run Schema
In Supabase SQL Editor, paste and run `supabase/schema.sql` (at `frontend/supabase/schema.sql`).
Creates:
- `user_profiles` (FK auth.users, name/role/country/skills/goals)
- `saved_jobs` (user_id + job_url unique)
- `opportunities_cache` (Scheduled Actor → Dataset → cached)
with RLS policies.

Verify:
```sql
select * from user_profiles limit 1;
select * from opportunities_cache limit 5;
```

## 4. Env
Copy `.env.example` → `.env.local` and fill:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey... # Settings → API → service_role (server-only!)
APIFY_TOKEN=apify_api_...
APIFY_DATASET_ID=7vWfQxcWXaL9qJShK
CRON_SECRET=openssl rand -hex 32
# Optional BEST LLM:
GEMINI_API_KEY=...  # or OPENAI_API_KEY / LLM_API_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `APIFY_TOKEN` to browser.

## 5. Test Locally
```bash
npm install
npm run dev # http://localhost:3000
# Signup → check email → confirm → login → edit skills → bookmark → verify Supabase tables
```

## 6. Schedule Flow (see ACTOR_SCHEDULING.md)
Actor (Apify Scheduler) → Dataset → POST /api/sync (cron secret) → Supabase `opportunities_cache` → Frontend reads via /api/jobs (cached first)
