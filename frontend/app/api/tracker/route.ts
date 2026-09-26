import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isTrackerStage, parseTrackedRow, type TrackedOpportunity } from '@/lib/tracker';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

/**
 * GET    /api/tracker  -> the signed-in user's tracked opportunities
 * POST   /api/tracker  -> move a card between stages
 * DELETE /api/tracker  -> remove a card
 *
 * Every handler resolves the user from the session and scopes the query by
 * their own id. No identifier from the request body is ever trusted as the
 * owner.
 */

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const { data, error } = await supabase
    .from('saved_jobs')
    .select('id, job_url, job_data, stage, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Could not load tracker' }, { status: 500, headers: NO_STORE });
  }

  const items: TrackedOpportunity[] = (data ?? [])
    .map((row) => parseTrackedRow(row as Record<string, unknown>))
    .filter((row): row is TrackedOpportunity => row !== null);

  return NextResponse.json({ items, count: items.length }, { headers: NO_STORE });
}

interface MoveBody {
  id?: unknown;
  stage?: unknown;
  notes?: unknown;
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  let body: MoveBody;
  try {
    body = (await request.json()) as MoveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  // Validate before touching the database. `saved_jobs.stage` has a CHECK
  // constraint, but failing here gives a clear 400 instead of a constraint
  // violation surfaced as a 500.
  if (!isTrackerStage(body.stage)) {
    return NextResponse.json(
      { error: 'Invalid stage', allowed: ['wishlist', 'applied', 'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn'] },
      { status: 400, headers: NO_STORE }
    );
  }

  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: NO_STORE });
  }

  const update: Record<string, unknown> = { stage: body.stage };

  // Notes live in job_data; merge rather than replace so opportunity metadata
  // captured at save time survives a stage change.
  if (typeof body.notes === 'string') {
    const { data: existing } = await supabase
      .from('saved_jobs')
      .select('job_data')
      .eq('id', body.id)
      .eq('user_id', user.id)
      .maybeSingle();

    const jobData = (existing?.job_data ?? {}) as Record<string, unknown>;
    update.job_data = { ...jobData, notes: body.notes.slice(0, 4000), stage: body.stage };
  }

  // The `.eq('user_id', user.id)` is the authorisation check: RLS also enforces
  // it, but scoping explicitly means a mismatched id returns 404 rather than
  // silently updating nothing.
  const { data, error } = await supabase
    .from('saved_jobs')
    .update(update)
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, job_url, job_data, stage, created_at, updated_at')
    .maybeSingle();

  if (error) {
    const missingColumn = /column .* does not exist/i.test(error.message);
    return NextResponse.json(
      {
        error: missingColumn
          ? 'Tracker schema is out of date. Run supabase/migrations/20260926_hardening_passport_v2.sql'
          : 'Could not update stage',
        detail: error.message,
      },
      { status: missingColumn ? 503 : 500, headers: NO_STORE }
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    { item: parseTrackedRow(data as Record<string, unknown>) },
    { headers: NO_STORE }
  );
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400, headers: NO_STORE });
  }

  const { error, count } = await supabase
    .from('saved_jobs')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Could not remove' }, { status: 500, headers: NO_STORE });
  }
  if (!count) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json({ removed: 1 }, { headers: NO_STORE });
}
