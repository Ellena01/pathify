# Pathify Actor Scheduling — MVP 5 Sources

## Deploy
```bash
cd actor
pip install -r requirements.txt
apify login  # or set APIFY_TOKEN
apify push
# In Apify Console, input JSON:
{
  "startUrls": [],  # empty → uses MVP 5 defaults (YC, WorkAtStartup, Devpost, OpportunityDesk, Eventbrite)
  "opportunityTypes": ["jobs_remote","internships","hackathons","fellowships","conferences"],
  "userSkills": ["React","TypeScript","Python","Next.js"],
  "maxItems": 80,
  "useLLM": false,  # set true + env GEMINI_API_KEY for BEST extraction
  "proxyConfiguration": {"useApifyProxy": true}
}
```

## Schedule (Recommended: every 6h — Apify webhook primary)
1. Apify Console → Actors → pathify-intelligence-engine → Schedules → Create
   - Cron: `0 */6 * * *` (every 6h) or daily `0 8 * * *`
   - Input same as above
2. Add Webhook: After Actor run → POST https://YOUR_FRONTEND/api/sync
   - Header `x-cron-secret: YOUR_CRON_SECRET` (new: `bf845d65b4de9cf841a7e3efdf49aa2cf3189743224debe741b63918a525f38b` — rotate per env, set in Apify Actor env + Vercel env)
   - Body `{"datasetId":"7vWfQxcWXaL9qJShK"}`
   - Apify token now sent via `Authorization: Bearer` header (not `?token=` query) — `frontend/app/api/sync` fixed.

This triggers `frontend/app/api/sync/route.ts` (service_role) which upserts Dataset → Supabase `opportunities_cache`.

**Note:** `frontend/vercel.json` now only crons `/api/alerts/dispatch 0 7 * * *` (daily digest). `/api/sync` is **not** in Vercel cron — Apify webhook is primary to avoid double fetch cost. Do not add sync back to vercel.json.

## Flow
Scheduled Runs → Apify Dataset (push_data per-record deduped, per_domain telemetry) → Webhook /api/sync → Supabase cache → Frontend /api/jobs reads Supabase first (fast), falls back to Apify if cache miss. Alerts dispatch via Vercel cron next morning.

## LLM Best
Set Actor env `GEMINI_API_KEY` (or `OPENAI_API_KEY`) + `useLLM:true` for high-recall on low-confidence items. Hybrid extractor auto-caches by description hash; cost ~ $0.02/100 jobs.

## Local Test
```bash
cd actor
python main.py  # with local Apify storage
# Or: apify run --input '{"startUrls":[{"url":"https://www.ycombinator.com/jobs"}],"maxItems":10}'
ls storage/datasets/default/*.json
```
