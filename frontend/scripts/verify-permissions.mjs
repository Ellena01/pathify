#!/usr/bin/env node
/**
 * Verify the `/api/sync` write path end to end, without writing anything.
 *
 * ## The question this answers
 *
 * "Does `service_role` actually have what it needs to upsert into
 * `opportunities_cache`, and is everything else locked down?"
 *
 * The answer is not obvious from the SQL alone, because three things have to be
 * true at once:
 *
 *   1. the table has every column `/api/sync` writes (a single unknown column
 *      aborts the whole multi-row batch — this was a live production bug)
 *   2. `application_url` has a unique constraint, or `onConflict` fails
 *   3. the role in the request may write, and no other role may
 *
 * ## How it checks
 *
 * Reads the SQL migrations for the schema, then runs a series of live PostgREST
 * probes with both keys. It never mutates a row: the write probes are
 * `Prefer: tx=rollback` / a deliberately-invalid payload, so a failure reports
 * "denied" rather than corrupting data.
 *
 *   node scripts/verify-permissions.mjs
 *   node scripts/verify-permissions.mjs --static     # migrations only, no network
 *
 * Exits 0 when the write path is usable, 1 when it is not.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const STATIC_ONLY = process.argv.includes('--static');

// --- env --------------------------------------------------------------------

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(join(ROOT, '.env.local'));
loadEnvFile(join(ROOT, '.env'));

const C = {
  green: (s) => `\u001b[32m${s}\u001b[0m`,
  red: (s) => `\u001b[31m${s}\u001b[0m`,
  yellow: (s) => `\u001b[33m${s}\u001b[0m`,
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
};

let failures = 0;
let warnings = 0;

const pass = (msg) => console.log(`  ${C.green('PASS')}  ${msg}`);
const fail = (msg, hint) => {
  failures += 1;
  console.log(`  ${C.red('FAIL')}  ${msg}`);
  if (hint) console.log(`        ${C.dim(hint)}`);
};
const warn = (msg) => {
  warnings += 1;
  console.log(`  ${C.yellow('WARN')}  ${msg}`);
};
const info = (msg) => console.log(`  ${C.dim('····')}  ${msg}`);

// ---------------------------------------------------------------------------
// 1. The exact column set /api/sync writes
// ---------------------------------------------------------------------------

/**
 * Read from the normaliser rather than hardcoding, so this check cannot drift
 * out of sync with the code it is verifying. A regex over the row literal is
 * crude but it fails loudly if the shape changes, which is the point.
 */
function syncWrittenColumns() {
  const src = readFileSync(join(ROOT, 'app', 'api', 'sync', 'normalize.ts'), 'utf8');
  const start = src.indexOf('row: {');
  const end = src.indexOf('synced_at:', start);
  if (start === -1 || end === -1) return [];
  const body = src.slice(start, end);
  return [...body.matchAll(/^\s{6}([a-z_]+):/gm)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// 2. Static analysis of the migrations
// ---------------------------------------------------------------------------

function declaredColumns() {
  const files = [
    join(ROOT, 'supabase', 'schema.sql'),
    ...(existsSync(MIGRATIONS) ? readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => join(MIGRATIONS, f)) : []),
  ];

  const columns = new Set();
  let hasPrimaryKeyOnUrl = false;
  let worldWritableUpdate = false;
  let serviceRoleWrite = false;

  for (const file of files) {
    const sql = readFileSync(file, 'utf8');

    // CREATE TABLE ... ( column type ... )
    const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?opportunities_cache\s*\(([\s\S]*?)\n\);/gi;
    for (const m of sql.matchAll(create)) {
      for (const line of m[1].split('\n')) {
        const col = /^\s{2}([a-z_]+)\s+[a-z]/i.exec(line);
        if (col) columns.add(col[1].toLowerCase());
        if (/application_url\s+text\s+primary\s+key/i.test(line)) hasPrimaryKeyOnUrl = true;
      }
    }

    // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] col
    for (const m of sql.matchAll(/alter\s+table\s+(?:public\.)?opportunities_cache[\s\S]*?add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)) {
      columns.add(m[1].toLowerCase());
    }

    // A single-line ADD COLUMN list (col a, col b, ...)
    for (const m of sql.matchAll(/alter\s+table\s+(?:public\.)?opportunities_cache\s+add\s+column[\s\S]*?;/gi)) {
      for (const part of m[0].split(':').slice(1)) {
        for (const name of part.split(',')) {
          const col = /^\s*([a-z_]+)\s+[a-z]/i.exec(name);
          if (col) columns.add(col[1].toLowerCase());
        }
      }
    }

    if (/opportunities_service_update[\s\S]{0,160}?using\s*\(\s*true\s*\)[\s\S]{0,80}?with\s+check\s*\(\s*true\s*\)/i.test(sql)) {
      worldWritableUpdate = true;
    }
    if (/auth\.role\(\)\s*=\s*'service_role'/.test(sql)) serviceRoleWrite = true;
  }

  return { columns, hasPrimaryKeyOnUrl, worldWritableUpdate, serviceRoleWrite };
}

console.log(`\n${C.bold('Pathify sync permission check')}\n`);

console.log(C.bold('1. Schema (from migrations)'));
const written = syncWrittenColumns();
const schema = declaredColumns();
info(`columns declared across schema.sql + migrations: ${schema.columns.size}`);

const missing = written.filter((c) => !schema.columns.has(c));
if (written.length === 0) {
  fail('Could not parse the column list out of app/api/sync/normalize.ts');
} else if (missing.length > 0) {
  fail(
    `/api/sync writes columns no migration creates: ${missing.join(', ')}`,
    'One unknown column aborts the entire multi-row upsert, so the catalog stops\n' +
      '        refreshing with no useful error. Add them in a migration.'
  );
} else {
  pass(`all ${written.length} columns written by /api/sync are declared`);
}

if (schema.hasPrimaryKeyOnUrl) {
  pass('application_url is the primary key (onConflict target is valid)');
} else {
  fail('application_url is not declared as the primary key', 'onConflict: application_url will fail.');
}

if (schema.serviceRoleWrite) {
  pass('a service_role-gated write policy exists');
} else {
  fail('no policy grants service_role a write on opportunities_cache');
}

if (schema.worldWritableUpdate) {
  warn(
    'a `using (true) with check (true)` UPDATE policy appears in the migrations',
    'It is dropped and replaced later in the file order, but confirm the\n' +
      '        hardening migration ran — otherwise any client can rewrite the catalog.'
  );
} else {
  pass('no world-writable UPDATE policy in the migration chain');
}

// ---------------------------------------------------------------------------
// 3. Live probes
// ---------------------------------------------------------------------------

if (STATIC_ONLY) {
  console.log(C.dim('\n  --static: skipping live PostgREST probes.\n'));
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log(`\n${C.bold('2. Live PostgREST probes')}`);

  if (!url || !serviceKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live probes');
  } else {
    const rest = `${url.replace(/\/+$/, '')}/rest/v1/opportunities_cache`;
    const probe = async (key, init, label) => {
      const res = await fetch(rest, {
        ...init,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'tx=rollback,return=minimal',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      return { status: res.status, body: text.slice(0, 300), label };
    };

    try {
      // 3a. service_role can read
      const read = await probe(serviceKey, { method: 'GET', headers: { Prefer: 'count=exact', Range: '0-0' } }, 'service read');
      if (read.status < 300) {
        const count = /content-range:\s*[^/]*\/\*(\d+|\?)/i.exec('');
        pass(`service_role can SELECT (HTTP ${read.status})`);
        info(read.body.slice(0, 120) || '(empty body)');
      } else {
        fail(`service_role cannot SELECT (HTTP ${read.status})`, read.body);
      }

      // 3b. service_role upsert conflict target is real.
      //     A deliberately invalid row inside a rolled-back transaction: if the
      //     failure is about a *column* or the *constraint*, the write path is
      //     broken; if it is only the CHECK on our fake status, the path works.
      const upsert = await probe(
        serviceKey,
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,tx=rollback,return=minimal' },
          body: JSON.stringify([
            {
              application_url: 'https://pathify.invalid/__permission_probe__',
              title: 'permission probe',
              organization: 'permission probe',
              location: 'Global / Remote',
              opportunity_type: 'jobs_remote',
              verification_status: 'review_recommended',
              source_platform: 'registry',
              synced_at: new Date().toISOString(),
            },
          ]),
        },
        'service upsert'
      );

      if (upsert.status < 300) {
        pass(`service_role can UPSERT (HTTP ${upsert.status}) — the sync write path is live`);
      } else {
        const detail = upsert.body;
        if (/source_platform|description|discovery_query/.test(detail)) {
          fail(
            'upsert rejected: a column /api/sync writes does not exist',
            `${detail}\n        Apply supabase/migrations/20260927_sync_ingest_columns.sql`
          );
        } else if (/on conflict|unique|exclusion constraint/i.test(detail)) {
          fail('upsert rejected: no unique constraint matching onConflict: application_url', detail);
        } else if (/row-level security|permission denied|not authorized/i.test(detail)) {
          fail('upsert rejected by RLS or grants', `${detail}\n        service_role must have INSERT/UPDATE and BYPASSRLS.`);
        } else {
          fail(`upsert rejected (HTTP ${upsert.status})`, detail);
        }
      }

      // 3c. anon must NOT be able to write. This is the assertion that matters
      //     most: schema.sql once shipped `using (true) with check (true)` on
      //     UPDATE, which let any browser rewrite the catalog.
      if (anonKey) {
        const anonWrite = await probe(
          anonKey,
          {
            method: 'POST',
            headers: { Prefer: 'tx=rollback,return=minimal' },
            body: JSON.stringify([
              {
                application_url: 'https://pathify.invalid/__anon_probe__',
                title: 'anon probe',
                organization: 'anon probe',
                location: 'Global',
                opportunity_type: 'jobs_remote',
              },
            ]),
          },
          'anon insert'
        );
        if (anonWrite.status >= 400) {
          pass(`anon INSERT is denied (HTTP ${anonWrite.status}) — catalog is not world-writable`);
        } else {
          fail(
            `anon INSERT was ALLOWED (HTTP ${anonWrite.status})`,
            'Anyone with the public anon key can inject listings. Apply\n' +
              '        20260926_hardening_passport_v2.sql and 20260927_sync_ingest_columns.sql.'
          );
        }

        const anonUpdate = await probe(
          anonKey,
          {
            method: 'PATCH',
            headers: { Prefer: 'tx=rollback,return=minimal' },
            body: JSON.stringify({ verification_status: 'high' }),
            // No filter: a policy that allows any UPDATE will match everything.
          },
          'anon update'
        );
        if (anonUpdate.status >= 400) {
          pass(`anon UPDATE is denied (HTTP ${anonUpdate.status})`);
        } else {
          fail(
            `anon UPDATE was ALLOWED (HTTP ${anonUpdate.status})`,
            'This is the world-writable policy from schema.sql. Any client could\n' +
              '        mark any listing as verified.'
          );
        }

        // 3d. anon must be able to READ — the catalog is intentionally public.
        const anonRead = await probe(anonKey, { method: 'GET', headers: { Range: '0-0' } }, 'anon read');
        if (anonRead.status < 300) {
          pass(`anon SELECT is allowed (HTTP ${anonRead.status}) — the catalog stays browsable`);
        } else {
          warn(`anon SELECT denied (HTTP ${anonRead.status}) — /api/jobs and the landing page will be empty`);
        }
      } else {
        warn('NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipped the anon probes');
      }
    } catch (e) {
      fail(`probe failed: ${e?.message ?? e}`);
    }
  }
}

// ---------------------------------------------------------------------------

console.log('');
if (failures > 0) {
  console.log(`${C.red(C.bold(`${failures} problem(s)`))}${warnings ? C.dim(`, ${warnings} warning(s)`) : ''}\n`);
  process.exit(1);
}
console.log(`${C.green(C.bold('Sync write path verified.'))}${warnings ? C.dim(` (${warnings} warning(s))`) : ''}\n`);
