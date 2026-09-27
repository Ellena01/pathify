#!/usr/bin/env node
/**
 * Trigger /api/sync and report what happened.
 *
 * The sync endpoint is the only writer of `opportunities_cache`, and it is
 * reachable three ways. This script is the manual/debug entry point for all of
 * them, so "the catalog is stale" becomes a two-second check instead of an
 * archaeology exercise.
 *
 *   node scripts/sync.mjs                     ingest whatever the dataset holds
 *   node scripts/sync.mjs --dry               read-only; verifies auth + schema
 *   node scripts/sync.mjs --trigger           start a new Apify run, then ingest
 *   node scripts/sync.mjs --trigger --wait    ...and poll until the run finishes
 *   node scripts/sync.mjs --query "react" --location Nigeria
 *                                             targeted crawl (implies --trigger)
 *
 * Configuration comes from the environment, in this order:
 *   1. explicit flags
 *   2. .env.local / .env (loaded here; Next.js loads it for the app, a bare
 *      node script does not)
 *   3. the real environment (Vercel, CI, your shell)
 *
 * Required: SYNC_URL (or VERCEL_URL), CRON_SECRET
 * Optional: APIFY_ACTOR_ID — without it `--trigger` is refused rather than
 *           silently degrading to a plain ingest of a stale dataset.
 *
 * Exit codes: 0 ok · 1 config missing · 2 auth rejected · 3 upstream error
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Minimal .env loader ----------------------------------------------------
// Deliberately not a dependency: this script has to run on a bare checkout with
// nothing but Node, which is exactly when you need it.

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment variables win over the file.
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, '.env.local'));
loadEnvFile(join(ROOT, '.env'));

// --- Argument parsing -------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
};

const DRY = flag('dry');
const TRIGGER = flag('trigger') || Boolean(option('query') || option('location') || option('category'));
const WAIT = flag('wait');
const MAX_WAIT_MS = Number(option('timeout') ?? 300_000);

// --- Config -----------------------------------------------------------------

const baseUrl = (
  option('url') ??
  process.env.SYNC_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  (process.env.NEXT_PUBLIC_SITE_URL ? `https://${process.env.NEXT_PUBLIC_SITE_URL}` : undefined) ??
  'http://localhost:3000'
).replace(/\/+$/, '');

const secret = process.env.CRON_SECRET;

const C = {
  dim: (s) => `\u001b[2m${s}\u001b[0m`,
  bold: (s) => `\u001b[1m${s}\u001b[0m`,
  green: (s) => `\u001b[32m${s}\u001b[0m`,
  red: (s) => `\u001b[31m${s}\u001b[0m`,
  yellow: (s) => `\u001b[33m${s}\u001b[0m`,
  cyan: (s) => `\u001b[36m${s}\u001b[0m`,
};

function fail(message, code) {
  console.error(`${C.red('error')} ${message}`);
  process.exit(code);
}

if (!secret) {
  fail(
    'CRON_SECRET is not set.\n' +
      '  Generate one:  openssl rand -hex 32\n' +
      '  Then set it in BOTH Vercel and the Apify Actor environment —\n' +
      '  the two must match or the webhook is rejected with 401.',
    1
  );
}

if (secret.length < 16) {
  fail(`CRON_SECRET is only ${secret.length} characters. \`authorizeCronRequest\` rejects anything under 16.`, 1);
}

if (TRIGGER && !process.env.APIFY_ACTOR_ID) {
  fail(
    '--trigger needs APIFY_ACTOR_ID (the `username/actor-name` form from `apify push`).\n' +
      '  Without it the request would silently degrade to re-ingesting a stale dataset,\n' +
      '  which looks like it worked and is the opposite of useful.',
    1
  );
}

console.log(`${C.bold('Pathify sync')}  ${C.dim(baseUrl + '/api/sync')}`);
console.log(
  C.dim(
    `mode: ${DRY ? 'dry-run (read-only)' : WAIT ? 'trigger + wait + ingest' : TRIGGER ? 'trigger + ingest' : 'ingest'}`
  )
);

// --- Request ----------------------------------------------------------------

/**
 * `dry` is not a mode the endpoint implements — it is our word for "send the
 * request and report, but do not expect data to change". The endpoint is
 * idempotent, so re-running it is safe either way; `dry` here only controls
 * whether we treat an empty dataset as an error worth reporting loudly.
 */
async function callSync(extraBody) {
  const url = `${baseUrl}/api/sync${TRIGGER && !DRY ? '?trigger=actor' : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        // The ONLY accepted credential. Header-presence checks are not
        // authentication and `authorizeCronRequest` deliberately rejects them.
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(extraBody ?? {}),
      signal: controller.signal,
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function report({ status, body }) {
  if (status === 401 || status === 500) {
    console.error(`${C.red(`HTTP ${status}`)} ${body?.error ?? ''}`);
    if (body?.reason) console.error(C.dim(`  reason: ${body.reason}`));
    if (body?.detail) console.error(C.dim(`  detail: ${body.detail}`));
    if (status === 401) {
      console.error(
        C.dim(
          '  The token was rejected. Check that CRON_SECRET in this shell matches the\n' +
            '  CRON_SECRET in the Vercel project for this environment.'
        )
      );
    }
    return 2;
  }

  if (status >= 400) {
    console.error(`${C.red(`HTTP ${status}`)} ${body?.error ?? ''}`);
    if (body?.detail) console.error(C.dim(`  detail: ${body.detail}`));
    if (/column .* does not exist/i.test(String(body?.detail ?? ''))) {
      console.error(
        C.yellow(
          '\n  A column is missing. Apply the latest migrations:\n' +
            '    supabase/migrations/20260926_hardening_passport_v2.sql\n' +
            '    supabase/migrations/20260927_sync_ingest_columns.sql'
        )
      );
    }
    return 3;
  }

  if (body?.synced === 0) {
    console.log(`${C.yellow('synced 0')} — ${body?.message ?? 'nothing ingested'}`);
    if (body?.rejected && Object.keys(body.rejected).length) {
      console.log(C.dim(`  rejected: ${JSON.stringify(body.rejected)}`));
    }
    if (body?.triggered && !body.triggered.ok) {
      console.log(C.yellow(`  actor trigger: ${body.triggered.detail}`));
    }
    console.log(
      C.dim(
        '  If the dataset should not be empty, run an actor first:\n' +
          '    node scripts/sync.mjs --trigger --wait'
      )
    );
    return 0;
  }

  console.log(`${C.green(`synced ${body.synced}`)} ${C.dim(`(received ${body.received ?? '?'})`)}`);
  if (body.duplicates) {
    const { exact = 0, fuzzy = 0 } = body.duplicates;
    console.log(C.dim(`  deduped: ${exact} exact, ${fuzzy} cross-source (Google/LinkedIn/web)`));
  }
  if (body.rejected && Object.keys(body.rejected).length) {
    console.log(C.dim(`  rejected: ${JSON.stringify(body.rejected)}`));
  }
  if (body.triggered?.ok) console.log(C.dim(`  actor: ${body.triggered.detail}`));
  return 0;
}

// --- Wait for the actor run to finish ---------------------------------------

async function waitForIngestion() {
  const deadline = Date.now() + MAX_WAIT_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const wait = Math.min(15_000, 3_000 * attempt);
    process.stdout.write(C.dim(`  waiting ${Math.round(wait / 1000)}s for the actor run…\r`));
    await new Promise((r) => setTimeout(r, wait));

    const { status, body } = await callSync();
    if (body?.synced > 0) {
      process.stdout.write(' '.repeat(60) + '\r');
      return report({ status, body });
    }
  }

  console.log(C.yellow(`\n  gave up after ${Math.round(MAX_WAIT_MS / 1000)}s`));
  return 0;
}

// --- Main -------------------------------------------------------------------

const requestBody = {};
if (TRIGGER) {
  if (option('query')) requestBody.queries = [option('query')];
  if (option('category')) requestBody.categories = [option('category')];
  if (option('location')) requestBody.locations = [option('location')];
}

try {
  if (TRIGGER && WAIT) {
    process.exit(await waitForIngestion());
  }
  process.exit(report(await callSync(requestBody)));
} catch (e) {
  if (e?.name === 'AbortError') {
    fail('Request timed out after 120s. The sync has maxDuration=300; check Vercel function logs.', 3);
  }
  fail(`Could not reach ${baseUrl}: ${e?.message ?? e}`, 3);
}
