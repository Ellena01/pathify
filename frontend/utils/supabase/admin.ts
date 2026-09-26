import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role (admin) Supabase client.
 *
 * ## Why this module exists
 *
 * Route handlers that need to bypass RLS used to call `createClient(url, key)`
 * inline and annotate their helper return types with `ReturnType<typeof
 * createClient>`. That annotation is wrong: `createClient` is *generic*, so
 * `ReturnType<...>` resolves the class's **default** type arguments
 * (`SupabaseClient<any, "public", "public", any, any>`) rather than the
 * arguments inferred at the call site. It is not the type it returns, so the
 * value failed to be assignable to it and the whole route failed to compile.
 *
 * ## Why the schema is declared as an open record
 *
 * This project has no generated `Database` types. Without one, supabase-js
 * 2.117 infers `Database = unknown` at the call site, which collapses the
 * per-table `Schema` generic to `never` and turns every `.select()` result row
 * into `never` — so `row.title`, `.update({...})` payloads and `.insert({...})`
 * payloads all error with "Property does not exist on type 'never'".
 *
 * Declaring the tables as an open `Record<string, …>` keeps the query builders
 * fully typed while leaving row *contents* loose, which is the honest state of
 * this codebase today: the schema is enforced by Postgres, and every handler
 * validates and narrows the values it reads. Swap in generated types from
 * `supabase gen types` and this file collapses to a one-line re-export.
 */

/**
 * Any Postgres row. Handlers narrow individual fields at the point of use.
 *
 * `any` rather than `unknown` is deliberate: row values flow straight into
 * `new Date(x)`, `escapeHtml(x)` and `Number(x)`, all of which reject
 * `unknown` and would need a cast at every one of the ~100 call sites. The
 * schema is enforced by Postgres; this type only has to not get in the way
 * until `supabase gen types` output replaces it wholesale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;

/** Must match supabase-js' `GenericRelationship` exactly, or embedded resource
 *  selects (`select('*, opportunities_cache(...)')`) fail to infer. */
export interface DbRelationship {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

export interface DbTable {
  Row: DbRow;
  Insert: DbRow;
  Update: DbRow;
  Relationships: DbRelationship[];
}

export interface DbView {
  Row: DbRow;
  Insert: DbRow;
  Update: DbRow;
  Relationships: DbRelationship[];
}

/**
 * Shape required by supabase-js' `GenericSchema`. Deliberately open: any table
 * name resolves, and no table name is rejected at compile time.
 */
export interface PathifySchema {
  Tables: Record<string, DbTable>;
  Views: Record<string, DbView>;
  Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
}

export interface PathifyDatabase {
  public: PathifySchema;
}

/** The concrete client type produced by {@link createAdminClient}. */
export type AdminClient = SupabaseClient<PathifyDatabase, 'public', 'public', PathifySchema>;

/**
 * Create a service-role client, or `null` when the environment is not
 * configured. Returning `null` (rather than throwing) lets each caller decide
 * whether missing configuration is a 500 or a degraded feature.
 *
 * Server-only: `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. Never import this from
 * a client component.
 */
export function createAdminClient(): AdminClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient<PathifyDatabase>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
