/**
 * Pathify universal security primitives.
 *
 * Single source of truth for outbound URL validation, HTML escaping and
 * PostgREST filter escaping. Deliberately free of Node-only imports so it can
 * be used from route handlers, server components and the client bundle alike.
 *
 * Server-only credential checks live in `lib/server-auth.ts`.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Control characters (incl. NUL) can be used to smuggle a scheme past naive
// prefix checks, e.g. "java\0script:". Rejected before any parsing happens.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /[\s]/,
  /[<>"'`\\]/,
  /\.\./,
];

/**
 * Validate and normalise a URL that originated outside our system (scrapers,
 * user input, webhooks). Returns `null` for anything that is not an absolute
 * http(s) URL — callers must treat `null` as "reject the record", never as
 * "clean it up and keep going".
 *
 * This is the primary defence against `javascript:` / `data:` stored XSS,
 * because the result is rendered as an `href` in the UI and in outbound email.
 */
export function sanitizeExternalUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  if (CONTROL_CHARS.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

  const host = parsed.hostname;
  if (!host) return null;
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) return null;

  // Credentials embedded in a URL are a phishing / confusion vector.
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';

  return parsed.toString();
}

/** Convenience wrapper for rendering: always yields a string, never `undefined`. */
export function safeHref(input: unknown, fallback = '#'): string {
  return sanitizeExternalUrl(input) ?? fallback;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

/**
 * Escape a value for interpolation into HTML text *or* a quoted attribute.
 *
 * Every dynamic value in an email template must pass through this. Our alert
 * emails embed both user-editable fields (name, skills) and third-party
 * scraped content (title, organization) — so an unescaped interpolation is an
 * injection sink owned by whoever published that listing.
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input).replace(/[&<>"'/`]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Truncate for display, then escape. Order matters: escape last. */
export function escapeTruncated(input: unknown, max = 120): string {
  const str = input === null || input === undefined ? '' : String(input);
  return escapeHtml(str.length > max ? `${str.slice(0, max - 1)}\u2026` : str);
}

/**
 * Escape characters that would break out of a PostgREST `or=()` / `eq=()`
 * filter expression. Without this a search term containing `,` or `.` rewrites
 * the filter, turning a search box into a query oracle.
 */
export function escapePostgrestFilterTerm(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[%_\\]/g, (c) => `\\${c}`)
    .replace(/[,().]/g, (c) => `\\${c}`)
    .slice(0, 100);
}
