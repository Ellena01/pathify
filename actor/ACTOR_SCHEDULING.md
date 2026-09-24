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

## Schedule (Recommended: every 6h)
1. Apify Console → Actors → pathify-intelligence-engine → Schedules → Create
   - Cron: `0 */6 * * *` (every 6h) or daily `0 8 * * *`
   - Input same as above
2. Add Webhook: After Actor run → POST https://YOUR_FRONTEND/api/sync
   - Header `x-cron-secret: YOUR_CRON_SECRET`
   - Body `{"datasetId":"7vWfQxcWXaL9qJShK"}`

This triggers `frontend/app/api/sync/route.ts` which upserts Dataset → Supabase `opportunities_cache`.

## Flow
Scheduled Runs → Apify Dataset (push_data per-record deduped) → Webhook /api/sync → Supabase cache → Frontend /api/jobs reads Supabase first (fast), falls back to Apify if cache miss.

## LLM Best
Set Actor env `GEMINI_API_KEY` (or `OPENAI_API_KEY`) + `useLLM:true` for high-recall on low-confidence items. Hybrid extractor auto-caches by description hash; cost ~ $0.02/100 jobs.

## Local Test
```bash
cd actor
python main.py  # with local Apify storage
# Or: apify run --input '{"startUrls":[{"url":"https://www.ycombinator.com/jobs"}],"maxItems":10}'
ls storage/datasets/default/*.json
```
