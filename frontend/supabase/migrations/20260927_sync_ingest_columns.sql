-- ============================================================================
-- Pathify migration — 20260927_sync_ingest_columns.sql
--
-- Closes the gap between what the actor emits, what /api/sync writes, and what
-- the table actually has.
--
-- WHY THIS IS A P0 FIX, NOT A NICE-TO-HAVE
-- ----------------------------------------
-- `opportunities_cache` (supabase/schema.sql) has no `source_platform` column.
-- `/api/sync` writes it. Postgres rejects the statement with
--
--     column "source_platform" of relation "opportunities_cache" does not exist
--
-- and because the sync issues ONE multi-row upsert for the whole batch, that
-- single unknown column aborts the *entire* ingestion run. The catalog stops
-- refreshing entirely and the failure only surfaces as a 500 with a terse
-- `detail` string.
--
-- Verified by `node scripts/verify-permissions.mjs`, which cross-checks the
-- columns `/api/sync` writes against the migrations and fails if any are
-- undeclared. Run it after applying.
--
-- This migration also adds `description` and `discovery_query`, which the
-- multi-platform actor now emits. `description` is read by the opportunity
-- detail page; `discovery_query` records which search query surfaced a
-- listing, so a bad query is diagnosable without re-running the crawl.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Missing columns
-- ---------------------------------------------------------------------------

-- Which platform surface produced this row: google | linkedin | telegram |
-- website | registry. Makes the source-health breakdown in /admin attributable
-- to a discovery surface and not just a hostname.
alter table public.opportunities_cache
  add column if not exists source_platform text;

-- Bounded summary extracted by the actor. Previously the only copy lived inside
-- the `raw_data` blob, which the detail view deliberately does not select --
-- so descriptions were fetched but never rendered.
alter table public.opportunities_cache
  add column if not exists description text;

-- The `site:`-scoped query that surfaced this listing. Provenance only.
alter table public.opportunities_cache
  add column if not exists discovery_query text;

-- Constrain the platform vocabulary. NULL is allowed and means "produced before
-- this column existed", so old rows stay valid.
alter table public.opportunities_cache
  drop constraint if exists opportunities_cache_source_platform_check;
alter table public.opportunities_cache
  add constraint opportunities_cache_source_platform_check
  check (
    source_platform is null
    or source_platform in ('google', 'linkedin', 'telegram', 'website', 'registry')
  );

-- ---------------------------------------------------------------------------
-- 2. Indexes for the new query paths
-- ---------------------------------------------------------------------------

-- /api/admin/metrics groups by source_domain; platform is the next useful cut
-- ("LinkedIn died, Google is fine") and was previously unqueryable.
create index if not exists idx_opportunities_platform
  on public.opportunities_cache(source_platform, first_seen_at desc)
  where source_platform is not null;

-- The detail page reads exactly one row by primary key, so it needs no new
-- index -- but the catalog's "For you / All listings" scope toggle and the
-- digest's new-since-last-email filter both lean on first_seen_at. Re-asserted
-- here so a database that predates the hardening migration still ends up with
-- it after running this file.
create index if not exists idx_opportunities_first_seen
  on public.opportunities_cache(first_seen_at desc);

-- ---------------------------------------------------------------------------
-- 3. Re-assert the write policy
--
-- `supabase/schema.sql` ships
--     create policy "opportunities_service_update" ... using (true) with check (true)
-- which grants UPDATE to *every* role including anon: any client could rewrite
-- the whole catalog, set verification_status = 'high', or store a
-- `javascript:` URL in application_url and have it rendered as an href.
--
-- 20260926_hardening_passport_v2.sql drops it and replaces it with
-- service_role-only policies. Re-asserted here because this migration is the
-- one an operator is most likely to run on a database that predates 20260926,
-- and a sync that "succeeds" through a world-writable policy is worse than one
-- that fails loudly.
--
-- Note: `service_role` has BYPASSRLS, so it writes regardless. These policies
-- are defence in depth for every other role.
-- ---------------------------------------------------------------------------

drop policy if exists "opportunities_service_write" on public.opportunities_cache;
drop policy if exists "opportunities_service_update" on public.opportunities_cache;
drop policy if exists "opportunities_service_delete" on public.opportunities_cache;
drop policy if exists "opportunities_service_insert" on public.opportunities_cache;

create policy "opportunities_service_insert" on public.opportunities_cache
  for insert with check (auth.role() = 'service_role');
create policy "opportunities_service_update" on public.opportunities_cache
  for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "opportunities_service_delete" on public.opportunities_cache
  for delete using (auth.role() = 'service_role');

-- Public SELECT stays: the catalog is intentionally browsable, and the
-- service_role key is never exposed to the browser.
drop policy if exists "opportunities_public_read" on public.opportunities_cache;
create policy "opportunities_public_read" on public.opportunities_cache
  for select using (true);

-- ---------------------------------------------------------------------------
-- 4. Grants
--
-- PostgREST reaches the table as `anon` / `authenticated` / `service_role`.
-- A missing GRANT is a permission error even when the policy allows it, so the
-- privilege is asserted explicitly rather than assumed from the policy.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select on public.opportunities_cache to anon, authenticated;
grant insert, update, delete on public.opportunities_cache to service_role;
revoke insert, update, delete on public.opportunities_cache from anon, authenticated;

-- The upsert conflict target. `application_url` is the primary key, so this
-- index already exists; the statement is here so a failed
-- "there is no unique or exclusion constraint matching the ON CONFLICT clause"
-- error is impossible after this migration.
create unique index if not exists idx_opportunities_application_url
  on public.opportunities_cache(application_url);
