"use server";
// @ts-check
// Contract: docs/ACTIONS_CONTRACT.md (backend stream). Writes go through RPCs; reads are selects
// under the caller's RLS. Helpers and row mappers: lib/actions/common.js.
import { z } from "zod";
import {
  COPY_COLS, LIST_LIMIT, PROFILE_COLS, PROJECT_COLS, VERSION_COLS,
  callRpc, failCode, idSchema, mapDbError, ok, run, toCopy, toProfile, toProject, toVersion, uuidSchema, withStarred,
} from "../../lib/actions/common.js";

/**
 * @typedef {import("../../lib/actions/common.js").Project} Project
 * @typedef {import("../../lib/actions/common.js").Version} Version
 * @typedef {import("../../lib/actions/common.js").Copy} Copy
 * @typedef {import("../../lib/actions/common.js").ProfileRef} ProfileRef
 */
/** @template T @typedef {import("../../lib/actions/common.js").Result<T>} Result */

const typeSchema = z.enum(["writing", "code", "cad"]);
const visibilitySchema = z.enum(["public", "private"]);
const licenseSchema = z.enum(["cc_by", "cc_by_sa", "cc_by_nc", "mit", "all_rights_reserved"]);
const titleSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().max(2000).nullish();

const createSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  type: typeSchema,
  visibility: visibilitySchema,
  license: licenseSchema,
});

const updateSchema = z.object({
  projectId: uuidSchema,
  title: titleSchema.optional(),
  description: descriptionSchema,
  visibility: visibilitySchema.optional(),
  license: licenseSchema.optional(),
});

const restoreSchema = z.object({ projectId: uuidSchema, versionId: idSchema });

/**
 * @param {{ title: string, description?: string|null, type: "writing"|"code"|"cad",
 *   visibility: "public"|"private", license: Project["license"] }} input
 * @returns {Promise<Result<{ projectId: string }>>}
 */
export async function createProject(input) {
  return run(createSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "create_project", {
      p_title: d.title, p_description: d.description ?? null, p_type: d.type,
      p_visibility: d.visibility, p_license: d.license,
    });
    return r.ok ? ok({ projectId: String(r.data) }) : r;
  });
}

/**
 * @param {{ projectId: string, title?: string, description?: string|null,
 *   visibility?: "public"|"private", license?: Project["license"] }} input
 * @returns {Promise<Result<{}>>}
 */
export async function updateProject(input) {
  return run(updateSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "update_project", {
      p_project_id: d.projectId, p_title: d.title ?? null, p_description: d.description ?? null,
      p_visibility: d.visibility ?? null, p_license: d.license ?? null,
    });
    return r.ok ? ok({}) : r;
  });
}

/**
 * @param {{ projectId: string, versionId: number }} input
 * @returns {Promise<Result<{ versionId: number }>>}
 */
export async function restoreVersion(input) {
  return run(restoreSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "restore_version", { p_project_id: d.projectId, p_version_id: d.versionId });
    return r.ok ? ok({ versionId: Number(r.data) }) : r;
  });
}

/**
 * Caller's profile, own projects and own copies (newest first, LIST_LIMIT each).
 * @returns {Promise<Result<{ me: ProfileRef & { storage_used: number }, projects: Project[],
 *   copies: (Copy & { project_title: string })[] }>>}
 */
export async function getDashboard() {
  return run(z.undefined(), undefined, async ({ supabase, uid }) => {
    const [me, projects, copies] = await Promise.all([
      supabase.from("profiles").select(`${PROFILE_COLS},storage_used`).eq("id", uid).single(),
      supabase.from("projects").select(PROJECT_COLS).eq("owner_id", uid)
        .order("updated_at", { ascending: false }).limit(LIST_LIMIT),
      supabase.from("copies")
        .select(`${COPY_COLS},project:projects!copies_project_id_fkey(title,main_version_id)`)
        .eq("author_id", uid).order("id", { ascending: false }).limit(LIST_LIMIT),
    ]);
    const error = me.error ?? projects.error ?? copies.error;
    if (error) return mapDbError(error);
    return ok({
      me: { ...toProfile(me.data), storage_used: Number(me.data?.storage_used ?? 0) },
      projects: await withStarred(supabase, uid, (projects.data ?? []).map(toProject)),
      copies: (copies.data ?? []).map((/** @type {any} */ row) => ({
        ...toCopy(row, row.project?.main_version_id == null ? null : Number(row.project.main_version_id)),
        project_title: row.project?.title ?? "",
      })),
    });
  });
}

/**
 * Project page. Signed-out visitors can read public projects (RLS decides).
 * @param {string} projectId
 * @returns {Promise<Result<{ project: Project, isOwner: boolean, main: Version|null,
 *   history: { version: Version, promoted_by: ProfileRef, from_copy_id: number|null, created_at: string }[],
 *   othersCopies: Copy[], myCopies: Copy[] }>>}
 */
export async function getProject(projectId) {
  return run(uuidSchema, projectId, async ({ supabase, uid }, id) => {
    const p = await supabase.from("projects").select(PROJECT_COLS).eq("id", id).maybeSingle();
    if (p.error) return mapDbError(p.error);
    if (!p.data) return failCode("NOT_FOUND");
    const [project] = await withStarred(supabase, uid, [toProject(p.data)]);
    const isOwner = uid !== null && project.owner.id === uid;
    const mainId = project.main_version_id;

    // ponytail: history and copy lists cap at LIST_LIMIT newest; add a cursor arg when projects outgrow it.
    const [main, history, others, mine] = await Promise.all([
      mainId === null
        ? Promise.resolve({ data: null, error: null })
        : supabase.from("versions").select(VERSION_COLS).eq("id", mainId).maybeSingle(),
      supabase.from("main_history")
        .select(`from_copy_id,created_at,version:versions!main_history_version_id_fkey(${VERSION_COLS}),promoted_by:profiles!main_history_promoted_by_fkey(${PROFILE_COLS})`)
        .eq("project_id", id).order("id", { ascending: false }).limit(LIST_LIMIT),
      supabase.from("copies").select(COPY_COLS).eq("project_id", id)
        .in("state", isOwner ? ["published", "in_review"] : ["published"])
        .order("id", { ascending: false }).limit(LIST_LIMIT),
      uid === null
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("copies").select(COPY_COLS).eq("project_id", id).eq("author_id", uid)
          .order("id", { ascending: false }).limit(LIST_LIMIT),
    ]);
    const error = main.error ?? history.error ?? others.error ?? mine.error;
    if (error) return mapDbError(error);

    return ok({
      project,
      isOwner,
      main: main.data ? toVersion(main.data) : null,
      history: (history.data ?? []).filter((/** @type {any} */ h) => h.version).map((/** @type {any} */ h) => ({
        version: toVersion(h.version),
        promoted_by: toProfile(h.promoted_by),
        from_copy_id: h.from_copy_id == null ? null : Number(h.from_copy_id),
        created_at: h.created_at,
      })),
      othersCopies: (others.data ?? [])
        .filter((/** @type {any} */ c) => c.author?.id !== uid)
        .map((/** @type {any} */ c) => toCopy(c, mainId)),
      myCopies: (mine.data ?? []).map((/** @type {any} */ c) => toCopy(c, mainId)),
    });
  }, { auth: "optional" });
}

/**
 * @param {number} versionId
 * @returns {Promise<Result<{ version: Version }>>}
 */
export async function getVersion(versionId) {
  return run(idSchema, versionId, async ({ supabase }, id) => {
    const { data, error } = await supabase.from("versions").select(VERSION_COLS).eq("id", id).maybeSingle();
    if (error) return mapDbError(error);
    return data ? ok({ version: toVersion(data) }) : failCode("NOT_FOUND");
  }, { auth: "optional" });
}

/**
 * Stars or unstars a project the caller can read.
 * @param {string} projectId
 * @returns {Promise<Result<{ starred: boolean, star_count: number }>>}
 */
export async function toggleStar(projectId) {
  return run(uuidSchema, projectId, async ({ supabase }, id) => {
    const r = await callRpc(supabase, "toggle_star", { p_project_id: id });
    return r.ok ? ok({ starred: Boolean(r.data?.starred), star_count: Number(r.data?.star_count ?? 0) }) : r;
  });
}
