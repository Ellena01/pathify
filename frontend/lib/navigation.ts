import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Compass,
  Sparkles,
  ShieldCheck,
  CheckSquare,
  Route,
  Settings,
  Shield,
  Wrench,
  Handshake,
  Users,
  MessageSquare,
} from 'lucide-react';
import type { Universe } from './universe';

/**
 * Single source of truth for application navigation.
 *
 * The desktop sidebar, the mobile drawer and the mobile bottom bar all render
 * from this module — previously each declared its own list, so they drifted and
 * every new route had to be added twice.
 *
 * It now also carries the second universe. `NAV_GROUPS` is the talent side and
 * `ORG_NAV_GROUPS` is the organisation side; `navGroupsFor` picks between them
 * from the account type. Access control is NOT here — that is
 * `utils/supabase/middleware.ts`, which decides from `user_profiles.account_type`
 * on the server. This file only decides what to draw.
 */

export const SIDEBAR_WIDTH_EXPANDED = 'w-64'; // 256px
export const SIDEBAR_WIDTH_COLLAPSED = 'w-20'; //  80px
export const SIDEBAR_MARGIN_EXPANDED = 'lg:ml-64';
export const SIDEBAR_MARGIN_COLLAPSED = 'lg:ml-20';

export interface NavItemConfig {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  /** Shown in the mobile bottom bar. Falls back to `label`. */
  shortLabel?: string;
  /** Included in the 5-slot mobile bottom bar. Everything else lives in the drawer. */
  mobileBar?: boolean;
  description: string;
}

export interface NavGroupConfig {
  label: string;
  items: NavItemConfig[];
}

/** Talent universe. Mirrors `app/(app)/*`. */
export const NAV_GROUPS: NavGroupConfig[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        shortLabel: 'Home',
        mobileBar: true,
        description: 'Your matches, deadlines and gaps at a glance',
      },
    ],
  },
  {
    label: 'Discover',
    items: [
      {
        href: '/opportunities',
        label: 'Opportunities',
        icon: Compass,
        shortLabel: 'Discover',
        mobileBar: true,
        description: 'Every opening, grant and fellowship matched to you',
      },
      {
        href: '/connections',
        label: 'Connections',
        icon: Handshake,
        shortLabel: 'Connect',
        mobileBar: true,
        description: 'Organizations that reached out, and requests you sent',
      },
      {
        href: '/navigator',
        label: 'AI Navigator',
        icon: Sparkles,
        shortLabel: 'Navigator',
        badge: 'AI',
        description: 'Ask questions and get answers grounded in live data',
      },
    ],
  },
  {
    label: 'Progress',
    items: [
      {
        href: '/tracker',
        label: 'Application Tracker',
        icon: CheckSquare,
        shortLabel: 'Tracker',
        mobileBar: true,
        description: 'Move applications from wishlist to offer',
      },
      {
        href: '/pathways',
        label: 'Skill Pathways',
        icon: Route,
        shortLabel: 'Pathways',
        description: 'Turn skill gaps into a step-by-step plan',
      },
    ],
  },
  {
    label: 'Identity',
    items: [
      {
        href: '/passport',
        label: 'Talent Passport',
        icon: ShieldCheck,
        shortLabel: 'Passport',
        description: 'Your verifiable professional identity',
      },
      {
        href: '/skills',
        label: 'Skills',
        icon: Wrench,
        shortLabel: 'Skills',
        description: 'What you can do, what is in demand, and the gap',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/settings',
        label: 'Settings',
        icon: Settings,
        shortLabel: 'Settings',
        mobileBar: true,
        description: 'Profile, alerts and privacy',
      },
    ],
  },
];

/** Organisation universe. Mirrors `app/org/*` (excluding the public page). */
export const ORG_NAV_GROUPS: NavGroupConfig[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/org/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        shortLabel: 'Home',
        mobileBar: true,
        description: 'Pipeline, requests and the shortlist at a glance',
      },
    ],
  },
  {
    label: 'Hiring',
    items: [
      {
        href: '/org/talent',
        label: 'Talent',
        icon: Users,
        shortLabel: 'Talent',
        mobileBar: true,
        description: 'Search discoverable passports by skill and location',
      },
      {
        href: '/org/outreach',
        label: 'Outreach',
        icon: MessageSquare,
        shortLabel: 'Outreach',
        mobileBar: true,
        description: 'Connection requests and conversations in progress',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        href: '/org/settings',
        label: 'Settings',
        icon: Settings,
        shortLabel: 'Settings',
        mobileBar: true,
        description: 'Organization profile, focus and hiring preferences',
      },
    ],
  },
];

/** Flattened list for a universe. */
export function navGroupsFor(universe: Universe): NavGroupConfig[] {
  return universe === 'org' ? ORG_NAV_GROUPS : NAV_GROUPS;
}

/** Bottom bar is 5 slots; everything else is reachable from the drawer. */
export function mobileBarItems(universe: Universe): NavItemConfig[] {
  return navGroupsFor(universe)
    .flatMap((g) => g.items)
    .filter((item) => item.mobileBar);
}

/** Flattened individual list, used by callers that need every talent route. */
export const ALL_NAV_ITEMS: NavItemConfig[] = NAV_GROUPS.flatMap((g) => g.items);

export const ORG_NAV_ITEMS: NavItemConfig[] = ORG_NAV_GROUPS.flatMap((g) => g.items);

/** Routes that require an authenticated session (mirrors utils/supabase/middleware.ts). */
export const PROTECTED_ROUTES = ALL_NAV_ITEMS.map((i) => i.href);

/**
 * Kept for callers that reason about the gate client-side. The authoritative
 * list lives in middleware, which blocks every app route — not just these —
 * until `onboarding_completed` is true.
 */
export const ONBOARDING_GATED_ROUTES = [
  '/dashboard',
  '/passport',
  '/tracker',
  '/pathways',
  '/settings',
  '/skills',
  '/connections',
  '/navigator',
  '/opportunities',
];

export const ADMIN_NAV_ITEM: NavItemConfig = {
  href: '/admin',
  label: 'Admin',
  icon: Shield,
  shortLabel: 'Admin',
  description: 'Platform metrics and moderation',
};

export function isNavItemActive(pathname: string, href: string): boolean {
  // Exact for roots: `/dashboard` must not stay lit on `/dashboard/anything`
  // that belongs to a different section, and `/org` must not light up for
  // `/organisation`.
  if (href === '/dashboard' || href === '/org/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
