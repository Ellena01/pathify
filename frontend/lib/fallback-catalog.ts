/**
 * The last-resort opportunity catalog.
 *
 * `/api/jobs` and `/api/match` can each fail three ways — the `opportunities_cache`
 * read errors, the Apify dataset is unreachable, the env credentials are
 * missing — and in none of them may the user see a 500 or an empty feed. This
 * list is the floor beneath those fallbacks.
 *
 * Why rows in code at all: the two-universe migration seeds roughly forty
 * `registry` rows so a fresh database opens on a full feed, but that seed only
 * helps a database that can be reached. When the read itself fails there is
 * nothing to fall back *to* unless the fallback travels with the deployment.
 * These are a subset of exactly those seeded rows — Y Combinator, Work at a
 * Startup, Devpost, OpportunityDesk, the remote boards and the African boards —
 * so the degraded path renders the same catalog a healthy one would.
 *
 * Two rules kept from the seed, on purpose:
 *   - `verification_status` is `review_recommended`, never `high`. These are
 *     index pages of long-lived programmes, not scraped listings a moderator
 *     has checked, and a fabricated "Verified" tick is worse than no tick.
 *   - `deadline` stays absent. An invented date is what makes a user apply
 *     late, and the card renders correctly without one.
 */

export interface FallbackListing {
  application_url: string;
  title: string;
  organization: string;
  location: string;
  opportunity_type: string;
  skills_required: string[];
  verification_status: string;
  description: string;
  source_domain: string;
  source_platform: string;
  is_active: boolean;
  discovered_at: string;
  [key: string]: unknown;
}

const REVIEW = 'review_recommended';
const PLATFORM = 'registry';
/** The day this build shipped; only used for `discovered_at` ordering. */
const DISCOVERED_AT = new Date().toISOString().slice(0, 10);

function listing(
  application_url: string,
  title: string,
  organization: string,
  location: string,
  opportunity_type: string,
  skills_required: string[],
  source_domain: string
): FallbackListing {
  return {
    application_url,
    title,
    organization,
    location,
    opportunity_type,
    skills_required,
    verification_status: REVIEW,
    description:
      'Baseline entry: an index of current opportunities on a long-lived board or programme. Refreshed when live feeds sync.',
    source_domain,
    source_platform: PLATFORM,
    is_active: true,
    discovered_at: DISCOVERED_AT,
  };
}

/**
 * Twelve rows, chosen so every surface the demo touches has something to show:
 * the individual feed (remote boards + African boards), the hackathon and
 * fellowship tabs, and the org shortlist (which scores these same rows
 * against its `org_skills`).
 */
export const FALLBACK_CATALOG: FallbackListing[] = [
  // Remote and global job boards ------------------------------------------
  listing(
    'https://www.ycombinator.com/jobs',
    'Roles at Y Combinator companies',
    'Y Combinator',
    'San Francisco / Remote',
    'jobs_remote',
    ['Web Development', 'Artificial Intelligence', 'Entrepreneurship'],
    'ycombinator.com'
  ),
  listing(
    'https://www.workatastartup.com/',
    'Startup roles from YC companies',
    'Work at a Startup',
    'Remote / Global',
    'jobs_remote',
    ['Web Development', 'Product Management', 'Artificial Intelligence'],
    'workatastartup.com'
  ),
  listing(
    'https://weworkremotely.com/categories/remote-programming-jobs',
    'Remote programming roles',
    'We Work Remotely',
    'Remote / Global',
    'jobs_remote',
    ['Web Development', 'TypeScript', 'React'],
    'weworkremotely.com'
  ),
  listing(
    'https://remoteok.com/',
    'Remote jobs across every stack',
    'Remote OK',
    'Remote / Global',
    'jobs_remote',
    ['Web Development', 'JavaScript', 'Python'],
    'remoteok.com'
  ),
  listing(
    'https://wellfound.com/jobs',
    'Startup and scale-up roles',
    'Wellfound',
    'Remote / Global',
    'jobs_remote',
    ['Web Development', 'Product Management', 'Marketing'],
    'wellfound.com'
  ),

  // African boards ---------------------------------------------------------
  listing(
    'https://www.jobberman.com/',
    "Roles across Nigeria's employers",
    'Jobberman',
    'Lagos, Nigeria',
    'jobs_onsite',
    ['Communication', 'Project Management', 'Web Development'],
    'jobberman.com'
  ),
  listing(
    'https://www.myjobmag.com/',
    "Roles across Kenya's employers",
    'MyJobMag',
    'Nairobi, Kenya',
    'jobs_hybrid',
    ['Communication', 'Data Analysis', 'Sales'],
    'myjobmag.com'
  ),
  listing(
    'https://www.fuzu.com/',
    'Career development and jobs in East Africa',
    'Fuzu',
    'Nairobi, Kenya',
    'jobs_hybrid',
    ['Communication', 'Project Management', 'Marketing'],
    'fuzu.com'
  ),
  listing(
    'https://www.alxafrica.com/',
    'Pan-African tech programmes and placements',
    'ALX Africa',
    'Lagos / Nairobi / Addis Ababa',
    'internships',
    ['Web Development', 'Leadership', 'Communication'],
    'alxafrica.com'
  ),

  // Hackathons, fellowships and funding ------------------------------------
  listing(
    'https://devpost.com/hackathons',
    'Open hackathons',
    'Devpost',
    'Global / Online',
    'hackathons',
    ['Hackathon', 'Web Development', 'Git'],
    'devpost.com'
  ),
  listing(
    'https://www.opportunitydesk.org/',
    'Opportunities for young changemakers',
    'OpportunityDesk',
    'Global / Remote',
    'fellowships',
    ['Leadership', 'Networking', 'Communication'],
    'opportunitydesk.org'
  ),
  listing(
    'https://mastercardfdn.org/',
    'Scholarships for young Africans',
    'Mastercard Foundation',
    'Africa',
    'scholarships',
    ['Scholarship', 'Leadership', 'Mentorship'],
    'mastercardfdn.org'
  ),
];
