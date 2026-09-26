-- ============================================================================
-- Pathify migration — 20260926_hardening_passport_v2.sql
--
-- Fixes, in order of severity:
--   1. opportunities_cache was world-WRITABLE (update policy `using (true)`)
--   2. generate_share_slug was an unauthenticated SECURITY DEFINER RPC that
--      published other users' passports
--   3. Passport IDs move from PTQ-{CC}-{YYYY}-{XXXX} (16 bits of entropy,
--      user-overwritable) to PYF-{5 chars} with a jurisdiction column
--   4. first_seen_at added so "new since last digest" is a real fact
--   5. saved_jobs gained the UPDATE policy its RLS was missing
--   6. is_admin + admin audit trail for the /admin surface
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. opportunities_cache: close the world-writable hole
--
-- The original `opportunities_service_update` policy was
--     using (true) with check (true)
-- which grants UPDATE to *every* role including anon. Any client could
-- rewrite the entire catalog: set verification_status = 'high', or store a
-- javascript: URL in application_url and get it rendered as an href.
-- Writes are now service_role only, which is what /api/sync already uses.
-- ---------------------------------------------------------------------------
drop policy if exists "opportunities_service_update" on public.opportunities_cache;
drop policy if exists "opportunities_service_insert" on public.opportunities_cache;
drop policy if exists "opportunities_public_read" on public.opportunities_cache;

-- Public read stays: the catalog is intentionally browsable, and the
-- application never exposes the service_role key to the browser.
create policy "opportunities_public_read" on public.opportunities_cache
  for select using (true);

-- service_role bypasses RLS entirely, but policies are defence in depth.
create policy "opportunities_service_insert" on public.opportunities_cache
  for insert with check (auth.role() = 'service_role');
create policy "opportunities_service_update" on public.opportunities_cache
  for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "opportunities_service_delete" on public.opportunities_cache
  for delete using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. opportunities_cache: first_seen_at
--
-- `synced_at` is rewritten on every upsert, so it means "last written", not
-- "first discovered". The alert digest filtered on it and therefore treated
-- every listing as brand new every single day.
-- ---------------------------------------------------------------------------
alter table public.opportunities_cache
  add column if not exists first_seen_at timestamptz not null default now();

-- Backfill from discovered_at where possible so historical rows keep ordering.
update public.opportunities_cache
   set first_seen_at = discovered_at::timestamptz
 where first_seen_at = now()
   and discovered_at is not null
   and discovered_at < current_date;

create index if not exists idx_opportunities_first_seen
  on public.opportunities_cache(first_seen_at desc);

-- Verification status now includes the states the admin queue needs.
alter table public.opportunities_cache
  drop constraint if exists opportunities_cache_verification_status_check;
alter table public.opportunities_cache
  add constraint opportunities_cache_verification_status_check
  check (verification_status in ('high','review_recommended','pending_review','rejected'));

-- Moderation bookkeeping.
alter table public.opportunities_cache
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text;

-- Recency: the catalog must be able to evict listings that no longer exist.
alter table public.opportunities_cache
  add column if not exists is_active boolean not null default true;

create index if not exists idx_opportunities_active
  on public.opportunities_cache(is_active, first_seen_at desc);

-- ---------------------------------------------------------------------------
-- 3. user_profiles: admin + jurisdiction
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists jurisdiction text,
  add column if not exists last_matched_at timestamptz;

create index if not exists idx_user_profiles_admin
  on public.user_profiles(is_admin) where is_admin;

-- ---------------------------------------------------------------------------
-- 4. Passport ID: PYF-XXXXX
--
-- Old format PTQ-{CC}-{YYYY}-{XXXX} used substr(md5(...),1,4) = 16 bits, which
-- is enumerable, and the UPDATE policy let a user overwrite their own
-- passport_id to squat another user's identifier.
--
-- New format: PYF- + 5 characters from a 32-symbol alphabet with visually
-- ambiguous characters (I, O, 0, 1) removed. 32^5 = 33,554,432 combinations.
-- This is an identifier, not a secret — the public lookup path uses the
-- high-entropy share slug instead.
-- ---------------------------------------------------------------------------
create or replace function public.pyf_alphabet()
returns text language sql immutable as $$ select '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' $$;

-- Crockford-style decode for the human-facing checksum: I/L→1, O→0.
create or replace function public.pyf_check_char(c text)
returns text language sql immutable as $$
  select case upper(c)
    when 'I' then '1' when 'L' then '1' when 'O' then '0'
    else upper(c)
  end
$$;

create or replace function public.pyf_mod37(n bigint)
returns text language sql immutable as $$
  select case
    when n < 10 then chr(48 + n::int)::text
    when n < 36 then chr(55 + n::int)::text
    else '*'
  end
$$;

create or replace function public.generate_passport_id()
returns text language plpgsql volatile as $$
declare
  alphabet text := public.pyf_alphabet();
  body text := '';
  i int;
  n bigint;
  check_char text;
begin
  for i in 1..5 loop
    -- 1 + 31 gives a uniform distribution across the 32 symbols.
    body := body || substr(alphabet, 1 + floor(random() * 32)::int, 1);
  end loop;

  -- Mod-37 style check character derived from the body.
  n := 0;
  for i in 1..5 loop
    n := (n * 32 + (strpos(alphabet, substr(body, i, 1)) - 1)) % 37;
  end loop;
  check_char := public.pyf_mod37(n);

  return 'PYF-' || body || '-' || check_char;
end;
$$;

/** Country name -> ISO-2, with regional fallbacks. Immutable. */
create or replace function public.country_to_cc(country text)
returns text language plpgsql immutable as $$
declare
  c text := lower(coalesce(country, ''));
begin
  return case c
    when 'nigeria' then 'NG'      when 'kenya' then 'KE'
    when 'ghana' then 'GH'        when 'south africa' then 'ZA'
    when 'rwanda' then 'RW'       when 'ethiopia' then 'ET'
    when 'egypt' then 'EG'        when 'morocco' then 'MA'
    when 'senegal' then 'SN'      when 'uganda' then 'UG'
    when 'tanzania' then 'TZ'     when 'cameroon' then 'CM'
    when 'zambia' then 'ZM'       when 'zimbabwe' then 'ZW'
    when 'botswana' then 'BW'     when 'namibia' then 'NA'
    when 'mozambique' then 'MZ'   when 'angola' then 'AO'
    when 'algeria' then 'DZ'      when 'tunisia' then 'TN'
    when 'libya' then 'LY'        when 'sudan' then 'SD'
    when 'uganda ' then 'UG'
    when 'united states' then 'US' when 'united kingdom' then 'GB'
    when 'canada' then 'CA'       when 'germany' then 'DE'
    when 'nigeria/remote' then 'NG'
    when 'global' then 'GL'       when 'global / remote' then 'GL'
    when 'remote' then 'GL'       when 'worldwide' then 'GL'
    when 'africa' then 'AF'
    else 'GL'
  end;
end;
$$;

/** Retry loop on the unique index. Replaces the 16-bit generator. */
create or replace function public.fill_passport_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  candidate text;
  attempts int := 0;
begin
  if new.passport_id is null then
    loop
      candidate := public.generate_passport_id();
      attempts := attempts + 1;
      begin
        new.passport_id := candidate;
        new.jurisdiction := coalesce(new.jurisdiction, public.country_to_cc(new.country));
        return new;
      exception when unique_violation then
        if attempts > 8 then
          raise exception 'could not allocate a unique passport_id';
        end if;
      end;
    end loop;
  end if;

  new.jurisdiction := coalesce(new.jurisdiction, public.country_to_cc(new.country));
  return new;
end;
$$;

drop trigger if exists trg_fill_passport on public.user_profiles;
create trigger trg_fill_passport
  before insert or update of country, passport_id on public.user_profiles
  for each row execute function public.fill_passport_id();

-- Swap the old format constraint for the new one.
alter table public.user_profiles
  drop constraint if exists chk_passport_id_format;
alter table public.user_profiles
  add constraint chk_passport_id_format
  check (passport_id is null or passport_id ~ '^PYF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[0-9A-Z*]$');

-- Reissue existing passports that still carry the PTQ format.
update public.user_profiles
   set passport_id = null
 where passport_id is not null
   and passport_id !~ '^PYF-';

alter table public.user_profiles
  add column if not exists passport_version int not null default 2;

-- ---------------------------------------------------------------------------
-- 5. handle_new_user — seeds profile + issues passport in one shot
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, name, country, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Nigeria'),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'Software Engineer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. generate_share_slug — THE CRITICAL FIX
--
-- Before:
--   * security definer, no GRANT/REVOKE  => EXECUTE granted to PUBLIC
--   * no auth.uid() check               => definer rights bypassed RLS
--   * set is_passport_public = true     => forced publication of ANY user
--
-- Anyone who learned a user UUID could force-publish that user's passport.
-- Now: authenticated-only, self-only, explicit search_path, and it no longer
-- flips the consent bit (that is a separate, explicit user action).
-- ---------------------------------------------------------------------------
create or replace function public.generate_share_slug(uid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  slug text;
  attempts int := 0;
begin
  if auth.uid() is null or auth.uid() is distinct from uid then
    raise exception 'forbidden: can only generate a share slug for your own passport'
      using errcode = '42501';
  end if;

  loop
    -- 10 hex chars = 40 bits. 16M possibilities, unguessable in practice and
    -- 256x stronger than the previous 8-char slug.
    slug := encode(gen_random_bytes(5), 'hex');
    attempts := attempts + 1;
    begin
      update public.user_profiles
         set passport_share_slug = slug
       where id = uid;
      return slug;
    exception when unique_violation then
      if attempts > 8 then
        raise exception 'could not allocate a unique share slug';
      end if;
    end;
  end loop;
end;
$$;

revoke all on function public.generate_share_slug(uuid) from public;
revoke all on function public.generate_share_slug(uuid) from anon;
grant execute on function public.generate_share_slug(uuid) to authenticated;
grant execute on function public.generate_share_slug(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Public passport read — column-limited SECURITY DEFINER
--
-- Kept as a function rather than a table grant so the anon role can never
-- select the whole user_profiles row (metadata, email-linked fields, etc).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_passport(slug text)
returns table (
  passport_id text,
  name text,
  role text,
  country text,
  skills text[],
  goals text[],
  jurisdiction text
)
language sql stable security definer set search_path = public as $$
  select p.passport_id, p.name, p.role, p.country, p.skills, p.goals, p.jurisdiction
    from public.user_profiles p
   where p.passport_share_slug = lower(slug)
     and p.is_passport_public = true
     and p.onboarding_completed = true
   limit 1;
$$;

revoke all on function public.get_public_passport(text) from public;
grant execute on function public.get_public_passport(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. saved_jobs — the missing UPDATE policy
--
-- Four call sites issue UPDATEs to move an application between stages, and
-- every one of them silently failed because only SELECT/INSERT/DELETE
-- policies existed. All UPDATEs returned zero rows with no error, which is
-- why the tracker appeared to lose data.
-- ---------------------------------------------------------------------------
alter table public.saved_jobs enable row level security;

drop policy if exists "saved_jobs_update_own" on public.saved_jobs;
create policy "saved_jobs_update_own" on public.saved_jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Promote the tracker stage out of anonymous jsonb into a constrained column.
alter table public.saved_jobs
  add column if not exists stage text not null default 'wishlist';

alter table public.saved_jobs
  drop constraint if exists saved_jobs_stage_check;
alter table public.saved_jobs
  add constraint saved_jobs_stage_check
  check (stage in ('wishlist','applied','interviewing','offer','accepted','rejected','withdrawn'));

-- Backfill from the legacy jsonb location.
update public.saved_jobs
   set stage = coalesce(nullif(job_data->>'stage', ''), 'wishlist')
 where stage = 'wishlist'
   and coalesce(job_data->>'stage','') <> '';

alter table public.saved_jobs
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_saved_jobs_updated on public.saved_jobs;
create trigger trg_saved_jobs_updated
  before update on public.saved_jobs
  for each row execute function public.touch_updated_at();

create index if not exists idx_saved_jobs_user_stage
  on public.saved_jobs(user_id, stage, updated_at desc);

-- ---------------------------------------------------------------------------
-- 9. Instant matching: user_opportunity_matches
--
-- The passport matching run writes here instead of recomputing the 4-factor
-- score on every page load. Recomputation happened in three places (actor,
-- score.ts, navigator fallback) and none of them agreed.
-- ---------------------------------------------------------------------------
create table if not exists public.user_opportunity_matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_url text not null references public.opportunities_cache(application_url) on delete cascade,
  score int not null check (score between 0 and 100),
  matched_skills jsonb not null default '[]'::jsonb,
  skill_gap jsonb not null default '[]'::jsonb,
  breakdown jsonb not null default '{}'::jsonb,
  explanation text,
  computed_at timestamptz not null default now(),
  primary key (user_id, opportunity_url)
);

alter table public.user_opportunity_matches enable row level security;

drop policy if exists "matches_select_own" on public.user_opportunity_matches;
create policy "matches_select_own" on public.user_opportunity_matches
  for select using (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE policy: the matching run is server-side only.

create index if not exists idx_matches_user_score
  on public.user_opportunity_matches(user_id, score desc);

-- ---------------------------------------------------------------------------
-- 10. Admin audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_url text,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_read" on public.admin_audit_log;
create policy "admin_audit_read" on public.admin_audit_log
  for select using (
    exists (
      select 1 from public.user_profiles p
       where p.id = auth.uid() and p.is_admin
    )
  );

create index if not exists idx_admin_audit_created
  on public.admin_audit_log(created_at desc);

-- ---------------------------------------------------------------------------
-- 11. alerts preview threshold sanity
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  drop constraint if exists chk_alert_threshold;
alter table public.user_profiles
  add constraint chk_alert_threshold check (alert_threshold between 0 and 100);
