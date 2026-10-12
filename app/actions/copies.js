"use server";
// @ts-check
// Contract: docs/ACTIONS_CONTRACT.md (backend stream). Helpers: lib/actions/common.js.
import {
  COPY_COLS, LIST_LIMIT, PROJECT_COLS, REQUEST_COLS, VERSION_COLS, VERSION_COLS_NO_FILES,
  callRpc, failCode, idSchema, mapDbError, ok, run, toCopy, toProject, toRequestSummary, toVersion, uuidSchema,
} from "../../lib/actions/common.js";

/**
 * @typedef {import("../../lib/actions/common.js").Project} Project
 * @typedef {import("../../lib/actions/common.js").Version} Version
 * @typedef {import("../../lib/actions/common.js").Copy} Copy
 * @typedef {import("../../lib/actions/common.js").RequestSummary} RequestSummary
 */
/** @template T @typedef {import("../../lib/actions/common.js").Result<T>} Result */

/**
 * "Make my copy": private draft on top of the project's current main.
 * @param {string} projectId
 * @returns {Promise<Result<{ copyId: number }>>}
 */
export async function makeCopy(projectId) {
  return run(uuidSchema, projectId, async ({ supabase }, id) => {
    const r = await callRpc(supabase, "make_copy", { p_project_id: id });
    return r.ok ? ok({ copyId: Number(r.data) }) : r;
  });
}

/**
 * Copy page. `versions` are the copy's own saves, newest first, without files (load one with
 * getVersion). Signed-out visitors can read published copies of public projects.
 * @param {number} copyId
 * @returns {Promise<Result<{ copy: Copy, project: Project, isAuthor: boolean, isOwner: boolean,
 *   head: Version, versions: Version[], openRequest: RequestSummary|null }>>}
 */
export async function getCopy(copyId) {
  return run(idSchema, copyId, async ({ supabase, uid }, id) => {
    const c = await supabase.from("copies")
      .select(`${COPY_COLS},project:projects!copies_project_id_fkey(${PROJECT_COLS})`)
      .eq("id", id).maybeSingle();
    if (c.error) return mapDbError(c.error);
    // No row, or the project itself is no longer readable (made private).
    if (!c.data || !c.data.project) return failCode("NOT_FOUND");
    const project = toProject(c.data.project);
    const copy = toCopy(c.data, project.main_version_id);

    const [head, versions, request] = await Promise.all([
      supabase.from("versions").select(VERSION_COLS).eq("id", copy.head_version_id).maybeSingle(),
      supabase.from("versions").select(VERSION_COLS_NO_FILES).eq("copy_id", id)
        .order("id", { ascending: false }).limit(LIST_LIMIT),
      // RLS: only the owner and the contributor see requests; everyone else gets null.
      uid === null
        ? Promise.resolve({ data: null, error: null })
        : supabase.from("review_requests").select(REQUEST_COLS).eq("copy_id", id)
          .in("status", ["pending", "changes_requested"]).maybeSingle(),
    ]);
    const error = head.error ?? versions.error ?? request.error;
    if (error) return mapDbError(error);
    if (!head.data) return failCode("NOT_FOUND");

    return ok({
      copy,
      project,
      isAuthor: uid !== null && copy.author.id === uid,
      isOwner: uid !== null && project.owner.id === uid,
      head: toVersion(head.data),
      versions: (versions.data ?? []).map(toVersion),
      openRequest: request.data ? toRequestSummary(request.data) : null,
    });
  }, { auth: "optional" });
}
