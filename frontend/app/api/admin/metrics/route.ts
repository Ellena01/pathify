import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createAdminClient, type AdminClient } from '@/utils/supabase/admin';
import { normalizeOpportunityType } from '@/lib/matching';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

/**
 * GET  /api/admin/metrics -> platform statistics
 * POST /api/admin/metrics -> moderation decision on one listing
 *
 * Authorization: `user_profiles.is_admin`. Checked SERVER-SIDE with the
 * service-role client, because the browser can trivially set any client-side
 * flag. The `admin_audit_log` SELECT policy uses the same column, so a
 * non-admin cannot read the audit trail even with a valid session.
 */

async function adminClient(): Promise<AdminClient | null> {
  return createAdminClient();
}

/**
 * Returns the service-role client, or a 401/403/500 response.
 *
 * The return type is the union of both outcomes so callers can narrow with
 * `if (!auth.ok) return auth.response;` and never touch `admin` on the failure
 * path. `AdminClient` is imported from `utils/supabase/admin` rather than
 * derived with `ReturnType<typeof createClient>` — see that module for why.
 */
async function requireAdmin(): Promise<
  { ok: true; admin: AdminClient; adminId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE }) };
  }

  const admin = await adminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Service role not configured' }, { status: 500, headers: NO_STORE }),
    };
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE }),
    };
  }

  return { ok: true, admin, adminId: user.id };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  const url = new URL(request.url);
  const queueLimit = Math.min(Number.parseInt(url.searchParams.get('queueLimit') ?? '', 10) || 50, 200);
  const queueStatus = url.searchParams.get('queueStatus') || 'review_recommended';

  // --- Headline counts ----------------------------------------------------
  // `head: true` with `count: 'exact'` gives us a COUNT without transferring
  // rows, which matters when the catalog runs to six figures.
  const [opportunities, verified, rejected, users, onboarded, optedIn, matches, tracker] =
    await Promise.all([
      admin.from('opportunities_cache').select('*', { count: 'exact', head: true }),
      admin.from('opportunities_cache').select('*', { count: 'exact', head: true }).eq('verification_status', 'high'),
      admin.from('opportunities_cache').select('*', { count: 'exact', head: true }).eq('verification_status', 'rejected'),
      admin.from('user_profiles').select('*', { count: 'exact', head: true }),
      admin.from('user_profiles').select('*', { count: 'exact', head: true }).eq('onboarding_completed', true),
      admin.from('user_profiles').select('*', { count: 'exact', head: true }).eq('alert_opt_in', true),
      admin.from('user_opportunity_matches').select('*', { count: 'exact', head: true }),
      admin.from('saved_jobs').select('*', { count: 'exact', head: true }),
    ]);

  // --- Source health ------------------------------------------------------
  // Derived from real rows, grouped in the database rather than in JS.
  const { data: byDomain } = await admin
    .from('opportunities_cache')
    .select('source_domain, opportunity_type, verification_status, first_seen_at, deadline')
    .limit(5000);

  const now = Date.now();
  const DAY = 86_400_000;

  interface SourceStat {
    domain: string;
    total: number;
    byType: Record<string, number>;
    verified: number;
    pending: number;
    lastSeen: string | null;
    ageDays: number | null;
    withDeadline: number;
  }

  const sources = new Map<string, SourceStat>();
  for (const row of byDomain ?? []) {
    const domain = (row.source_domain as string | null) ?? 'unknown';
    const type = normalizeOpportunityType(row.opportunity_type);
    const status = (row.verification_status as string | null) ?? 'review_recommended';
    const firstSeen = row.first_seen_at ? new Date(String(row.first_seen_at)).getTime() : null;

    const stat =
      sources.get(domain) ??
      ({
        domain,
        total: 0,
        byType: {},
        verified: 0,
        pending: 0,
        lastSeen: null,
        ageDays: null,
        withDeadline: 0,
      } as SourceStat);

    stat.total += 1;
    stat.byType[type] = (stat.byType[type] ?? 0) + 1;
    if (status === 'high') stat.verified += 1;
    if (status === 'review_recommended' || status === 'pending_review') stat.pending += 1;
    if (row.deadline) stat.withDeadline += 1;

    if (firstSeen !== null) {
      if (stat.lastSeen === null || firstSeen > new Date(stat.lastSeen).getTime()) {
        stat.lastSeen = new Date(firstSeen).toISOString();
      }
    }
    sources.set(domain, stat);
  }

  type SourceHealth = 'healthy' | 'stale' | 'dead';

  const sourceList: Array<SourceStat & { health: SourceHealth }> = [...sources.values()]
    .map((stat): SourceStat & { health: SourceHealth } => {
      const ageDays = stat.lastSeen ? Math.floor((now - new Date(stat.lastSeen).getTime()) / DAY) : null;
      const health: SourceHealth =
        ageDays === null ? 'dead' : ageDays <= 2 ? 'healthy' : ageDays <= 7 ? 'stale' : 'dead';
      return { ...stat, ageDays, health };
    })
    .sort((a, b) => b.total - a.total);

  // --- Type distribution --------------------------------------------------
  const typeTotals: Record<string, number> = {};
  for (const stat of sourceList) {
    for (const [type, count] of Object.entries(stat.byType)) {
      typeTotals[type] = (typeTotals[type] ?? 0) + count;
    }
  }

  // --- Moderation queue ---------------------------------------------------
  const { data: queue } = await admin
    .from('opportunities_cache')
    .select(
      'application_url, title, organization, location, opportunity_type, verification_status, source_domain, first_seen_at, deadline, review_note'
    )
    .eq('verification_status', queueStatus)
    .order('first_seen_at', { ascending: false })
    .limit(queueLimit);

  // --- Recent audit trail -------------------------------------------------
  const { data: audit } = await admin
    .from('admin_audit_log')
    .select('id, action, target_url, from_status, to_status, note, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json(
    {
      metrics: {
        totalOpportunities: opportunities.count ?? 0,
        verifiedOpportunities: verified.count ?? 0,
        rejectedOpportunities: rejected.count ?? 0,
        totalUsers: users.count ?? 0,
        onboardedUsers: onboarded.count ?? 0,
        alertsOptedIn: optedIn.count ?? 0,
        computedMatches: matches.count ?? 0,
        trackedApplications: tracker.count ?? 0,
        activeSources: sourceList.filter((s) => s.health !== 'dead').length,
        totalSources: sourceList.length,
      },
      sources: sourceList,
      types: typeTotals,
      queue: queue ?? [],
      audit: audit ?? [],
    },
    { headers: NO_STORE }
  );
}

const VALID_STATUSES = new Set(['high', 'review_recommended', 'pending_review', 'rejected']);

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { admin, adminId } = auth;

  let body: { url?: unknown; status?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  const url = typeof body.url === 'string' ? body.url : '';
  const status = typeof body.status === 'string' ? body.status : '';
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400, headers: NO_STORE });
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: 'Invalid status', allowed: [...VALID_STATUSES] },
      { status: 400, headers: NO_STORE }
    );
  }

  const { data: current } = await admin
    .from('opportunities_cache')
    .select('verification_status')
    .eq('application_url', url)
    .maybeSingle();

  const { error } = await admin
    .from('opportunities_cache')
    .update({
      verification_status: status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
      review_note: note,
    })
    .eq('application_url', url);

  if (error) {
    return NextResponse.json({ error: 'Could not update listing' }, { status: 500, headers: NO_STORE });
  }

  // Audit every moderation decision. A verification badge is a trust signal,
  // so who changed it and when has to be reconstructable.
  await admin.from('admin_audit_log').insert({
    admin_id: adminId,
    action: 'moderation',
    target_url: url,
    from_status: (current?.verification_status as string | null) ?? null,
    to_status: status,
    note,
  });

  return NextResponse.json({ ok: true, url, status }, { headers: NO_STORE });
}
