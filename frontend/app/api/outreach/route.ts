import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

/**
 * /api/outreach — the conversation layer.
 *
 *   GET  /api/outreach                        threads (accepted connections + latest message)
 *   GET  /api/outreach?connection_id=<uuid>   one thread
 *   POST {connection_id, body}                send a message
 *
 * Rules enforced here and, independently, by RLS in
 * `20260928_two_universes_connections.sql`:
 *
 *   - only a participant can read or write a thread;
 *   - only an ACCEPTED connection can be messaged — otherwise "accept" would
 *     mean nothing and a cold request would become a spam vector;
 *   - messages are immutable (there is no UPDATE policy), so nobody can edit
 *     history after the fact.
 */

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;
const MAX_BODY_LENGTH = 4000;
const MAX_MESSAGES_PER_THREAD = 200;
const MAX_THREADS = 50;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

interface ConnectionRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  requester_label: string;
  recipient_label: string;
  requester_account_type: string;
  recipient_passport_id: string | null;
  status: string;
  message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Load a connection the caller participates in.
 * Returns `null` for "does not exist / not yours" — RLS already guarantees the
 * latter, so the distinction is not worth leaking.
 */
async function loadConnection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  userId: string
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from('connections')
    .select(
      'id, requester_id, recipient_id, requester_label, recipient_label, requester_account_type, recipient_passport_id, status, message, created_at, updated_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  const connection = data as unknown as ConnectionRow;
  if (connection.requester_id !== userId && connection.recipient_id !== userId) return null;
  return connection;
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
  const connectionId = searchParams.get('connection_id');

  // ---------------------------------------------------------------- one thread
  if (connectionId) {
    if (!isUuid(connectionId)) {
      return NextResponse.json({ error: 'A valid connection is required.' }, { status: 400, headers: NO_STORE });
    }

    const connection = await loadConnection(supabase, connectionId, user.id);
    if (!connection) {
      return NextResponse.json({ error: 'Thread not found.' }, { status: 404, headers: NO_STORE });
    }
    if (connection.status !== 'accepted') {
      return NextResponse.json(
        { error: 'Messages are only available once both sides have accepted.' },
        { status: 403, headers: NO_STORE }
      );
    }

    const { data: messages, error } = await supabase
      .from('outreach_messages')
      .select('id, connection_id, sender_id, body, created_at')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES_PER_THREAD);

    if (error) {
      return NextResponse.json({ error: 'Could not load the thread.' }, { status: 500, headers: NO_STORE });
    }

    return NextResponse.json({ connection, messages: messages ?? [] }, { headers: NO_STORE });
  }

  // ------------------------------------------------------------------ threads
  const { data: connections, error } = await supabase
    .from('connections')
    .select(
      'id, requester_id, recipient_id, requester_label, recipient_label, requester_account_type, recipient_passport_id, status, message, created_at, updated_at'
    )
    .eq('status', 'accepted')
    .order('updated_at', { ascending: false })
    .limit(MAX_THREADS);

  if (error) {
    return NextResponse.json({ error: 'Could not load threads.' }, { status: 500, headers: NO_STORE });
  }

  const rows = (connections ?? []) as unknown as ConnectionRow[];

  // Latest message per thread. There is no "last row per group" operator in
  // PostgREST, so one descending read and first-wins grouping does the job in
  // a single round trip instead of N.
  const latest = new Map<string, { body: string; created_at: string; sender_id: string }>();
  if (rows.length > 0) {
    const { data: recent } = await supabase
      .from('outreach_messages')
      .select('connection_id, body, created_at, sender_id')
      .in('connection_id', rows.map((row) => row.id))
      .order('created_at', { ascending: false })
      .limit(200);

    for (const message of recent ?? []) {
      if (!latest.has(message.connection_id)) {
        latest.set(message.connection_id, {
          body: message.body,
          created_at: message.created_at,
          sender_id: message.sender_id,
        });
      }
    }
  }

  const threads = rows.map((row) => ({
    ...row,
    // The label that is NOT the caller's own, so a thread list needs no client
    // side pairing logic.
    counterpart:
      row.requester_id === user.id
        ? { id: row.recipient_id, label: row.recipient_label, passport_id: row.recipient_passport_id }
        : { id: row.requester_id, label: row.requester_label, passport_id: null },
    last_message: latest.get(row.id) ?? null,
  }));

  return NextResponse.json({ threads }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  let body: { connection_id?: unknown; body?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!isUuid(body.connection_id)) {
    return NextResponse.json({ error: 'A valid connection is required.' }, { status: 400, headers: NO_STORE });
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Write a message first.' }, { status: 400, headers: NO_STORE });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Messages are limited to ${MAX_BODY_LENGTH} characters.` },
      { status: 400, headers: NO_STORE }
    );
  }

  const connection = await loadConnection(supabase, body.connection_id, user.id);
  if (!connection) {
    return NextResponse.json({ error: 'Thread not found.' }, { status: 404, headers: NO_STORE });
  }
  if (connection.status !== 'accepted') {
    return NextResponse.json(
      { error: 'Messages are only available once both sides have accepted.' },
      { status: 403, headers: NO_STORE }
    );
  }

  const { data: message, error } = await supabase
    .from('outreach_messages')
    .insert({ connection_id: connection.id, sender_id: user.id, body: text })
    .select('id, connection_id, sender_id, body, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Could not send the message.' }, { status: 500, headers: NO_STORE });
  }

  // Bump the thread so the list orders by most recent activity.
  await supabase.from('connections').update({ updated_at: new Date().toISOString() }).eq('id', connection.id);

  return NextResponse.json({ message }, { status: 201, headers: NO_STORE });
}
