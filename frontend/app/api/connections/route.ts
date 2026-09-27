import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { isOrgAccount } from '@/lib/universe';

export const runtime = 'nodejs';

/**
 * /api/connections — the org <-> talent graph, from either side.
 *
 *   GET   /api/connections?directory=1   my connections + who I may approach
 *   POST  {action:'request',  recipient_id, message?}
 *   POST  {action:'respond',  id, status:'accepted'|'declined'}
 *   POST  {action:'withdraw', id}
 *
 * ## Who may request whom
 *
 * Connections are cross-universe by construction: an organisation approaches
 * talent it found in the marketplace, an individual approaches an organization
 * from their directory. Same-universe connections are rejected, because there
 * is nothing on the other side of one.
 *
 * A second condition applies to organisations: they may only approach a
 * passport that is `is_passport_public`, which is the profile's existing
 * explicit "show me to others" consent (it is also what publishes `/p/[slug]`).
 * An individual approaching an organization has no equivalent gate — the
 * organization's profile is not a personal credential.
 *
 * ## Labels are not written here
 *
 * `requester_label`, `recipient_label` and `recipient_passport_id` are filled
 * by the `trg_connections_fill_labels` trigger in
 * `20260928_two_universes_connections.sql`, so neither party can claim to be
 * someone else. This route only ever writes `requester_id` (its own session),
 * `recipient_id` and `message`.
 */

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;
const MAX_OPEN_REQUESTS = 50;
const MAX_MESSAGE_LENGTH = 1000;

interface RequestBody {
  action?: unknown;
  recipient_id?: unknown;
  id?: unknown;
  status?: unknown;
  message?: unknown;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = new URL(request.url);
  const wantDirectory = searchParams.get('directory') === '1';

  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Could not load connections' }, { status: 500, headers: NO_STORE });
  }

  const connections = data ?? [];

  let directory: Array<Record<string, unknown>> = [];
  if (wantDirectory) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_type, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    // Only the opposite universe belongs in a directory, and only accounts
    // that finished setup (a half-configured organization has no focus or
    // skills to show).
    const wantOrgs = !isOrgAccount(profile?.account_type);

    const admin = createAdminClient();
    if (admin) {
      const query = admin
        .from('user_profiles')
        .select(
          'id, name, account_type, org_name, org_website, org_focus, org_skills, org_geo, onboarding_completed, is_passport_public, passport_id, country'
        )
        .eq('onboarding_completed', true)
        .order('created_at', { ascending: false })
        .limit(12);

      const { data: rows } = await (wantOrgs
        ? query.neq('account_type', 'individual')
        : query.eq('account_type', 'individual').eq('is_passport_public', true));

      directory = (rows ?? []).map((row) => ({
        id: row.id,
        kind: wantOrgs ? 'organization' : 'talent',
        label: wantOrgs ? row.org_name || row.name : row.name,
        sub: wantOrgs ? row.org_website || (row.org_focus ?? []).join(' · ') : row.country,
        focus: row.org_focus ?? [],
        skills: row.org_skills ?? [],
        passport_id: wantOrgs ? null : row.passport_id,
        // An individual's directory entry is only offered while their passport
        // is public — same consent rule the requesting side is held to.
        reachable: wantOrgs ? true : Boolean(row.is_passport_public),
      }));
    }
  }

  return NextResponse.json({ connections, directory }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  const action = typeof body.action === 'string' ? body.action : '';

  // ------------------------------------------------------------------ request
  if (action === 'request') {
    if (!isUuid(body.recipient_id)) {
      return NextResponse.json({ error: 'A valid recipient is required.' }, { status: 400, headers: NO_STORE });
    }
    if (body.recipient_id === user.id) {
      return NextResponse.json({ error: 'You cannot send a request to yourself.' }, { status: 400, headers: NO_STORE });
    }

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';

    const { data: self } = await supabase
      .from('user_profiles')
      .select('account_type, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle();

    if (!self?.onboarding_completed) {
      return NextResponse.json({ error: 'Finish onboarding first.' }, { status: 403, headers: NO_STORE });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Connections are not available yet.', detail: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
        { status: 503, headers: NO_STORE }
      );
    }

    // The recipient's row is not readable under RLS (profiles are self-only),
    // so eligibility is checked here with the service role — after the caller
    // has been verified from their session, and with `recipient_id` taken from
    // the body only as an identifier, never as an authority.
    const { data: recipient } = await admin
      .from('user_profiles')
      .select('id, account_type, onboarding_completed, is_passport_public')
      .eq('id', body.recipient_id)
      .maybeSingle();

    if (!recipient || !recipient.onboarding_completed) {
      return NextResponse.json({ error: 'That account is not available.' }, { status: 404, headers: NO_STORE });
    }

    const selfIsOrg = isOrgAccount(self?.account_type);
    const recipientIsOrg = isOrgAccount(recipient.account_type);

    if (selfIsOrg === recipientIsOrg) {
      return NextResponse.json(
        { error: 'Connections link an organization with talent. That account is on your side of the platform.' },
        { status: 400, headers: NO_STORE }
      );
    }

    if (selfIsOrg && !recipient.is_passport_public) {
      return NextResponse.json(
        { error: 'That passport is not discoverable.' },
        { status: 403, headers: NO_STORE }
      );
    }

    const { count } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .eq('status', 'pending');

    if ((count ?? 0) >= MAX_OPEN_REQUESTS) {
      return NextResponse.json(
        { error: `You already have ${MAX_OPEN_REQUESTS} open requests. Wait for responses before sending more.` },
        { status: 429, headers: NO_STORE }
      );
    }

    const { data: created, error: insertError } = await supabase
      .from('connections')
      .insert({
        requester_id: user.id,
        recipient_id: body.recipient_id,
        message: message || null,
      })
      .select('*')
      .single();

    if (insertError) {
      // 23505: the partial unique index found an open request for this pair,
      // in either direction.
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'There is already an open connection with that account.' },
          { status: 409, headers: NO_STORE }
        );
      }
      return NextResponse.json({ error: 'Could not send the request.' }, { status: 500, headers: NO_STORE });
    }

    return NextResponse.json({ connection: created }, { status: 201, headers: NO_STORE });
  }

  // ------------------------------------------------------------------ respond
  if (action === 'respond') {
    if (!isUuid(body.id)) {
      return NextResponse.json({ error: 'A valid connection is required.' }, { status: 400, headers: NO_STORE });
    }
    const status = body.status === 'accepted' ? 'accepted' : body.status === 'declined' ? 'declined' : null;
    if (!status) {
      return NextResponse.json({ error: "Status must be 'accepted' or 'declined'." }, { status: 400, headers: NO_STORE });
    }

    // Only the recipient may decide, and only while the request is pending —
    // the WHERE clause is what makes a double-tap idempotent instead of a
    // silent overwrite.
    const { data, error } = await supabase
      .from('connections')
      .update({ status })
      .eq('id', body.id)
      .eq('recipient_id', user.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Could not update the request.' }, { status: 500, headers: NO_STORE });
    }
    if (!data) {
      return NextResponse.json(
        { error: 'That request is not pending, or it is not addressed to you.' },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json({ connection: data }, { headers: NO_STORE });
  }

  // ----------------------------------------------------------------- withdraw
  if (action === 'withdraw') {
    if (!isUuid(body.id)) {
      return NextResponse.json({ error: 'A valid connection is required.' }, { status: 400, headers: NO_STORE });
    }

    const { data, error } = await supabase
      .from('connections')
      .delete()
      .eq('id', body.id)
      .eq('requester_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Could not withdraw the request.' }, { status: 500, headers: NO_STORE });
    }
    if (!data) {
      return NextResponse.json({ error: 'That request is not yours to withdraw.' }, { status: 404, headers: NO_STORE });
    }

    return NextResponse.json({ withdrawn: data.id }, { headers: NO_STORE });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: NO_STORE });
}
