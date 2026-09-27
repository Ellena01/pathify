'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, ExternalLink, Globe, Loader2, Plus, Search, X } from 'lucide-react';

import { PageHeader } from '@/components/layout/PageHeader';
import { useUserStore } from '@/app/store';
import { useProfileAutosave } from '@/app/hooks/useAutosave';
import { ORG_FOCUS_AREAS, ORG_GEOS } from '@/lib/org-options';
import { searchSkills, normalizeSkill, SKILL_COUNT } from '@/lib/taxonomy';
import { sanitizeExternalUrl } from '@/lib/security';

/**
 * /org/settings — the organization profile.
 *
 * Written explicitly rather than autosaved on every keystroke: this is the one
 * form where a half-typed company name or a malformed URL would be visible to
 * talent the moment they open a directory card, so it validates first and
 * writes once.
 *
 * `org_skills` is the field that matters most. The marketplace ranks by
 * `calculateWeightedMatch(org_skills, candidate.skills)`, and both sides are
 * canonicalised through the taxonomy — a skill outside the 96 would be accepted
 * here and then contribute nothing to the ranking, which is why the picker only
 * offers canonical names.
 */

const CARD = 'rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl';
const FIELD_CLASS =
  'h-11 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20';

const CHIP_OFF = 'border-white/10 bg-white/[0.04] text-[#C8C8D0] hover:border-white/20 hover:text-white';
const CHIP_ON = 'border-violet-500/50 bg-violet-500/15 text-violet-100';

export default function OrgSettingsPage() {
  const { org_name, org_website, org_focus, org_skills, org_geo, account_type } = useUserStore();
  const { saveImmediately, status } = useProfileAutosave();

  // The form is "store value until edited", not "seed an effect". A hydrate
  // effect that writes five states synchronously would re-render the page it
  // is rendering (react-hooks/set-state-in-effect), and it would also clobber
  // anything typed while the profile request was still in flight. Reading
  // through an override makes hydration invisible and keeps one source of
  // truth for the pristine value: the store.
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [websiteOverride, setWebsiteOverride] = useState<string | null>(null);
  const [focusOverride, setFocusOverride] = useState<string[] | null>(null);
  const [skillsOverride, setSkillsOverride] = useState<string[] | null>(null);
  const [geoOverride, setGeoOverride] = useState<string[] | null>(null);

  const [skillQuery, setSkillQuery] = useState('');
  const [geoDraft, setGeoDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const name = nameOverride ?? org_name ?? '';
  const website = websiteOverride ?? org_website ?? '';
  const focus = focusOverride ?? (Array.isArray(org_focus) ? org_focus : []);
  const skills = skillsOverride ?? (Array.isArray(org_skills) ? org_skills : []);
  const geo = geoOverride ?? (Array.isArray(org_geo) ? org_geo : []);

  const skillSuggestions = useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    if (!query) return [];
    return searchSkills(query, 8).filter((option) => !skills.includes(option));
  }, [skillQuery, skills]);

  const dirty = useMemo(
    () =>
      name !== (org_name ?? '') ||
      website !== (org_website ?? '') ||
      focus.join(' ') !== (org_focus ?? []).join(' ') ||
      skills.join(' ') !== (org_skills ?? []).join(' ') ||
      geo.join(' ') !== (org_geo ?? []).join(' '),
    [name, website, focus, skills, geo, org_name, org_website, org_focus, org_skills, org_geo]
  );

  const isPresetRegion = useCallback(
    (region: string) => (ORG_GEOS as readonly string[]).includes(region),
    []
  );

  const toggleFocus = useCallback(
    (value: string) =>
      setFocusOverride(
        focus.includes(value) ? focus.filter((item) => item !== value) : [...focus, value]
      ),
    [focus]
  );

  const toggleRegion = useCallback(
    (value: string) =>
      setGeoOverride(geo.includes(value) ? geo.filter((item) => item !== value) : [...geo, value]),
    [geo]
  );

  const addSkill = useCallback(
    (raw: string) => {
      const canonical = normalizeSkill(raw);
      if (!canonical || skills.includes(canonical)) return;
      setSkillsOverride([...skills, canonical]);
      setSkillQuery('');
    },
    [skills]
  );

  const addGeo = useCallback(() => {
    const value = geoDraft.trim();
    if (!value) return;
    setGeoOverride(geo.includes(value) ? geo : [...geo, value]);
    setGeoDraft('');
  }, [geoDraft, geo]);

  const save = useCallback(async () => {
    setError('');
    setNotice('');

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Give the organization a name of at least two characters.');
      return;
    }

    let normalizedWebsite = '';
    const rawWebsite = website.trim();
    if (rawWebsite) {
      const candidate = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
      const sanitized = sanitizeExternalUrl(candidate);
      if (!sanitized) {
        setError('That web address is not valid. Example: https://example.com');
        return;
      }
      normalizedWebsite = sanitized;
    }

    setSaving(true);
    try {
      const ok = await saveImmediately({
        org_name: trimmedName,
        org_website: normalizedWebsite || null,
        org_focus: focus,
        org_skills: skills,
        org_geo: geo,
      });
      if (!ok) throw new Error('The profile could not be saved. Check your connection and try again.');
      setNotice('Profile saved. The marketplace re-ranks against your skills immediately.');
      // The store now holds what the form held: drop the overrides so the
      // next hydrate, not a stale local copy, is what the inputs read.
      setNameOverride(null);
      setWebsiteOverride(null);
      setFocusOverride(null);
      setSkillsOverride(null);
      setGeoOverride(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [name, website, focus, skills, geo, saveImmediately]);

  const customRegions = geo.filter((region) => !isPresetRegion(region));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Account"
        title="Organization settings"
        subtitle="Everything talent sees before accepting a connection — and the skills your search ranks against."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/org"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Public page
            </Link>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="group inline-flex h-11 items-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
              {!saving && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          {notice}
        </div>
      )}
      {!dirty && status === 'saved' && (
        <p className="mb-4 text-xs text-[#8B8B96]" aria-live="polite">
          Saved.
        </p>
      )}

      <div className="space-y-6">
        <section className={`${CARD} p-5 sm:p-6`}>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#F5F5F7]">
            <Building2 className="h-4 w-4 text-violet-400" />
            Identity
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#8B8B96]">
                {account_type === 'investor' ? 'Fund name' : 'Organization name'}
              </span>
              <input
                value={name}
                onChange={(event) => setNameOverride(event.target.value)}
                placeholder="Acme Capital"
                className={FIELD_CLASS}
                autoComplete="organization"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#8B8B96]">Website</span>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B96]" />
                <input
                  value={website}
                  onChange={(event) => setWebsiteOverride(event.target.value)}
                  placeholder="https://example.com"
                  className={`${FIELD_CLASS} pl-9`}
                  autoComplete="url"
                  inputMode="url"
                />
              </div>
            </label>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[#8B8B96]">
            Passport IDs are issued to individual accounts only — an organization is identified by
            its name, website and the skills it hires for. Your audience is fixed after signup,
            which is what keeps the two directories separate.
          </p>
        </section>

        <section className={`${CARD} p-5 sm:p-6`}>
          <h2 className="text-base font-semibold text-[#F5F5F7]">Talent focus</h2>
          <p className="mt-1 text-xs text-[#8B8B96]">
            What your teams hire into. Shown on every directory card.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ORG_FOCUS_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => toggleFocus(area)}
                aria-pressed={focus.includes(area)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                  focus.includes(area) ? CHIP_ON : CHIP_OFF
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </section>

        <section className={`${CARD} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#F5F5F7]">Skills you hire for</h2>
              <p className="mt-1 text-xs text-[#8B8B96]">
                Ranked results in the marketplace come from this list.
              </p>
            </div>
            <span className="text-xs font-semibold tabular-nums text-[#8B8B96]">
              {skills.length} selected
            </span>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8B96]" />
            <input
              value={skillQuery}
              onChange={(event) => setSkillQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (skillSuggestions[0]) addSkill(skillSuggestions[0]);
                }
              }}
              placeholder={`Search ${SKILL_COUNT} canonical skills…`}
              aria-label="Search skills"
              className={`${FIELD_CLASS} pl-9`}
            />
            {skillSuggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-zinc-950 p-2">
                {skillSuggestions.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => addSkill(option)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
                    >
                      <Plus className="h-3 w-3 text-violet-400" />
                      {option}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            {skills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                <p className="text-sm font-medium text-[#C8C8D0]">No skills selected yet.</p>
                <p className="mt-1 text-xs leading-relaxed text-[#8B8B96]">
                  Without them every profile scores the same, and search results are ordered by
                  nothing more useful than recency.
                </p>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li key={skill}>
                    <button
                      type="button"
                      onClick={() => setSkillsOverride(skills.filter((item) => item !== skill))}
                      aria-label={`Remove ${skill}`}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200"
                    >
                      {skill}
                      <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={`${CARD} p-5 sm:p-6`}>
          <h2 className="text-base font-semibold text-[#F5F5F7]">Geographic focus</h2>
          <p className="mt-1 text-xs text-[#8B8B96]">
            Where you hire from. Used alongside location in search filters.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {ORG_GEOS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => toggleRegion(region)}
                aria-pressed={geo.includes(region)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                  geo.includes(region) ? CHIP_ON : CHIP_OFF
                }`}
              >
                {region}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={geoDraft}
              onChange={(event) => setGeoDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addGeo();
                }
              }}
              placeholder="Add another region — Kenya, Remote…"
              aria-label="Add a region"
              className={FIELD_CLASS}
            />
            <button
              type="button"
              onClick={addGeo}
              disabled={!geoDraft.trim()}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-4 text-sm font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {customRegions.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {customRegions.map((region) => (
                <li key={region}>
                  <button
                    type="button"
                    onClick={() => setGeoOverride(geo.filter((item) => item !== region))}
                    aria-label={`Remove ${region}`}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#C8C8D0] transition hover:border-red-500/40 hover:text-red-200"
                  >
                    {region}
                    <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6`}>
          <div>
            <p className="text-sm font-semibold text-[#F5F5F7]">Done here?</p>
            <p className="mt-1 text-xs text-[#8B8B96]">
              Requests and conversations live under Outreach.
            </p>
          </div>
          <Link
            href="/org/outreach"
            className="group inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-[#C8C8D0] transition hover:border-violet-500/50 hover:text-white"
          >
            Open outreach
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </section>
      </div>
    </div>
  );
}
