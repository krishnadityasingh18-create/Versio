// @ts-check
// Explore query + keyset cursor, shared by app/actions/explore.js and scripts/check-flow.mjs.
import { PROJECT_COLS } from "./common.js";

export const EXPLORE_PAGE = 24;

/** @typedef {"recent"|"stars"} ExploreSort */
/** @typedef {{ v: string|number, id: string }} ExploreKey  last row's sort value + id */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgREST timestamptz output, e.g. 2026-10-13T09:15:02.123456+00:00
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Opaque cursor: base64url JSON of the sort it belongs to and the last row's key.
 * @param {ExploreSort} sort @param {any} row a projects row (updated_at, star_count, id)
 */
export function encodeCursor(sort, row) {
  const v = sort === "stars" ? Number(row.star_count ?? 0) : row.updated_at;
  return Buffer.from(JSON.stringify({ s: sort, v, id: row.id })).toString("base64url");
}

/**
 * @param {string} cursor @param {ExploreSort} sort
 * @returns {ExploreKey|null} null when malformed or made for the other sort
 */
export function decodeCursor(cursor, sort) {
  try {
    const c = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!c || c.s !== sort || typeof c.id !== "string" || !UUID_RE.test(c.id)) return null;
    if (sort === "stars" ? !(Number.isSafeInteger(c.v) && c.v >= 0) : !(typeof c.v === "string" && TS_RE.test(c.v))) return null;
    return { v: c.v, id: c.id };
  } catch {
    return null;
  }
}

/**
 * Search text safe to embed in a PostgREST `or=(…ilike…)` filter: letters, digits, spaces,
 * apostrophes and hyphens; everything else (LIKE wildcards, PostgREST delimiters) becomes a space.
 * @param {string|undefined|null} q
 */
export function cleanQuery(q) {
  return (q ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Public projects, newest-updated or most-starred first, one page + 1 row (to detect a next page).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ q?: string, type?: string, sort: ExploreSort, after: ExploreKey|null }} opts
 */
export function exploreQuery(supabase, { q, type, sort, after }) {
  const col = sort === "stars" ? "star_count" : "updated_at";
  let query = supabase.from("projects").select(PROJECT_COLS).eq("visibility", "public");
  const text = cleanQuery(q);
  if (text) query = query.or(`title.ilike.*${text}*,description.ilike.*${text}*`);
  if (type) query = query.eq("type", type);
  if (after) {
    const v = sort === "stars" ? String(after.v) : `"${after.v}"`;
    query = query.or(`${col}.lt.${v},and(${col}.eq.${v},id.gt.${after.id})`);
  }
  return query.order(col, { ascending: false }).order("id", { ascending: true }).limit(EXPLORE_PAGE + 1);
}
