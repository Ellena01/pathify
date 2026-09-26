/**
 * Application tracker domain model.
 *
 * The tracker previously stored its stage inside `saved_jobs.job_data.stage`
 * as anonymous jsonb, which had two independent hardcoded copies of the stage
 * list (one on the dashboard, one on the detail page) that had already drifted
 * apart. The migration promotes `stage` to a real constrained column; this
 * module is the single definition of the allowed values and their metadata.
 */

export const TRACKER_STAGES = [
  'wishlist',
  'applied',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const;

export type TrackerStage = (typeof TRACKER_STAGES)[number];

const STAGE_SET = new Set<string>(TRACKER_STAGES);

export function isTrackerStage(value: unknown): value is TrackerStage {
  return typeof value === 'string' && STAGE_SET.has(value);
}

/** Coerce anything untrusted into a valid stage, defaulting to `wishlist`. */
export function coerceStage(value: unknown): TrackerStage {
  return isTrackerStage(value) ? value : 'wishlist';
}

export interface StageMeta {
  label: string;
  /** Short label for dense columns. */
  short: string;
  description: string;
  /** Accent colour, as Tailwind classes. */
  accent: string;
  dot: string;
  /** Terminal stages are excluded from the active pipeline. */
  terminal: boolean;
}

export const STAGE_META: Record<TrackerStage, StageMeta> = {
  wishlist: {
    label: 'Wishlist',
    short: 'Wish',
    description: 'Saved, not yet applied',
    accent: 'text-[#8B8B96] border-white/[0.08] bg-white/[0.03]',
    dot: 'bg-[#8B8B96]',
    terminal: false,
  },
  applied: {
    label: 'Applied',
    short: 'Applied',
    description: 'Application submitted',
    accent: 'text-[#8B5CF6] border-[#8B5CF6]/25 bg-[#8B5CF6]/10',
    dot: 'bg-[#8B5CF6]',
    terminal: false,
  },
  interviewing: {
    label: 'Interviewing',
    short: 'Interview',
    description: 'In conversation with the team',
    accent: 'text-[#38BDF8] border-[#38BDF8]/25 bg-[#38BDF8]/10',
    dot: 'bg-[#38BDF8]',
    terminal: false,
  },
  offer: {
    label: 'Offer',
    short: 'Offer',
    description: 'Offer received',
    accent: 'text-[#FBBF24] border-[#FBBF24]/25 bg-[#FBBF24]/10',
    dot: 'bg-[#FBBF24]',
    terminal: false,
  },
  accepted: {
    label: 'Accepted',
    short: 'Accepted',
    description: 'Offer accepted',
    accent: 'text-[#10B981] border-[#10B981]/25 bg-[#10B981]/10',
    dot: 'bg-[#10B981]',
    terminal: true,
  },
  rejected: {
    label: 'Rejected',
    short: 'Rejected',
    description: 'Application declined',
    accent: 'text-[#F87171] border-[#F87171]/25 bg-[#F87171]/10',
    dot: 'bg-[#F87171]',
    terminal: true,
  },
  withdrawn: {
    label: 'Withdrawn',
    short: 'Withdrawn',
    description: 'You stepped back',
    accent: 'text-[#6B7280] border-white/[0.08] bg-white/[0.02]',
    dot: 'bg-[#6B7280]',
    terminal: true,
  },
};

/** The happy-path pipeline shown as Kanban columns, in order. */
export const PIPELINE_STAGES: TrackerStage[] = [
  'wishlist',
  'applied',
  'interviewing',
  'offer',
  'accepted',
];

/** Everything else, collapsed into a secondary group. */
export const CLOSED_STAGES: TrackerStage[] = ['rejected', 'withdrawn'];

export interface TrackedOpportunity {
  /** The `saved_jobs` row id. */
  id: string;
  /** `saved_jobs.job_url` — the opportunity key. */
  jobUrl: string;
  stage: TrackerStage;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
  title: string;
  organization: string | null;
  location: string | null;
  opportunityType: string | null;
  deadline: string | null;
  matchScore: number | null;
}

/** Parse a `saved_jobs` row into a tracker card, defensively. */
export function parseTrackedRow(row: Record<string, unknown>): TrackedOpportunity | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const jobUrl = typeof row.job_url === 'string' ? row.job_url : '';
  if (!id || !jobUrl) return null;

  const data = (row.job_data ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return {
    id,
    jobUrl,
    stage: coerceStage(row.stage ?? data.stage),
    notes: str(data.notes) ?? '',
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at) ?? str(row.created_at),
    title: str(data.title) ?? 'Untitled opportunity',
    organization: str(data.organization),
    location: str(data.location),
    opportunityType: str(data.opportunity_type),
    deadline: str(data.deadline),
    matchScore: typeof data.match_score === 'number' ? data.match_score : null,
  };
}

/** Days until a `YYYY-MM-DD` deadline. Negative when it has passed. */
export function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const parsed = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const today = Date.now();
  return Math.ceil((parsed - today) / 86_400_000);
}

export function deadlineUrgency(deadline: string | null): 'none' | 'passed' | 'urgent' | 'soon' | 'normal' {
  const days = daysUntil(deadline);
  if (days === null) return 'none';
  if (days < 0) return 'passed';
  if (days <= 3) return 'urgent';
  if (days <= 14) return 'soon';
  return 'normal';
}
