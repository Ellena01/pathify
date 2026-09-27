/**
 * The organisation-facing option lists.
 *
 * Defined once because they are shown twice: in the four-step onboarding and
 * in `/org/settings`. Two copies drift — the settings page would eventually
 * offer a focus area the onboarding step had never heard of, and the profile
 * would look half-filled to everyone reading it.
 *
 * Skills are deliberately NOT here. Those come from the canonical taxonomy in
 * `lib/taxonomy.ts`, which is a projection of `actor/src/skills/taxonomy.json`
 * and is what the scoring engine actually understands.
 */

/** What a fund or company hires into. Shown as multi-select chips. */
export const ORG_FOCUS_AREAS = [
  'Engineering',
  'Data & AI',
  'Design',
  'Product',
  'Marketing',
  'Operations',
  'Finance',
  'Research',
] as const;

/** Regions an organization hires from. Free text is allowed alongside these. */
export const ORG_GEOS = [
  'Nigeria',
  'West Africa',
  'East Africa',
  'Southern Africa',
  'Pan-African',
  'Europe',
  'North America',
  'Global',
] as const;
