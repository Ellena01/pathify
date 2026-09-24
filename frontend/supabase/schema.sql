-- Pathify Supabase Schema — create new project "pathify", run this SQL in SQL Editor
-- Enables: user_profiles (persisted from Zustand store), saved_jobs, opportunities_cache (Actor → Dataset → Supabase)
-- Flow: Scheduled Actor runs → Apify Dataset → server-side /api/sync (cron, service_role) → opportunities_cache → frontend reads Supabase

-- Extensions
create extension if not exists "pgcrypto";

-- 1) user_profiles — mirrors frontend/app/store.ts but persisted, FK to auth.users
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Ada',
  role text not null default 'Software Engineer',
  country text not null default 'Nigeria',
  skills text[] not null default array['React','TypeScript','Next.js']::text[],
  goals text[] not null default array['Remote Job','Fellowship']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "users_select_own_profile" on public.user_profiles;
drop policy if exists "users_insert_own_profile" on public.user_profiles;
drop policy if exists "users_update_own_profile" on public.user_profiles;

create policy "users_select_own_profile" on public.user_profiles
  for select using (auth.uid() = id);
create policy "users_insert_own_profile" on public.user_profiles
  for insert with check (auth.uid() = id);
create policy "users_update_own_profile" on public.user_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_user_profiles_updated on public.user_profiles;
create trigger trg_user_profiles_updated
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- 2) saved_jobs — replaces frontend/app/page.tsx useState<string[]> savedJobs (ephemeral)
create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_url text not null,
  job_data jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, job_url)
);

alter table public.saved_jobs enable row level security;

drop policy if exists "saved_jobs_select_own" on public.saved_jobs;
drop policy if exists "saved_jobs_insert_own" on public.saved_jobs;
drop policy if exists "saved_jobs_delete_own" on public.saved_jobs;

create policy "saved_jobs_select_own" on public.saved_jobs
  for select using (auth.uid() = user_id);
create policy "saved_jobs_insert_own" on public.saved_jobs
  for insert with check (auth.uid() = user_id);
create policy "saved_jobs_delete_own" on public.saved_jobs
  for delete using (auth.uid() = user_id);

create index if not exists idx_saved_jobs_user on public.saved_jobs(user_id);

-- 3) opportunities_cache — Scheduled Actor → Apify Dataset → cached in Supabase (frontend reads here)
-- Public read, write only via service_role (cron /api/sync) or authenticated upsert (api/jobs opportunistic)
create table if not exists public.opportunities_cache (
  application_url text primary key,
  title text not null,
  organization text not null,
  location text not null,
  opportunity_type text not null, -- jobs_remote | jobs_hybrid | jobs_onsite | internships | conferences | fellowships | events | startup_funding | grants | scholarships | hackathons
  skills_required jsonb not null default '[]'::jsonb, -- List[str] or List[Skill]
  verification_status text not null default 'review_recommended', -- high | review_recommended
  discovered_at date not null default current_date,
  match_score int,
  matched_skills jsonb default '[]'::jsonb,
  skill_gap jsonb default '[]'::jsonb,
  source_domain text,
  deadline date,
  amount text,
  raw_data jsonb,
  synced_at timestamptz not null default now()
);

alter table public.opportunities_cache enable row level security;

drop policy if exists "opportunities_public_read" on public.opportunities_cache;
drop policy if exists "opportunities_service_write" on public.opportunities_cache;

-- Public read for dashboard (anon + authenticated)
create policy "opportunities_public_read" on public.opportunities_cache
  for select using (true);

-- Authenticated can upsert (opportunistic cache from api/jobs); for strict service_role-only, remove and use service_role bypass
create policy "opportunities_service_write" on public.opportunities_cache
  for insert with check (auth.role() = 'authenticated' or auth.role() = 'service_role');
-- Allow updates as well (upsert)
drop policy if exists "opportunities_service_update" on public.opportunities_cache;
create policy "opportunities_service_update" on public.opportunities_cache
  for update using (true) with check (true);

create index if not exists idx_opportunities_type on public.opportunities_cache(opportunity_type);
create index if not exists idx_opportunities_domain on public.opportunities_cache(source_domain);
create index if not exists idx_opportunities_discovered on public.opportunities_cache(discovered_at desc);

-- Optional: cron scheduling — call POST /api/sync with CRON_SECRET header or Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY
-- Configure via Vercel Cron or pg_cron + Supabase Edge Function if desired.
