"use server";
// @ts-check
// Contract: docs/ACTIONS_CONTRACT.md (backend stream). Live updates: the RPCs broadcast on the
// private channel user:<uid>; the client re-calls listNotifications() on any event.
import { z } from "zod";
import { LIST_LIMIT, callRpc, idSchema, mapDbError, ok, run, toNotification } from "../../lib/actions/common.js";

/** @typedef {import("../../lib/actions/common.js").Notification} Notification */
/** @template T @typedef {import("../../lib/actions/common.js").Result<T>} Result */

/**
 * Newest LIST_LIMIT notifications plus the total unread count.
 * @returns {Promise<Result<{ items: Notification[], unread: number }>>}
 */
export async function listNotifications() {
  return run(z.undefined(), undefined, async ({ supabase, uid }) => {
    const [items, unread] = await Promise.all([
      supabase.from("notifications").select("id,type,ref_id,payload,read,created_at")
        .eq("user_id", uid).order("id", { ascending: false }).limit(LIST_LIMIT),
      supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", uid).eq("read", false),
    ]);
    const error = items.error ?? unread.error;
    if (error) return mapDbError(error);
    return ok({ items: (items.data ?? []).map(toNotification), unread: unread.count ?? 0 });
  });
}

/**
 * @param {number[]} ids
 * @returns {Promise<Result<{}>>}
 */
export async function markNotificationsRead(ids) {
  return run(z.array(idSchema).max(500), ids, async ({ supabase }, list) => {
    if (list.length === 0) return ok({});
    const r = await callRpc(supabase, "mark_notifications_read", { p_ids: list });
    return r.ok ? ok({}) : r;
  });
}
