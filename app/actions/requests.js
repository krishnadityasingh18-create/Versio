"use server";
// @ts-check
// Contract: docs/ACTIONS_CONTRACT.md (backend stream). Helpers: lib/actions/common.js.
import { z } from "zod";
import {
  LIST_LIMIT, PROFILE_COLS, REQUEST_COLS, VERSION_COLS,
  callRpc, failCode, idSchema, mapDbError, noteSchema, ok, run, toRequestEvent, toRequestSummary, toVersion,
} from "../../lib/actions/common.js";

/**
 * @typedef {import("../../lib/actions/common.js").Version} Version
 * @typedef {import("../../lib/actions/common.js").RequestSummary} RequestSummary
 * @typedef {import("../../lib/actions/common.js").RequestEvent} RequestEvent
 */
/** @template T @typedef {import("../../lib/actions/common.js").Result<T>} Result */

const commentSchema = z.string().max(4000).nullish();
const submitSchema = z.object({ copyId: idSchema, note: noteSchema });
const resubmitSchema = z.object({ requestId: idSchema, note: noteSchema });
const reviewSchema = z.object({
  requestId: idSchema,
  decision: z.enum(["approve", "request_changes", "reject"]),
  comment: commentSchema,
});
const promoteSchema = z.object({ copyId: idSchema, acknowledgeStale: z.boolean().default(false) });

/**
 * @param {{ copyId: number, note?: string|null }} input
 * @returns {Promise<Result<{ requestId: number }>>}
 */
export async function submitRequest(input) {
  return run(submitSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "submit_request", { p_copy_id: d.copyId, p_note: d.note ?? null });
    return r.ok ? ok({ requestId: Number(r.data) }) : r;
  });
}

/**
 * @param {{ requestId: number, note?: string|null }} input
 * @returns {Promise<Result<{}>>}
 */
export async function resubmitRequest(input) {
  return run(resubmitSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "resubmit_request", { p_request_id: d.requestId, p_note: d.note ?? null });
    return r.ok ? ok({}) : r;
  });
}

/**
 * @param {{ requestId: number, decision: "approve"|"request_changes"|"reject", comment?: string|null }} input
 * @returns {Promise<Result<{}>>}
 */
export async function reviewRequest(input) {
  return run(reviewSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "review_request", {
      p_request_id: d.requestId, p_decision: d.decision, p_comment: d.comment ?? null,
    });
    return r.ok ? ok({}) : r;
  });
}

/**
 * Makes a published copy the new main. `STALE_COPY` when the copy's base is no longer main and
 * `acknowledgeStale` is false.
 * @param {{ copyId: number, acknowledgeStale: boolean }} input
 * @returns {Promise<Result<{}>>}
 */
export async function promoteCopy(input) {
  return run(promoteSchema, input, async ({ supabase }, d) => {
    const r = await callRpc(supabase, "promote_copy", {
      p_copy_id: d.copyId, p_acknowledge_stale: d.acknowledgeStale,
    });
    return r.ok ? ok({}) : r;
  });
}

/**
 * Requests to the caller's projects (incoming) and from the caller's copies (outgoing), newest first.
 * @returns {Promise<Result<{ incoming: RequestSummary[], outgoing: RequestSummary[] }>>}
 */
export async function getInbox() {
  return run(z.undefined(), undefined, async ({ supabase, uid }) => {
    // ponytail: newest LIST_LIMIT each; add a cursor arg when inboxes outgrow it.
    const [incoming, outgoing] = await Promise.all([
      supabase.from("review_requests").select(REQUEST_COLS).eq("owner_id", uid)
        .order("id", { ascending: false }).limit(LIST_LIMIT),
      supabase.from("review_requests").select(REQUEST_COLS).eq("contributor_id", uid)
        .order("id", { ascending: false }).limit(LIST_LIMIT),
    ]);
    const error = incoming.error ?? outgoing.error;
    if (error) return mapDbError(error);
    return ok({ incoming: (incoming.data ?? []).map(toRequestSummary), outgoing: (outgoing.data ?? []).map(toRequestSummary) });
  });
}

/**
 * Review screen. `submitted` / `base` are null when RLS hides them from the caller (e.g. the owner
 * after rejecting: the copy goes back to private) — see the contract change request.
 * @param {number} requestId
 * @returns {Promise<Result<{ request: RequestSummary, events: RequestEvent[], isOwner: boolean,
 *   submitted: Version|null, base: Version|null }>>}
 */
export async function getRequest(requestId) {
  return run(idSchema, requestId, async ({ supabase, uid }, id) => {
    const r = await supabase.from("review_requests")
      .select(`${REQUEST_COLS},copy:copies!review_requests_copy_id_fkey(base_version_id)`)
      .eq("id", id).maybeSingle();
    if (r.error) return mapDbError(r.error);
    if (!r.data) return failCode("NOT_FOUND");
    const request = toRequestSummary(r.data);
    const copyRow = /** @type {any} */ (r.data).copy;
    const baseId = copyRow?.base_version_id == null ? null : Number(copyRow.base_version_id);
    const ids = baseId === null ? [request.submitted_version_id] : [request.submitted_version_id, baseId];

    const [events, versions] = await Promise.all([
      supabase.from("request_events")
        .select(`id,kind,version_id,comment,created_at,actor:profiles!request_events_actor_id_fkey(${PROFILE_COLS})`)
        .eq("request_id", id).order("id", { ascending: true }),
      supabase.from("versions").select(VERSION_COLS).in("id", ids),
    ]);
    const error = events.error ?? versions.error;
    if (error) return mapDbError(error);
    const byId = new Map((versions.data ?? []).map((/** @type {any} */ v) => [Number(v.id), toVersion(v)]));

    return ok({
      request,
      events: (events.data ?? []).map(toRequestEvent),
      isOwner: request.owner.id === uid,
      submitted: byId.get(request.submitted_version_id) ?? null,
      base: baseId === null ? null : byId.get(baseId) ?? null,
    });
  });
}
