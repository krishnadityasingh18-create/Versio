"use server";
// @ts-check
// Contract: docs/ACTIONS_CONTRACT.md (Phase 2, backend2). Helpers: lib/actions/common.js.
import { z } from "zod";
import {
  COPY_COLS, LIST_LIMIT, PROFILE_COLS, PROJECT_COLS,
  failCode, mapDbError, ok, run, toCopy, toProfile, toProject, withStarred,
} from "../../lib/actions/common.js";

/**
 * @typedef {import("../../lib/actions/common.js").Project} Project
 * @typedef {import("../../lib/actions/common.js").Copy} Copy
 * @typedef {import("../../lib/actions/common.js").ProfileRef} ProfileRef
 */
/** @template T @typedef {import("../../lib/actions/common.js").Result<T>} Result */

const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/);

/**
 * Public profile page: the user's public projects and published copies (newest LIST_LIMIT each).
 * Works signed out.
 * @param {string} username
 * @returns {Promise<Result<{ profile: ProfileRef & { tags: string[], created_at: string },
 *   projects: Project[], publishedCopies: (Copy & { project_title: string })[] }>>}
 */
export async function getProfile(username) {
  return run(usernameSchema, username, async ({ supabase, uid }, name) => {
    const p = await supabase.from("profiles").select(`${PROFILE_COLS},tags,created_at`).eq("username", name).maybeSingle();
    if (p.error) return mapDbError(p.error);
    if (!p.data) return failCode("NOT_FOUND");
    const id = p.data.id;

    const [projects, copies] = await Promise.all([
      supabase.from("projects").select(PROJECT_COLS).eq("owner_id", id).eq("visibility", "public")
        .order("updated_at", { ascending: false }).limit(LIST_LIMIT),
      // RLS hides published copies of projects the caller can't read.
      supabase.from("copies")
        .select(`${COPY_COLS},project:projects!copies_project_id_fkey(title,main_version_id)`)
        .eq("author_id", id).eq("state", "published")
        .order("published_at", { ascending: false }).limit(LIST_LIMIT),
    ]);
    const error = projects.error ?? copies.error;
    if (error) return mapDbError(error);

    return ok({
      profile: { ...toProfile(p.data), tags: p.data.tags ?? [], created_at: p.data.created_at },
      projects: await withStarred(supabase, uid, (projects.data ?? []).map(toProject)),
      publishedCopies: (copies.data ?? []).map((/** @type {any} */ row) => ({
        ...toCopy(row, row.project?.main_version_id == null ? null : Number(row.project.main_version_id)),
        project_title: row.project?.title ?? "",
      })),
    });
  }, { auth: "optional" });
}
