// @ts-check
// Shared helpers for the server actions in app/actions/{projects,copies,requests,notifications}.js.
// No top-level Next-only imports, so everything here except `run`'s session part is testable under
// `node --test` (same lazy-import approach as app/actions/auth.js).
import { z } from "zod";

// Shared input schemas. Numeric ids accept numeric strings too (route params).
export const idSchema = z.preprocess(
  (v) => (typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : v),
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
);
export const uuidSchema = z.uuid();
export const noteSchema = z.string().max(2000).nullish();

/**
 * @template T
 * @typedef {{ ok: true, data: T } | { ok: false, code: string, message: string }} Result
 */
/** @typedef {import("@supabase/supabase-js").SupabaseClient} SupabaseClient */
/** @typedef {{ id: string, username: string|null, display_name: string|null }} ProfileRef */
/** @typedef {{ path: string, hash: string }} ManifestEntry */
/** @typedef {"writing"|"code"|"cad"} ProjectType */
/**
 * @typedef {{ id: number, number: number, project_id: string, copy_id: number|null, parent_id: number|null,
 *   author: ProfileRef, note: string|null, created_at: string, files: ManifestEntry[] }} Version
 * @typedef {{ id: string, owner: ProfileRef, title: string, description: string|null,
 *   type: ProjectType, visibility: "public"|"private",
 *   license: "cc_by"|"cc_by_sa"|"cc_by_nc"|"mit"|"all_rights_reserved", main_version_id: number|null,
 *   created_at: string, updated_at: string, star_count: number, starred?: boolean }} Project
 * @typedef {{ id: number, project_id: string, author: ProfileRef, state: "private"|"in_review"|"published",
 *   base_version_id: number, head_version_id: number, published_at: string|null,
 *   created_at: string, is_stale: boolean }} Copy
 * @typedef {{ id: number, copy_id: number, project_id: string, project_title: string,
 *   project_type: ProjectType, owner: ProfileRef, contributor: ProfileRef, submitted_version_id: number,
 *   status: "pending"|"changes_requested"|"approved"|"rejected", created_at: string, updated_at: string }} RequestSummary
 * @typedef {{ id: number, actor: ProfileRef,
 *   kind: "submitted"|"changes_requested"|"resubmitted"|"approved"|"rejected",
 *   version_id: number|null, comment: string|null, created_at: string }} RequestEvent
 * @typedef {{ id: number, type: string, ref_id: string|null, payload: Record<string, unknown>,
 *   read: boolean, created_at: string }} Notification
 */

export const LIST_LIMIT = 50;

// PostgREST embed selects. FK names are Postgres defaults from 0001_schema.sql; explicit because
// several tables reference profiles/versions more than once.
export const PROFILE_COLS = "id,username,display_name";
export const VERSION_COLS = `id,number,project_id,copy_id,parent_id,note,created_at,file_paths,file_hashes,author:profiles!versions_author_id_fkey(${PROFILE_COLS})`;
export const VERSION_COLS_NO_FILES = `id,number,project_id,copy_id,parent_id,note,created_at,author:profiles!versions_author_id_fkey(${PROFILE_COLS})`;
export const PROJECT_COLS = `id,title,description,type,visibility,license,main_version_id,created_at,updated_at,star_count,owner:profiles!projects_owner_id_fkey(${PROFILE_COLS})`;
export const COPY_COLS = `id,project_id,state,base_version_id,head_version_id,published_at,created_at,author:profiles!copies_author_id_fkey(${PROFILE_COLS})`;
export const REQUEST_COLS = `id,copy_id,project_id,submitted_version_id,status,created_at,updated_at,project:projects!review_requests_project_id_fkey(title,type),owner:profiles!review_requests_owner_id_fkey(${PROFILE_COLS}),contributor:profiles!review_requests_contributor_id_fkey(${PROFILE_COLS})`;

/** @template T @param {T} data @returns {Result<T>} */
export const ok = (data) => ({ ok: true, data });
/** @param {string} code @param {string} message @returns {{ ok: false, code: string, message: string }} */
export const fail = (code, message) => ({ ok: false, code, message });

/** Codes raised by the RPCs in 0003/0005 (`raise exception 'CODE'`, SQLSTATE P0001) → user-safe text. */
export const RPC_ERROR_MESSAGES = /** @type {const} */ ({
  NOT_AUTHENTICATED: "Sign in first.",
  USERNAME_REQUIRED: "Pick a username first.",
  NOT_AUTHORIZED: "You can't do that here.",
  INVALID_STATE: "That can't be done right now.",
  INVALID_DECISION: "Unknown decision.",
  INVALID_VERSION: "That version can't be restored.",
  OWN_PROJECT: "You can't make a copy of your own project.",
  LICENSE_FORBIDS_COPY: "This project's license doesn't allow copies.",
  NO_MAIN_VERSION: "This project has nothing saved yet.",
  COPY_FROZEN: "This copy can't be changed right now.",
  STALE_PARENT: "Someone saved first. Reload and try again.",
  STALE_COPY: "This copy was made from an older version of the project.",
  QUOTA_EXCEEDED: "You're out of storage space.",
});

const MESSAGES = {
  ...RPC_ERROR_MESSAGES,
  UNAUTHENTICATED: "Sign in first.",
  INVALID_INPUT: "Check what you entered and try again.",
  NOT_FOUND: "Not found.",
  INTERNAL: "Something went wrong. Try again.",
};

/** @param {keyof typeof MESSAGES} code */
export const failCode = (code) => fail(code, MESSAGES[code]);

/**
 * Maps a supabase-js error to a failed Result. RPC codes come through as the error message
 * (exactly the code, since the RPCs raise `'CODE'` with no other text).
 * @param {unknown} error
 */
export function mapDbError(error) {
  const message = /** @type {{ message?: unknown }} */ (error ?? {}).message;
  const text = typeof message === "string" ? message.trim() : "";
  if (Object.hasOwn(RPC_ERROR_MESSAGES, text)) return failCode(/** @type {keyof typeof MESSAGES} */ (text));
  return failCode("INTERNAL");
}

/**
 * PostgREST returns bytea as "\\x<hex>"; contract hashes are lowercase hex without prefix.
 * @param {string} value
 */
export function byteaToHex(value) {
  return String(value).replace(/^\\x/, "").toLowerCase();
}

/** @param {any} p @returns {ProfileRef} */
export function toProfile(p) {
  return { id: p?.id ?? "", username: p?.username ?? null, display_name: p?.display_name ?? null };
}

/**
 * Zips `file_paths[]` + `file_hashes[]`. Rows selected without the arrays get `files: []`.
 * @param {any} row @returns {Version}
 */
export function toVersion(row) {
  const paths = /** @type {string[]} */ (row.file_paths ?? []);
  const hashes = /** @type {string[]} */ (row.file_hashes ?? []);
  return {
    id: Number(row.id),
    number: Number(row.number),
    project_id: row.project_id,
    copy_id: row.copy_id == null ? null : Number(row.copy_id),
    parent_id: row.parent_id == null ? null : Number(row.parent_id),
    author: toProfile(row.author),
    note: row.note ?? null,
    created_at: row.created_at,
    files: paths.map((path, i) => ({ path, hash: byteaToHex(hashes[i]) })),
  };
}

/** @param {any} row @returns {Project} */
export function toProject(row) {
  return {
    id: row.id,
    owner: toProfile(row.owner),
    title: row.title,
    description: row.description ?? null,
    type: row.type,
    visibility: row.visibility,
    license: row.license,
    main_version_id: row.main_version_id == null ? null : Number(row.main_version_id),
    created_at: row.created_at,
    updated_at: row.updated_at,
    star_count: Number(row.star_count ?? 0),
  };
}

/**
 * Sets `starred` on each project for a signed-in caller (one query for the whole list); signed-out
 * callers get the projects back unchanged. Throws on a database error (`run` maps it to INTERNAL).
 * @template {Project} P
 * @param {SupabaseClient} supabase @param {string|null} uid @param {P[]} projects
 * @returns {Promise<P[]>}
 */
export async function withStarred(supabase, uid, projects) {
  if (uid === null || projects.length === 0) return projects;
  const { data, error } = await supabase.from("stars").select("project_id")
    .eq("user_id", uid).in("project_id", projects.map((p) => p.id));
  if (error) throw new Error(error.message);
  const starred = new Set((data ?? []).map((/** @type {any} */ r) => r.project_id));
  return projects.map((p) => ({ ...p, starred: starred.has(p.id) }));
}

/**
 * @param {any} row
 * @param {number|null} mainVersionId the project's current main_version_id
 * @returns {Copy}
 */
export function toCopy(row, mainVersionId) {
  const base = Number(row.base_version_id);
  return {
    id: Number(row.id),
    project_id: row.project_id,
    author: toProfile(row.author),
    state: row.state,
    base_version_id: base,
    head_version_id: Number(row.head_version_id),
    published_at: row.published_at ?? null,
    created_at: row.created_at,
    is_stale: base !== mainVersionId,
  };
}

/** @param {any} row @returns {RequestSummary} */
export function toRequestSummary(row) {
  return {
    id: Number(row.id),
    copy_id: Number(row.copy_id),
    project_id: row.project_id,
    project_title: row.project?.title ?? "",
    project_type: row.project?.type,
    owner: toProfile(row.owner),
    contributor: toProfile(row.contributor),
    submitted_version_id: Number(row.submitted_version_id),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** @param {any} row @returns {RequestEvent} */
export function toRequestEvent(row) {
  return {
    id: Number(row.id),
    actor: toProfile(row.actor),
    kind: row.kind,
    version_id: row.version_id == null ? null : Number(row.version_id),
    comment: row.comment ?? null,
    created_at: row.created_at,
  };
}

/** @param {any} row @returns {Notification} */
export function toNotification(row) {
  return {
    id: Number(row.id),
    type: row.type,
    ref_id: row.ref_id ?? null,
    payload: row.payload ?? {},
    read: Boolean(row.read),
    created_at: row.created_at,
  };
}

/**
 * Validates input, resolves the caller's own anon-key Supabase client, runs `fn`, never throws.
 * `auth: "optional"` lets signed-out visitors read public data (uid = null; RLS still applies).
 *
 * @template S, T
 * @param {import("zod").ZodType<S>} schema
 * @param {unknown} input
 * @param {(ctx: { supabase: SupabaseClient, uid: string|null }, data: S) => Promise<Result<T>>} fn
 * @param {{ auth?: "required"|"optional" }} [opts]
 * @returns {Promise<Result<T>>}
 */
export async function run(schema, input, fn, opts = {}) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return failCode("INVALID_INPUT");
  try {
    const { createClient, requireUser, AuthError } = await import("../supabase/server.js");
    const supabase = await createClient();
    /** @type {string|null} */
    let uid = null;
    try {
      ({ uid } = await requireUser(supabase));
    } catch (err) {
      if (!(err instanceof AuthError)) throw err;
      if (opts.auth !== "optional") return failCode("UNAUTHENTICATED");
    }
    return await fn({ supabase, uid }, parsed.data);
  } catch (err) {
    console.error("[actions]", err instanceof Error ? err.message : err);
    return failCode("INTERNAL");
  }
}

/**
 * Calls a write RPC under the caller's session.
 * @param {SupabaseClient} supabase @param {string} name @param {Record<string, unknown>} args
 * @returns {Promise<Result<any>>}
 */
export async function callRpc(supabase, name, args) {
  const { data, error } = await supabase.rpc(name, args);
  return error ? mapDbError(error) : ok(data);
}
