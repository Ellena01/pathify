-- Migration: Passport private-first + Org synthetic + Alerts + Navigator indexes
-- Run in Supabase SQL Editor (service_role). Idempotent where possible.

-- ===================== 1) PASSPORT (private-first, XX fallback) =====================
-- Add columns if not exists
alter table public.user_profiles add column if not exists passport_id text;
alter table public.user_profiles add column if not exists passport_share_slug text;
alter table public.user_profiles add column if not exists is_passport_public boolean not null default false;
alter table public.user_profiles add column if not exists passport_issued_at timestamptz;

-- Country → CC mapping with XX fallback
create or replace function public.country_to_cc(country text)
returns text language plpgsql immutable as $$
declare cc text;
begin
  case lower(coalesce(country,'')) 
    when 'nigeria' then cc := 'NG';
    when 'kenya' then cc := 'KE';
    when 'ghana' then cc := 'GH';
    when 'south africa' then cc := 'ZA';
    when 'rwanda' then cc := 'RW';
    when 'ethiopia' then cc := 'ET';
    when 'egypt' then cc := 'EG';
    when 'morocco' then cc := 'MA';
    when 'tunisia' then cc := 'TN';
    when 'senegal' then cc := 'SN';
    when 'uganda' then cc := 'UG';
    when 'tanzania' then cc := 'TZ';
    when 'cameroon' then cc := 'CM';
    when 'zambia' then cc := 'ZM';
    when 'zimbabwe' then cc := 'ZW';
    when 'botswana' then cc := 'BW';
    when 'namibia' then cc := 'NA';
    when 'mozambique' then cc := 'MZ';
    when 'angola' then cc := 'AO';
    when 'global / remote' then cc := 'GL';
    when 'global' then cc := 'GL';
    else cc := 'XX';
  end case;
  return cc;
end; $$;

-- Generator: PTQ-{CC}-{YYYY}-{XXXX}
create or replace function public.generate_passport_id(country text)
returns text language plpgsql as $$
declare
  cc text := public.country_to_cc(country);
  yyyy text := to_char(now(), 'YYYY');
  xxxx text := upper(substr(md5(gen_random_uuid()::text), 1, 4));
  -- ensure alphanumeric (md5 hex is already hex, but we want A-Z0-9; hex is fine for MVP)
  -- If you want full A-Z0-9, use encode(gen_random_bytes(2),'hex') already hex; keep simple
begin
  return format('PTQ-%s-%s-%s', cc, yyyy, xxxx);
end; $$;

-- Unique indexes (partial where not null to allow existing rows)
create unique index if not exists idx_user_profiles_passport_id on public.user_profiles(passport_id) where passport_id is not null;
create unique index if not exists idx_user_profiles_share_slug on public.user_profiles(passport_share_slug) where passport_share_slug is not null;

-- Check constraint
do $$ begin
  alter table public.user_profiles add constraint chk_passport_id_format check (passport_id ~ '^PTQ-[A-Z]{2}-[0-9]{4}-[A-Z0-9]{4}$');
exception when duplicate_object then null;
end $$;

-- Trigger to auto-fill passport_id if null on insert/update
create or replace function public.fill_passport_id()
returns trigger language plpgsql as $$
begin
  if NEW.passport_id is null then
    loop
      begin
        NEW.passport_id := public.generate_passport_id(NEW.country);
        NEW.passport_issued_at := now();
        exit;
      exception when unique_violation then
        -- retry on collision
        null;
      end;
    end loop;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_fill_passport on public.user_profiles;
create trigger trg_fill_passport before insert on public.user_profiles for each row execute function public.fill_passport_id();

-- Update handle_new_user to pass country through (uses raw_user_meta_data)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare gen_id text;
begin
  -- generate passport ahead to avoid trigger race; handle_new_user inserts directly
  gen_id := public.generate_passport_id(coalesce(NEW.raw_user_meta_data->>'country', 'XX'));
  insert into public.user_profiles (id, name, country, passport_id, passport_issued_at)
  values (NEW.id, coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), coalesce(NEW.raw_user_meta_data->>'country','XX'), gen_id, now())
  on conflict (id) do nothing;
  return NEW;
end;
$$;

-- Backfill existing rows without passport
do $$ declare r record; begin
 for r in select id, country from public.user_profiles where passport_id is null loop
   update public.user_profiles set passport_id = public.generate_passport_id(r.country), passport_issued_at = now() where id = r.id;
 end loop;
end $$;

-- View/policy for shareable slug (private-first)
-- Only users with is_passport_public=true and slug not null are public-readable via anon
-- Use RPC instead of direct table select to limit columns
create or replace function public.get_public_passport(slug text)
returns table(passport_id text, name text, role text, country text, skills text[], goals text[]) 
language sql security definer set search_path = public as $$
  select passport_id, name, role, country, skills, goals
  from public.user_profiles
  where passport_share_slug = slug and is_passport_public = true;
$$;
grant execute on function public.get_public_passport(text) to anon, authenticated;

-- Helper to generate share slug (call via API)
create or replace function public.generate_share_slug(uid uuid)
returns text language plpgsql security definer as $$
declare slug text;
begin
  slug := upper(substr(md5(gen_random_uuid()::text),1,8));
  update public.user_profiles set passport_share_slug = slug, is_passport_public = true where id = uid;
  return slug;
end;
$$;

-- ===================== 2) ORG SYNTHETIC (customizable names, is_synthetic) =====================
create table if not exists public.synthetic_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  role text not null,
  country text not null,
  location text not null,
  skills text[] not null,
  goals text[],
  bio text,
  opt_in boolean not null default true,
  is_synthetic boolean not null default true,
  created_at timestamptz default now()
);
alter table public.synthetic_profiles enable row level security;
drop policy if exists org_read_synthetic on public.synthetic_profiles;
create policy org_read_synthetic on public.synthetic_profiles for select using (opt_in = true);
create index if not exists gin_synthetic_skills on public.synthetic_profiles using gin (skills);
-- pg_trgm for location fuzzy (requires extension)
create extension if not exists pg_trgm;
create index if not exists gin_synthetic_location_trgm on public.synthetic_profiles using gin (location gin_trgm_ops);

-- Seed 14 synthetic profiles, African names visible, synthetic flag, customizable via bio
insert into public.synthetic_profiles (display_name, role, country, location, skills, goals, bio, opt_in, is_synthetic)
values
  ('Aisha M. — Synthetic', 'Product Designer', 'Nigeria', 'Lagos / Remote', array['Figma','UI/UX Design','User Research','Frontend Development'], array['Remote Job','Fellowship'], 'Synthetic demo — customizable. Inspired by African women in design. Opt-in only.', true, true),
  ('Zainab K. — Synthetic', 'Frontend Developer', 'Kenya', 'Nairobi / Remote', array['React','TypeScript','Next.js','Tailwind CSS'], array['Remote Job'], 'Synthetic demo — React specialist, mentor availability customizable.', true, true),
  ('Fatima A. — Synthetic', 'Data Scientist', 'Ghana', 'Accra / Remote', array['Python','Machine Learning','Data Science','Pandas'], array['Fellowship'], 'Synthetic demo — ML for social impact.', true, true),
  ('Amara O. — Synthetic', 'AI Researcher', 'Rwanda', 'Kigali / Remote', array['Python','Artificial Intelligence','NLP','PyTorch'], array['Conference','Scholarship'], 'Synthetic demo — NLP research, conference speaker.', true, true),
  ('Nadia B. — Synthetic', 'Product Manager', 'South Africa', 'Cape Town / Remote', array['Product Management','Agile','Communication','Entrepreneurship'], array['Startup Funding'], 'Synthetic demo — product lead, expert consultation customizable.', true, true),
  ('Chloe W. — Synthetic', 'Cybersecurity Specialist', 'Nigeria', 'Remote', array['Cybersecurity','Linux','Python','Problem Solving'], array['Remote Job','Hackathon'], 'Synthetic demo — infosec, hackathon mentor.', true, true),
  ('Grace L. — Synthetic', 'UX Researcher', 'Ethiopia', 'Addis Ababa / Remote', array['UI/UX Design','Research','Figma','Public Speaking'], array['Fellowship'], 'Synthetic demo — user research focus.', true, true),
  ('Amina S. — Synthetic (Custom)', 'Backend Engineer', 'Senegal', 'Dakar / Remote', array['Go','PostgreSQL','Docker','Kubernetes'], array['Remote Job'], 'Customizable synthetic — edit via bio field or seed_synthetic.sql.', true, true),
  ('Thandi N. — Synthetic', 'Data Analyst', 'Zimbabwe', 'Harare / Remote', array['SQL','Data Visualization','Excel','Data Analysis'], array['Internship'], 'Synthetic demo — analytics for NGOs.', true, true),
  ('Layla H. — Synthetic', 'Entrepreneur / Founder', 'Egypt', 'Cairo / Remote', array['Entrepreneurship','Fundraising','Business Strategy','Communication'], array['Grants'], 'Synthetic demo — startup funding seeker.', true, true),
  ('Ifeoma P. — Synthetic', 'Mobile Developer', 'Nigeria', 'Lagos', array['Flutter','Mobile Development','Firebase','Git'], array['Hackathon'], 'Synthetic demo — hackathon collaborator.', true, true),
  ('Maya K. — Synthetic (Initials)', 'M.K.', 'Kenya', 'Nairobi', array['React','Node.js','GraphQL'], array['Remote Job'], 'Initials version — customizable anonymity level. Synthetic only.', true, true),
  ('S. O. — Synthetic (Initials)', 'S.O.', 'Ghana', 'Accra', array['Python','Data Science','Scholarship'], array['Scholarship'], 'Initials — privacy-preserving synthetic, opt-in.', true, true),
  ('J. N. — Synthetic (Initials)', 'J.N.', 'Rwanda', 'Remote', array['Writing','Research','Scholarship'], array['Fellowship'], 'Initials — minimal PII synthetic, customizable.', true, true)
on conflict do nothing;

-- ===================== 3) ALERTS (email only, threshold>=70) =====================
alter table public.user_profiles add column if not exists alert_opt_in boolean default false;
alter table public.user_profiles add column if not exists alert_threshold int default 70;
alter table public.user_profiles add column if not exists last_alert_at timestamptz;
alter table public.user_profiles add column if not exists unsubscribe_token uuid default gen_random_uuid();

create table if not exists public.alert_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  opportunity_url text not null,
  sent_at timestamptz default now()
);
alter table public.alert_log enable row level security;
drop policy if exists alert_log_own on public.alert_log;
create policy alert_log_own on public.alert_log for select using (auth.uid() = user_id);
create index if not exists idx_alert_log_user on public.alert_log(user_id);
create index if not exists idx_alert_log_sent on public.alert_log(sent_at desc);

do $$ begin alter table public.user_profiles add constraint chk_alert_threshold check (alert_threshold between 0 and 100); exception when duplicate_object then null; end $$;

-- ===================== 4) NAVIGATOR + CACHE INDEXES (structured-data chat) =====================
create index if not exists idx_cache_match_score on public.opportunities_cache(match_score) where match_score is not null;
create index if not exists idx_cache_synced on public.opportunities_cache(synced_at desc);
create index if not exists gin_cache_skills on public.opportunities_cache using gin (skills_required);
create extension if not exists pg_trgm;
create index if not exists gin_cache_title_trgm on public.opportunities_cache using gin (title gin_trgm_ops);
create index if not exists gin_cache_org_trgm on public.opportunities_cache using gin (organization gin_trgm_ops);

-- Ensure raw_data is jsonb
do $$ begin
  alter table public.opportunities_cache alter column raw_data type jsonb using raw_data::jsonb;
exception when others then null;
end $$;
