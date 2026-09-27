-- ============================================================================
-- Pathify migration — 20260928_two_universes_connections.sql
--
-- The two-universe release. Adds the storage half of:
--   1. account_type      — individual vs organization/investor, enforced at
--                          signup, in middleware and in the route groups
--   2. organization columns — org name, site, focus, skills, geo
--   3. connections       — the org <-> talent graph, with label authority in
--                          the database rather than the client
--   4. outreach_messages — the thread that grows out of an accepted connection
--   5. a baseline seed of opportunities_cache so a brand-new database is never
--      an empty feed (zero empty states is a product requirement, not a nicety)
--
-- Why a database-owned label on `connections`
-- --------------------------------------------
-- The row stores both sides' display names. Letting the client write them
-- means one user can invent who the other side is, and both sides would see
-- that fabrication. `connections_fill_labels()` is SECURITY DEFINER and reads
-- `user_profiles` at insert/update time, so the names are facts about accounts
-- rather than claims from a request body.
--
-- Why the seed is `registry` rows
-- -------------------------------
-- `source_platform = 'registry'` already exists (20260927) and is the honest
-- provenance for rows that did not come from a crawl. They are index pages of
-- long-lived boards and programmes, not scraped listings, so
-- `verification_status = 'review_recommended'` (not `high`) and `deadline`
-- stays NULL rather than an invented date.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. user_profiles: which universe does this account belong to?
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists account_type text not null default 'individual',
  add column if not exists org_name text,
  add column if not exists org_website text,
  add column if not exists org_focus text[] not null default '{}'::text[],
  add column if not exists org_skills text[] not null default '{}'::text[],
  add column if not exists org_geo text[] not null default '{}'::text[];

alter table public.user_profiles
  drop constraint if exists chk_user_profiles_account_type;
alter table public.user_profiles
  add constraint chk_user_profiles_account_type
  check (account_type in ('individual', 'organization', 'investor'));

-- The marketplace queries the org side; the individual side is the default and
-- is far larger, so only the minority branch is indexed.
create index if not exists idx_user_profiles_org_accounts
  on public.user_profiles(account_type, onboarding_completed)
  where account_type <> 'individual';

-- ---------------------------------------------------------------------------
-- 2. Passport IDs are a talent credential — organisations do not get one
--
-- `trg_fill_passport` fires on INSERT for every profile, so without this an
-- organisation would be issued a PYF-… talent passport and could publish it as
-- if it were a person. jurisdiction is still derived, because nothing else
-- does it and the column is used for regional grouping.
-- ---------------------------------------------------------------------------
create or replace function public.fill_passport_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  candidate text;
  attempts int := 0;
begin
  new.jurisdiction := coalesce(new.jurisdiction, public.country_to_cc(new.country));

  if new.account_type is distinct from 'individual' then
    new.passport_id := null;
    return new;
  end if;

  if new.passport_id is null then
    loop
      candidate := public.generate_passport_id();
      attempts := attempts + 1;
      begin
        new.passport_id := candidate;
        return new;
      exception when unique_violation then
        if attempts > 8 then
          raise exception 'could not allocate a unique passport_id';
        end if;
      end;
    end loop;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user — carry account_type from the signup metadata
--
-- `raw_user_meta_data` is written by the client, so it is validated against the
-- same check constraint vocabulary: anything unrecognised becomes
-- 'individual', which is the safe default (it unlocks the individual universe
-- and nothing else). An invalid value must not abort the whole auth insert.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_account text;
  v_is_org boolean;
begin
  v_account := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'account_type'), ''), 'individual');
  v_account := lower(v_account);
  if v_account not in ('individual', 'organization', 'investor') then
    v_account := 'individual';
  end if;
  v_is_org := v_account <> 'individual';

  insert into public.user_profiles (id, name, country, role, account_type, org_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'country', ''), case when v_is_org then 'Global' else 'Nigeria' end),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', ''),
      case when v_is_org then 'Hiring organization' else 'Software Engineer' end
    ),
    v_account,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'org_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. connections — the org <-> talent relationship
--
-- `message` is the intro the requester attaches. Labels are overwritten by the
-- trigger below; `recipient_passport_id` is denormalised so a talent user can
-- see which passport asked without a cross-profile read (RLS forbids that by
-- design, and the alternative would be a service-role round trip per row).
-- ---------------------------------------------------------------------------
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_label text not null default 'Pathify user',
  requester_account_type text not null default 'individual',
  recipient_id uuid not null references auth.users(id) on delete cascade,
  recipient_label text not null default 'Pathify user',
  recipient_passport_id text,
  status text not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  -- A person cannot connect to themselves in either direction.
  constraint chk_connections_distinct check (requester_id <> recipient_id),
  constraint chk_connections_status check (status in ('pending', 'accepted', 'declined')),
  constraint chk_connections_message check (message is null or char_length(message) <= 1000)
);

-- One open relationship per pair, regardless of who asked first. The index is
-- partial so a declined pair may ask again later; history is kept, deadlock
-- ("you already have a request") is not.
create unique index if not exists uq_connections_open_pair
  on public.connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending', 'accepted');

create index if not exists idx_connections_recipient_status
  on public.connections(recipient_id, status, created_at desc);
create index if not exists idx_connections_requester
  on public.connections(requester_id, created_at desc);

alter table public.connections enable row level security;

drop policy if exists "connections_select_participants" on public.connections;
drop policy if exists "connections_insert_own" on public.connections;
drop policy if exists "connections_update_recipient" on public.connections;
drop policy if exists "connections_delete_requester" on public.connections;

-- Either side may read the thread of their own relationship.
create policy "connections_select_participants" on public.connections
  for select using (auth.uid() in (requester_id, recipient_id));

-- Only the requester may create it, and the labels are rewritten server-side.
create policy "connections_insert_own" on public.connections
  for insert with check (auth.uid() = requester_id);

-- Only the recipient may accept or decline, and may not rewrite the other side
-- (the WITH CHECK re-requires recipient_id = auth.uid() on the new row).
create policy "connections_update_recipient" on public.connections
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- The requester may withdraw their own request (or, once declined, clean it up).
create policy "connections_delete_requester" on public.connections
  for delete using (auth.uid() = requester_id);

drop trigger if exists trg_connections_updated on public.connections;
create trigger trg_connections_updated
  before update on public.connections
  for each row execute function public.touch_updated_at();

/** Timestamp the response the moment a decision lands. */
create or replace function public.touch_connection_response()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connections_responded on public.connections;
create trigger trg_connections_responded
  before update of status on public.connections
  for each row execute function public.touch_connection_response();

-- Label authority: both sides' display names are read from user_profiles by
-- the definer, so a request body can never claim to be someone else.
create or replace function public.connections_fill_labels()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_req_name text;
  v_req_account text;
  v_rec_name text;
  v_rec_passport text;
begin
  select coalesce(nullif(p.name, ''), 'Pathify user'), p.account_type
    into v_req_name, v_req_account
    from public.user_profiles p
   where p.id = new.requester_id;

  select coalesce(nullif(p.name, ''), 'Pathify user'), p.passport_id
    into v_rec_name, v_rec_passport
    from public.user_profiles p
   where p.id = new.recipient_id;

  new.requester_label := coalesce(v_req_name, 'Pathify user');
  new.requester_account_type := coalesce(v_req_account, 'individual');
  new.recipient_label := coalesce(v_rec_name, 'Pathify user');
  new.recipient_passport_id := v_rec_passport;
  return new;
end;
$$;

drop trigger if exists trg_connections_fill_labels on public.connections;
create trigger trg_connections_fill_labels
  before insert on public.connections
  for each row execute function public.connections_fill_labels();

-- Parties are frozen after insert. The UPDATE policy lets the recipient write
-- the row, and RLS cannot say "same value as before", so without this the
-- recipient could reassign requester_id to a third party and forge a request
-- that appears to come from that account.
create or replace function public.connections_freeze_parties()
returns trigger language plpgsql as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.recipient_id is distinct from old.recipient_id then
    raise exception 'connection parties cannot be reassigned'
      using errcode = '55000',
            hint = 'Withdraw the request and send a new one.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_connections_freeze_parties on public.connections;
create trigger trg_connections_freeze_parties
  before update of requester_id, recipient_id on public.connections
  for each row execute function public.connections_freeze_parties();

-- ---------------------------------------------------------------------------
-- 5. outreach_messages — the conversation on an accepted connection
--
-- Immutable by omission: there is no UPDATE policy, so neither party can edit
-- history after the fact. Only participants can read or append.
-- ---------------------------------------------------------------------------
create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chk_outreach_body check (char_length(body) between 1 and 4000)
);

create index if not exists idx_outreach_connection
  on public.outreach_messages(connection_id, created_at);

alter table public.outreach_messages enable row level security;

drop policy if exists "outreach_select_participants" on public.outreach_messages;
drop policy if exists "outreach_insert_participant" on public.outreach_messages;
drop policy if exists "outreach_delete_own" on public.outreach_messages;

create policy "outreach_select_participants" on public.outreach_messages
  for select using (
    exists (
      select 1 from public.connections c
       where c.id = connection_id
         and auth.uid() in (c.requester_id, c.recipient_id)
    )
  );

create policy "outreach_insert_participant" on public.outreach_messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.connections c
       where c.id = connection_id
         and auth.uid() in (c.requester_id, c.recipient_id)
    )
  );

create policy "outreach_delete_own" on public.outreach_messages
  for delete using (auth.uid() = sender_id);

-- ---------------------------------------------------------------------------
-- 6. Baseline seed — the catalog is never empty
--
-- A freshly provisioned database has no opportunities_cache rows until the
-- actor runs, so every dashboard, feed and match run would show nothing and
-- there would be no way to tell "not synced yet" from "no matches for you".
-- These are index pages of long-lived boards and programmes — real
-- destinations a user can actually open — not fabricated job rows.
--
-- `on conflict do nothing` keeps this re-runnable without clobbering anything
-- a live sync has since written at the same URL.
-- ---------------------------------------------------------------------------
insert into public.opportunities_cache (
  application_url, title, organization, location, opportunity_type,
  skills_required, verification_status, description, source_domain,
  source_platform, is_active, first_seen_at
)
values
  -- Remote and global job boards ------------------------------------------
  ('https://weworkremotely.com/categories/remote-programming-jobs',
   'Remote programming roles', 'We Work Remotely', 'Remote / Global', 'jobs_remote',
   '["Web Development","TypeScript","React"]'::jsonb, 'review_recommended',
   'Baseline entry: index of current remote engineering roles. Refreshed when live feeds sync.',
   'weworkremotely.com', 'registry', true, now()),

  ('https://remoteok.com/', 'Remote jobs across every stack', 'Remote OK', 'Remote / Global', 'jobs_remote',
   '["Web Development","JavaScript","Python"]'::jsonb, 'review_recommended',
   'Baseline entry: index of current remote roles. Refreshed when live feeds sync.',
   'remoteok.com', 'registry', true, now()),

  ('https://jobs.ashbyhq.com/', 'Startups hiring now', 'Ashby', 'Remote / Global', 'jobs_remote',
   '["Product Management","Data Analysis","Project Management"]'::jsonb, 'review_recommended',
   'Baseline entry: startup job board. Refreshed when live feeds sync.',
   'ashbyhq.com', 'registry', true, now()),

  ('https://www.workatastartup.com/', 'Startup roles from YC companies', 'Work at a Startup', 'Remote / Global', 'jobs_remote',
   '["Web Development","Product Management","Artificial Intelligence"]'::jsonb, 'review_recommended',
   'Baseline entry: Y Combinator company job index. Refreshed when live feeds sync.',
   'workatastartup.com', 'registry', true, now()),

  ('https://www.ycombinator.com/jobs', 'Roles at Y Combinator companies', 'Y Combinator', 'San Francisco / Remote', 'jobs_remote',
   '["Web Development","Artificial Intelligence","Entrepreneurship"]'::jsonb, 'review_recommended',
   'Baseline entry: YC job board. Refreshed when live feeds sync.',
   'ycombinator.com', 'registry', true, now()),

  ('https://wellfound.com/jobs', 'Startup and scale-up roles', 'Wellfound', 'Remote / Global', 'jobs_remote',
   '["Web Development","Product Management","Marketing"]'::jsonb, 'review_recommended',
   'Baseline entry: startup job board. Refreshed when live feeds sync.',
   'wellfound.com', 'registry', true, now()),

  ('https://andela.com/', 'Global engineering talent network', 'Andela', 'Remote / Global', 'jobs_remote',
   '["Web Development","Cloud Computing","Mobile Development"]'::jsonb, 'review_recommended',
   'Baseline entry: talent network placements. Refreshed when live feeds sync.',
   'andela.com', 'registry', true, now()),

  ('https://careers.turing.com/', 'Remote engineering roles', 'Turing', 'Remote / Global', 'jobs_remote',
   '["Python","Web Development","React"]'::jsonb, 'review_recommended',
   'Baseline entry: remote talent platform. Refreshed when live feeds sync.',
   'turing.com', 'registry', true, now()),

  -- African job boards -----------------------------------------------------
  ('https://www.jobberman.com/', 'Roles across Nigeria''s employers', 'Jobberman', 'Lagos, Nigeria', 'jobs_onsite',
   '["Communication","Project Management","Web Development"]'::jsonb, 'review_recommended',
   'Baseline entry: Nigerian job board. Refreshed when live feeds sync.',
   'jobberman.com', 'registry', true, now()),

  ('https://www.myjobmag.com/', 'Roles across Kenya''s employers', 'MyJobMag', 'Nairobi, Kenya', 'jobs_hybrid',
   '["Communication","Data Analysis","Sales"]'::jsonb, 'review_recommended',
   'Baseline entry: Kenyan job board. Refreshed when live feeds sync.',
   'myjobmag.com', 'registry', true, now()),

  ('https://www.fuzu.com/', 'Career development and jobs in East Africa', 'Fuzu', 'Nairobi, Kenya', 'jobs_hybrid',
   '["Communication","Project Management","Marketing"]'::jsonb, 'review_recommended',
   'Baseline entry: East African job board. Refreshed when live feeds sync.',
   'fuzu.com', 'registry', true, now()),

  ('https://www.pnet.co.za/', 'Roles across South Africa''s employers', 'Pnet', 'Johannesburg, South Africa', 'jobs_onsite',
   '["Data Analysis","Sales","Project Management"]'::jsonb, 'review_recommended',
   'Baseline entry: South African job board. Refreshed when live feeds sync.',
   'pnet.co.za', 'registry', true, now()),

  ('https://www.careers24.com/', 'Roles across South Africa''s employers', 'Careers24', 'Cape Town, South Africa', 'jobs_onsite',
   '["Communication","Data Analysis","Sales"]'::jsonb, 'review_recommended',
   'Baseline entry: South African job board. Refreshed when live feeds sync.',
   'careers24.com', 'registry', true, now()),

  ('https://welcometothejungle.com/en', 'Tech roles across Europe and Africa', 'Welcome to the Jungle', 'Paris, France', 'jobs_hybrid',
   '["Web Development","Product Management","UI/UX Design"]'::jsonb, 'review_recommended',
   'Baseline entry: European tech job board. Refreshed when live feeds sync.',
   'welcometothejungle.com', 'registry', true, now()),

  -- Internships and early career ------------------------------------------
  ('https://www.aiesec.org/', 'Global volunteer and internship exchanges', 'AIESEC', 'Global', 'internships',
   '["Leadership","Communication","Volunteering"]'::jsonb, 'review_recommended',
   'Baseline entry: international youth exchange programmes. Refreshed when live feeds sync.',
   'aiesec.org', 'registry', true, now()),

  ('https://www.alxafrica.com/', 'Pan-African tech programmes and placements', 'ALX Africa', 'Lagos / Nairobi / Addis Ababa', 'internships',
   '["Web Development","Leadership","Communication"]'::jsonb, 'review_recommended',
   'Baseline entry: African training and placement programmes. Refreshed when live feeds sync.',
   'alxafrica.com', 'registry', true, now()),

  ('https://www.moringaschool.com/', 'Bootcamp placements in Nigeria and Kenya', 'Moringa School', 'Nigeria / Kenya', 'internships',
   '["Web Development","Data Science","Communication"]'::jsonb, 'review_recommended',
   'Baseline entry: bootcamp with employer placements. Refreshed when live feeds sync.',
   'moringaschool.com', 'registry', true, now()),

  -- Fellowships and scholarships ------------------------------------------
  ('https://www.mandela-washington.com/', 'Mandela Washington Fellowship', 'Mandela Washington Fellowship', 'United States / Africa', 'fellowships',
   '["Leadership","Public Speaking","Networking"]'::jsonb, 'review_recommended',
   'Baseline entry: YALI leadership fellowship. Refreshed when live feeds sync.',
   'mandela-washington.com', 'registry', true, now()),

  ('https://chevening.org/', 'Chevening Scholarships', 'Chevening', 'United Kingdom', 'fellowships',
   '["Leadership","Networking","Writing"]'::jsonb, 'review_recommended',
   'Baseline entry: UK government scholarship. Refreshed when live feeds sync.',
   'chevening.org', 'registry', true, now()),

  ('https://commonwealthscholarships.org/', 'Commonwealth Scholarships', 'Commonwealth Scholarship Commission', 'United Kingdom', 'scholarships',
   '["Scholarship","Research","Writing"]'::jsonb, 'review_recommended',
   'Baseline entry: Commonwealth funding. Refreshed when live feeds sync.',
   'commonwealthscholarships.org', 'registry', true, now()),

  ('https://mastercardfdn.org/', 'Scholarships for young Africans', 'Mastercard Foundation', 'Africa', 'scholarships',
   '["Scholarship","Leadership","Mentorship"]'::jsonb, 'review_recommended',
   'Baseline entry: Mastercard Foundation education programmes. Refreshed when live feeds sync.',
   'mastercardfdn.org', 'registry', true, now()),

  ('https://www.fulbrightprogram.org/', 'Fulbright foreign student programme', 'Fulbright', 'United States', 'scholarships',
   '["Scholarship","Research","Public Speaking"]'::jsonb, 'review_recommended',
   'Baseline entry: Fulbright programme index. Refreshed when live feeds sync.',
   'fulbrightprogram.org', 'registry', true, now()),

  ('https://www.daad.de/en/', 'Study and research funding in Germany', 'DAAD', 'Germany', 'scholarships',
   '["Scholarship","Research","Networking"]'::jsonb, 'review_recommended',
   'Baseline entry: German academic exchange funding. Refreshed when live feeds sync.',
   'daad.de', 'registry', true, now()),

  -- Grants and research funding -------------------------------------------
  ('https://cordis.europa.eu/', 'EU research and innovation grants', 'CORDIS', 'Brussels, Belgium', 'grants',
   '["Research","Data Analysis","Writing"]'::jsonb, 'review_recommended',
   'Baseline entry: EU project funding index. Refreshed when live feeds sync.',
   'cordis.europa.eu', 'registry', true, now()),

  ('https://eit.europa.eu/', 'EIT innovation and entrepreneurship funding', 'European Institute of Innovation and Technology', 'Europe', 'grants',
   '["Entrepreneurship","Business Strategy","Project Management"]'::jsonb, 'review_recommended',
   'Baseline entry: EIT programme index. Refreshed when live feeds sync.',
   'eit.europa.eu', 'registry', true, now()),

  ('https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home', 'EU funding and tenders opportunities', 'European Commission', 'Europe', 'grants',
   '["Research","Business Strategy","Grant Writing"]'::jsonb, 'review_recommended',
   'Baseline entry: EU funding portal. Refreshed when live feeds sync.',
   'ec.europa.eu', 'registry', true, now()),

  -- Startup funding ---------------------------------------------------------
  ('https://www.techstars.com/', 'Accelerator programmes and founder funding', 'Techstars', 'Global / Remote', 'startup_funding',
   '["Entrepreneurship","Fundraising","Leadership"]'::jsonb, 'review_recommended',
   'Baseline entry: accelerator index. Refreshed when live feeds sync.',
   'techstars.com', 'registry', true, now()),

  ('https://500.co/', 'Seed and Series A capital', '500 Global', 'Global / Remote', 'startup_funding',
   '["Entrepreneurship","Finance","Fundraising"]'::jsonb, 'review_recommended',
   'Baseline entry: venture capital index. Refreshed when live feeds sync.',
   '500.co', 'registry', true, now()),

  ('https://partechpartners.com/', 'Venture capital for African startups', 'Partech Africa', 'Lagos / Nairobi / Dakar', 'startup_funding',
   '["Entrepreneurship","Finance","Business Strategy"]'::jsonb, 'review_recommended',
   'Baseline entry: Africa-focused VC index. Refreshed when live feeds sync.',
   'partechpartners.com', 'registry', true, now()),

  ('https://www.ifc.org/', 'Investment and advisory for emerging markets', 'IFC', 'Global', 'startup_funding',
   '["Finance","Business Strategy","Entrepreneurship"]'::jsonb, 'review_recommended',
   'Baseline entry: IFC programmes. Refreshed when live feeds sync.',
   'ifc.org', 'registry', true, now()),

  -- Hackathons and competitions --------------------------------------------
  ('https://devpost.com/hackathons', 'Open hackathons', 'Devpost', 'Global / Online', 'hackathons',
   '["Hackathon","Web Development","Git"]'::jsonb, 'review_recommended',
   'Baseline entry: hackathon index. Refreshed when live feeds sync.',
   'devpost.com', 'registry', true, now()),

  ('https://mlh.io/seasons', 'Major League Hacking seasons', 'Major League Hacking', 'Global / Online', 'hackathons',
   '["Hackathon","JavaScript","Git"]'::jsonb, 'review_recommended',
   'Baseline entry: student hackathon league. Refreshed when live feeds sync.',
   'mlh.io', 'registry', true, now()),

  ('https://www.kaggle.com/competitions', 'Data science competitions', 'Kaggle', 'Global / Online', 'hackathons',
   '["Data Science","Machine Learning","Python"]'::jsonb, 'review_recommended',
   'Baseline entry: competition index. Refreshed when live feeds sync.',
   'kaggle.com', 'registry', true, now()),

  ('https://dorahacks.io/', 'Web3 and open-source bounties', 'DoraHacks', 'Global / Online', 'hackathons',
   '["Blockchain","Go","Open Source"]'::jsonb, 'review_recommended',
   'Baseline entry: hackathon and bounty index. Refreshed when live feeds sync.',
   'dorahacks.io', 'registry', true, now()),

  -- Conferences and events --------------------------------------------------
  ('https://websummit.com/', 'Web Summit', 'Web Summit', 'Lisbon, Portugal', 'conferences',
   '["Networking","Public Speaking","Entrepreneurship"]'::jsonb, 'review_recommended',
   'Baseline entry: conference index. Refreshed when live feeds sync.',
   'websummit.com', 'registry', true, now()),

  ('https://www.wearedevelopers.com/', 'We Are Developers Congress', 'We Are Developers', 'Berlin, Germany', 'conferences',
   '["Web Development","Networking","Machine Learning"]'::jsonb, 'review_recommended',
   'Baseline entry: developer conference index. Refreshed when live feeds sync.',
   'wearedevelopers.com', 'registry', true, now()),

  ('https://techcrunch.com/events/', 'TechCrunch events', 'TechCrunch', 'San Francisco / Online', 'events',
   '["Entrepreneurship","Networking","Public Speaking"]'::jsonb, 'review_recommended',
   'Baseline entry: startup event index. Refreshed when live feeds sync.',
   'techcrunch.com', 'registry', true, now()),

  ('https://www.meetup.com/', 'Local tech meetups', 'Meetup', 'Global', 'events',
   '["Networking","Mentorship","Communication"]'::jsonb, 'review_recommended',
   'Baseline entry: community event index. Refreshed when live feeds sync.',
   'meetup.com', 'registry', true, now())
on conflict (application_url) do nothing;


-- ---------------------------------------------------------------------------
-- GIN index for the broadening ladder.
--
-- lib/match-candidates.ts runs `skills_required @> '["X"]'` style containment
-- probes for up to 11 skill rungs per profile. On a JSONB column without an
-- index that is a sequential scan over the whole catalog on every
-- POST /api/match. jsonb_path_ops keeps the index smaller than the default
-- opclass because it only supports @> / ?, which is all the ladder uses.
-- ---------------------------------------------------------------------------

create index if not exists idx_opportunities_skills_required
  on public.opportunities_cache using gin (skills_required jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Orgs never receive a passport ID.
--
-- fill_passport_id() refuses to mint one for a non-individual, but rows that
-- existed before the split (or were written by an older client) can still
-- carry one, and /api/passport would happily return it. A "PYF-..." credential
-- on an organization profile invites the exact confusion the two-universe split
-- exists to prevent: treating a fund as a person. Null them once, here.
-- ---------------------------------------------------------------------------

update public.user_profiles
   set passport_id = null,
       passport_issued_at = null
 where account_type <> 'individual'
   and (passport_id is not null or passport_issued_at is not null);
