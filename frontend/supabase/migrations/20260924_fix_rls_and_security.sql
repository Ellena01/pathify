-- Fix P0: RLS overly permissive update + harden sync
-- Run in SQL Editor

-- 1) Fix opportunities_cache RLS — only service_role may write
drop policy if exists "opportunities_service_write" on public.opportunities_cache;
drop policy if exists "opportunities_service_update" on public.opportunities_cache;

-- Insert only service_role
create policy "opportunities_service_write" on public.opportunities_cache
  for insert with check (auth.role() = 'service_role');

-- Update only service_role
create policy "opportunities_service_update" on public.opportunities_cache
  for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Delete only service_role (for expiry purge)
drop policy if exists "opportunities_service_delete" on public.opportunities_cache;
create policy "opportunities_service_delete" on public.opportunities_cache
  for delete using (auth.role() = 'service_role');

-- Keep public read
-- already: create policy "opportunities_public_read" for select using (true)

-- 2) Ensure user_profiles delete policy (low risk but complete)
drop policy if exists "users_delete_own_profile" on public.user_profiles;
create policy "users_delete_own_profile" on public.user_profiles
  for delete using (auth.uid() = id);

-- 3) Ensure synthetic_profiles has no write for anon (service_role bypasses RLS, so no insert policy needed)
-- Already only select where opt_in=true

-- 4) Add pgcrypto if missing for gen_random_uuid
create extension if not exists "pgcrypto";
