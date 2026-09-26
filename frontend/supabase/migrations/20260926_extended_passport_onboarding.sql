-- Migration: Canonical Extended Passport Metadata & Onboarding Flag
-- Safe and non-destructive: keeps existing columns and data intact.

-- 1. Add metadata JSONB column for structured extended fields
alter table public.user_profiles add column if not exists metadata jsonb not null default '{
  "education": {
    "institution": "",
    "program": "",
    "field": "",
    "level": "",
    "graduationYear": ""
  },
  "experience": [],
  "projects": [],
  "certifications": [],
  "preferences": {
    "workMode": [],
    "locations": [],
    "opportunityTypes": []
  },
  "interests": []
}'::jsonb;

-- 2. Add onboarding completion flag
alter table public.user_profiles add column if not exists onboarding_completed boolean not null default false;

-- 3. Add index on onboarding status
create index if not exists idx_user_profiles_onboarding on public.user_profiles(onboarding_completed);
