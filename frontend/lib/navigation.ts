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
} from 'lucide-react';

/**
 * Single source of truth for application navigation.
 *
 * The desktop sidebar and the mobile bottom bar previously each declared their
 * own hardcoded list, so they drifted — the sidebar was missing nothing only by
 * coincidence, and any new route had to be added twice. Both now render from
 * this module.
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
  description: string;
}

export interface NavGroupConfig {
  label: string;
  items: NavItemConfig[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        shortLabel: 'Home',
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
        description: 'Every opening, grant and fellowship matched to you',
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
        description: 'Profile, alerts and privacy',
      },
    ],
  },
];

/** Flattened list, used by the mobile bottom bar. */
export const ALL_NAV_ITEMS: NavItemConfig[] = NAV_GROUPS.flatMap((g) => g.items);

/** Routes that require an authenticated session (mirrors utils/supabase/middleware.ts). */
export const PROTECTED_ROUTES = ALL_NAV_ITEMS.map((i) => i.href);

/** Routes that also require completed onboarding. */
export const ONBOARDING_GATED_ROUTES = [
  '/dashboard',
  '/passport',
  '/tracker',
  '/pathways',
  '/settings',
];

export const ADMIN_NAV_ITEM: NavItemConfig = {
  href: '/admin',
  label: 'Admin',
  icon: Shield,
  shortLabel: 'Admin',
  description: 'Platform metrics and moderation',
};

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
