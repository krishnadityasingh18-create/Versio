"use server";
// @ts-check
// Contract: docs/ACTIONS_CONTRACT.md (Phase 2, backend2). Query + cursor: lib/actions/explore.js.
import { z } from "zod";
import { failCode, mapDbError, ok, run, toProject, withStarred } from "../../lib/actions/common.js";
import { EXPLORE_PAGE, decodeCursor, encodeCursor, exploreQuery } from "../../lib/actions/explore.js";

/** @typedef {import("../../lib/actions/common.js").Project} Project */
/** @template T @typedef {import("../../lib/actions/common.js").Result<T>} Result */

const exploreSchema = z.object({
  q: z.string().max(200).optional(),
  type: z.enum(["writing", "code", "cad"]).optional(),
  sort: z.enum(["recent", "stars"]).default("recent"),
  cursor: z.string().max(500).nullish(),
}).default({ sort: "recent" });

/**
 * Public projects, 24 per page. Works signed out. `nextCursor` is opaque; pass it back with the
 * same q/type/sort to get the next page.
 * @param {{ q?: string, type?: "writing"|"code"|"cad", sort?: "recent"|"stars", cursor?: string|null }} [input]
 * @returns {Promise<Result<{ projects: Project[], nextCursor: string|null }>>}
 */
export async function getExplore(input) {
  return run(exploreSchema, input, async ({ supabase, uid }, d) => {
    const after = d.cursor ? decodeCursor(d.cursor, d.sort) : null;
    if (d.cursor && !after) return failCode("INVALID_INPUT");
    const { data, error } = await exploreQuery(supabase, { q: d.q, type: d.type, sort: d.sort, after });
    if (error) return mapDbError(error);
    const rows = data ?? [];
    const page = rows.slice(0, EXPLORE_PAGE);
    return ok({
      projects: await withStarred(supabase, uid, page.map(toProject)),
      nextCursor: rows.length > EXPLORE_PAGE ? encodeCursor(d.sort, page[page.length - 1]) : null,
    });
  }, { auth: "optional" });
}
