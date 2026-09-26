# Pathify Actor — multi-platform, query-driven discovery

## What the actor does

Crawls opportunities from four discovery surfaces and normalises everything into
Pathify's schema, which `/api/sync` then sanitises and upserts into
`opportunities_cache`.

| Surface | How it is reached | Why it is here |
| --- | --- | --- |
| **Google** | `site:`-scoped SERP queries | The long tail: company career pages, national boards, grant portals — anything indexable |
| **LinkedIn** | guest `/jobs/search` | Most senior African tech roles are posted here first, often before the employer's own page |
| **Telegram** | public `t.me` web previews | The channels African developer communities actually post in |
| **Websites** | `site:`-scoped HTML, plus 45+ registry boards | Aggregators with no public API, and the regional core |

Discovery is **query-driven**, not URL-driven. `src/discovery.py` expands
`categories` x `locations` x `opportunityTypes` into concrete `site:`-scoped
tasks, one per platform. `src/sources/__init__.py` supplies structural defaults
(index URLs, vertical fallbacks) for boards that benefit from a known crawl
shape. The two are complementary: discovery widens coverage, the registry
supplies reliability.

## Deploy

```bash
cd actor
pip install -r requirements.txt
apify login          # or set APIFY_TOKEN
apify push
```

## Input schema

Every field is optional. With no input at all the actor runs a standing
African-first query sweep, so the default behaviour backs the regional
positioning with real data.

```jsonc
{
  // --- Discovery (preferred over startUrls) ---
  "categories":  ["software internship", "tech grant", "design competition"],
  "locations":   ["Nigeria", "Kenya", "Africa"],
  "opportunityTypes": ["internships", "grants", "hackathons"],

  // Or supply ready-made `site:`-scoped queries directly.
  "queries": [
    "site:linkedin.com/jobs software engineer internship Nigeria",
    "site:google.com/search \"remote developer fellowship\" 2026"
  ],

  // --- Overrides ---
  "startUrls": [],              // bypasses the registry seed list
  "maxItems": 80,
  "maxDiscoveryTasks": 40,
  "enqueueLinks": true,
  "useLLM": false,              // true + GEMINI_API_KEY for higher-recall extraction
  "location": "Global / Remote",// fallback location label
  "proxyConfiguration": { "useApifyProxy": true }
}
```

Grant/fellowship/scholarship queries automatically get the current year
appended — those verticals are published per cohort, and a bare query returns
last cycle's page.

## Scheduling

**Primary: Apify Schedule + webhook.**

1. Apify Console → Actors → `pathify-intelligence-engine` → Schedules → Create
   - Suggested cron: `0 */6 * * *`
   - Input: a rotation of `categories` / `locations` so each run covers a
     different slice rather than repeating the same queries.
2. Webhook: After run → `POST https://YOUR-FRONTEND/api/sync`
   - Header `Authorization: Bearer $CRON_SECRET` (set `CRON_SECRET` in both the
     Apify Actor env and Vercel env — generate with `openssl rand -hex 32`).
   - **Do not send `datasetId` in the body.** The endpoint reads
     `APIFY_DATASET_ID` from its own environment; accepting a caller-supplied
     dataset id lets anyone holding the token redirect the sync at an arbitrary
     dataset.

**Secondary: Vercel cron.** `vercel.json` runs `/api/sync` daily at 05:15 UTC
and `/api/alerts/dispatch` at 07:00 UTC, both with
`Authorization: Bearer ${CRON_SECRET}`. The daily sync is a safety net — it
ingests whatever the dataset holds even if the webhook is misconfigured. It does
not start a new crawl; to trigger one on demand, add `?trigger=actor` (requires
`APIFY_ACTOR_ID`).

> An earlier revision of this file contained a live `CRON_SECRET`. It is
> compromised — rotate it in Vercel and Apify, and never document the value.

## What the actor does NOT do

**It does not compute match scores.** `compute_match` used to live in
`src/enrichment.py` as a third implementation alongside `lib/matching.ts` and
`app/utils/score.ts`; the three disagreed. `lib/matching.ts` is now the only
engine, it runs server-side per user (it needs `yearsExperience` and
`preferredLocations`, which do not exist at scrape time), and it persists to
`user_opportunity_matches`. The actor's job is to describe the opportunity
accurately; scoring it is the application's job.

`deadline` and `amount` are still extracted here, because they are properties of
the listing rather than of the user.

## Data quality

`src/enrichment.py` extracts deadlines from schema.org JSON-LD `validThrough`,
`<time datetime>`, meta tags and prose, in descending order of trust. It
understands `2026-11-30`, `15 March 2026`, `March 15, 2026`, `15/03/2026`,
`closes in 2 weeks` and `until 30 June`, and it **returns nothing** for "rolling
applications" rather than guessing — a confident wrong deadline is worse than
no deadline, because the tracker's "closing soon" urgency acts on it.

`/api/sync` performs the authoritative checks: `http`/`https` allowlist on every
URL, taxonomy-based skill canonicalisation, and three-layer dedupe (exact URL,
tracking-stripped URL, and a fuzzy title+organisation fingerprint that collapses
the same vacancy syndicated across Google, LinkedIn and a careers page).

## Tests

```bash
cd actor
python -m tests.test_actor        # 43 tests, no network
```

Covers deadline and amount parsing, type inference, link hygiene, the dedupe key,
query expansion and platform routing, and asserts every registry entry is a
uniformly callable that tolerates a missing soup.

## Local run

```bash
cd actor
python main.py
# or:
apify run --input '{"categories":["software internship"],"locations":["Nigeria"],"maxItems":10}'
ls storage/datasets/default/*.json
```

Inspect the run summary in the dataset:

```bash
apify call actor:last-run/get-value --key=SUMMARY
```

`SUMMARY` reports `total`, `per_domain`, `per_platform`, the queries used, and an
`errors` histogram — which is how a bad scrape is diagnosed without re-running.

## LLM extraction

Set Actor env `GEMINI_API_KEY` (or `OPENAI_API_KEY`) with `useLLM: true` for
higher recall on low-confidence items. The hybrid extractor caches by description
hash, so cost is roughly $0.02 per 100 jobs.
