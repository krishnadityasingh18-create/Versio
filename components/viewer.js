// @ts-nocheck
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, requireUser, AuthError } from "@/lib/supabase/server.js";

/** Signed-in user for this request, or null. Deduped per request. */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  try {
    const { uid } = await requireUser(supabase);
    const { data } = await supabase.from("profiles").select("username, display_name").eq("id", uid).maybeSingle();
    return { uid, username: data?.username ?? null, displayName: data?.display_name ?? null };
  } catch (err) {
    if (err instanceof AuthError) return null;
    throw err;
  }
});

/** Gate for app pages: no session -> /login, no username -> /onboarding. */
export async function requireViewer({ username = true } = {}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (username && !viewer.username) redirect("/onboarding");
  return viewer;
}
