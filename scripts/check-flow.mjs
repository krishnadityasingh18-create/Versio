#!/usr/bin/env node
// @ts-check
// Two-account end-to-end check of the core flow (PRD §5) against a real Supabase:
//   A creates project → A saves main (commit_version, service role) → B makes copy → B saves →
//   B submits → A asks for changes → B saves + resubmits → A approves → A promotes.
//   P1: version numbers (incl. restore), star toggle, explore search + cursor, public profile.
// Reads use the same PostgREST selects and mappers as app/actions/* (lib/actions/common.js), so a
// wrong embed/FK name fails here. Run: `npm run check:flow` (reads .env.local).
// Exit 0 = all pass, 1 = a check failed, 2 = SKIPPED (env missing). Deletes its users and blobs.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  COPY_COLS, PROFILE_COLS, PROJECT_COLS, REQUEST_COLS, VERSION_COLS,
  toCopy, toProject, toRequestSummary, toVersion, withStarred,
} from "../lib/actions/common.js";
import { decodeCursor, encodeCursor, exploreQuery } from "../lib/actions/explore.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !anonKey || !serviceKey) {
  console.log("SKIPPED: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const password = `Pw-${randomBytes(9).toString("hex")}`;
/** @type {string[]} */ const createdUsers = [];
/** @type {string[]} */ const createdHashes = [];
let failures = 0;

/** @param {boolean} ok @param {string} label */
function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

/** @param {{ data: any, error: any }} r @param {string} what */
function must(r, what) {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** @param {string} tag */
async function makeUser(tag) {
  // admin.createUser (pre-confirmed) instead of auth.signUp: hosted projects require email confirmation.
  const email = `flow-${tag}-${stamp}@example.com`;
  const username = `flow_${tag}_${stamp}`.slice(0, 30);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  must(await client.auth.signInWithPassword({ email, password }), `sign in ${tag}`);
  must(await client.rpc("set_username", { p_username: username }), `username ${tag}`);
  return { id: data.user.id, client, username };
}

/** Service-role save, as app/actions/upload.js commitVersion does after verifying the upload. */
async function save(/** @type {string} */ actor, /** @type {string} */ projectId, /** @type {number|null} */ copyId,
  /** @type {number|null} */ parentId, /** @type {string} */ path) {
  const hash = randomBytes(32).toString("hex");
  createdHashes.push(hash);
  return admin.rpc("commit_version", {
    p_actor: actor, p_project_id: projectId, p_copy_id: copyId, p_parent_id: parentId, p_note: `save ${path}`,
    p_upserts: [{ path, hash }], p_deletes: [], p_verified: [{ hash, size: 5 }],
  });
}

const title = `Flow check ${stamp}`;
const anon = createClient(url, anonKey, { auth: { persistSession: false } });   // signed-out visitor

try {
  const a = await makeUser("a");
  const b = await makeUser("b");

  const projectId = String(must(await a.client.rpc("create_project", {
    p_title: title, p_description: null, p_type: "writing", p_visibility: "public", p_license: "cc_by",
  }), "create_project"));
  check(Boolean(projectId), "A creates a project");

  const v1 = Number(must(await save(a.id, projectId, null, null, "README.md"), "A saves main"));
  const proj = toProject(must(await b.client.from("projects").select(PROJECT_COLS).eq("id", projectId).single(), "read project"));
  check(proj.main_version_id === v1 && proj.owner.id === a.id, "B reads project with owner embed; main = v1");

  const copyId = Number(must(await b.client.rpc("make_copy", { p_project_id: projectId }), "make_copy"));
  const v2 = Number(must(await save(b.id, projectId, copyId, v1, "chapter.md"), "B saves copy"));
  const hiddenCopy = await a.client.from("copies").select("id").eq("id", copyId);
  check(hiddenCopy.data?.length === 0, "A cannot see B's private copy");

  const requestId = Number(must(await b.client.rpc("submit_request", { p_copy_id: copyId, p_note: "please" }), "submit"));
  const frozen = await save(b.id, projectId, copyId, v2, "late.md");
  check(frozen.error?.message === "COPY_FROZEN", "B cannot save while the request is pending (COPY_FROZEN)");

  const inbox = must(await a.client.from("review_requests").select(REQUEST_COLS).eq("owner_id", a.id), "A inbox");
  const summary = toRequestSummary(inbox[0]);
  check(inbox.length === 1 && summary.id === requestId && summary.project_title === title
    && summary.contributor.id === b.id && summary.submitted_version_id === v2, "A's inbox shows the request (embeds ok)");
  const submitted = must(await a.client.from("versions").select(VERSION_COLS).in("id", [v2, v1]), "A reads versions");
  const sv = toVersion(submitted.find((/** @type {any} */ v) => Number(v.id) === v2));
  check(sv.files.length === 2 && sv.files.every((f) => /^[0-9a-f]{64}$/.test(f.hash)), "A reads the submitted version's manifest as hex");

  must(await a.client.rpc("review_request", { p_request_id: requestId, p_decision: "request_changes", p_comment: "more" }), "request_changes");
  const v3 = Number(must(await save(b.id, projectId, copyId, v2, "chapter2.md"), "B saves during changes_requested"));
  must(await b.client.rpc("resubmit_request", { p_request_id: requestId, p_note: "done" }), "resubmit");
  const resub = must(await b.client.from("review_requests").select("status,submitted_version_id").eq("id", requestId).single(), "read request");
  check(resub.status === "pending" && Number(resub.submitted_version_id) === v3, "resubmit points the request at v3");

  must(await a.client.rpc("review_request", { p_request_id: requestId, p_decision: "approve", p_comment: null }), "approve");
  const events = must(await b.client.from("request_events")
    .select(`kind,actor:profiles!request_events_actor_id_fkey(${PROFILE_COLS})`).eq("request_id", requestId).order("id"), "events");
  check(events.map((/** @type {any} */ e) => e.kind).join(",") === "submitted,changes_requested,resubmitted,approved",
    "request events in order");

  const pubCopy = toCopy(must(await a.client.from("copies").select(COPY_COLS).eq("id", copyId).single(), "read copy"), v1);
  check(pubCopy.state === "published" && !pubCopy.is_stale && pubCopy.author.id === b.id, "copy published, not stale");

  must(await a.client.rpc("promote_copy", { p_copy_id: copyId, p_acknowledge_stale: false }), "promote");
  const after = must(await a.client.from("projects").select("main_version_id").eq("id", projectId).single(), "read main");
  check(Number(after.main_version_id) === v3, "promote makes v3 the main version");
  const history = must(await b.client.from("main_history")
    .select(`from_copy_id,version:versions!main_history_version_id_fkey(${VERSION_COLS}),promoted_by:profiles!main_history_promoted_by_fkey(${PROFILE_COLS})`)
    .eq("project_id", projectId).order("id", { ascending: false }), "history");
  check(history.length === 2 && Number(history[0].from_copy_id) === copyId && history[0].promoted_by.id === a.id,
    "main history records the promote (embeds ok)");

  const notes = must(await b.client.from("notifications").select("id,type").eq("user_id", b.id), "B notifications");
  check(notes.some((/** @type {any} */ n) => n.type === "copy_promoted"), "B was notified of the promote");
  must(await b.client.rpc("mark_notifications_read", { p_ids: notes.map((/** @type {any} */ n) => n.id) }), "mark read");
  const unread = await b.client.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
  check(unread.count === 0, "mark_notifications_read clears unread");

  // ===== P1 =====
  const numbered = must(await a.client.from("versions").select(VERSION_COLS).eq("project_id", projectId).order("id"), "numbers")
    .map(toVersion);
  check(numbered.map((/** @type {any} */ v) => v.number).join(",") === "1,2,3", "version numbers are 1,2,3 across main and copy");
  const v4 = Number(must(await a.client.rpc("restore_version", { p_project_id: projectId, p_version_id: v1 }), "restore"));
  const restored = toVersion(must(await a.client.from("versions").select(VERSION_COLS).eq("id", v4).single(), "read restored"));
  check(restored.number === 4, "restore_version gets the next number (4)");

  const on = must(await b.client.rpc("toggle_star", { p_project_id: projectId }), "star on");
  const seen = toProject(must(await anon.from("projects").select(PROJECT_COLS).eq("id", projectId).single(), "read star_count"));
  const [mine] = await withStarred(b.client, b.id, [seen]);
  check(on.starred === true && on.star_count === 1 && seen.star_count === 1 && mine.starred === true,
    "star on: starred, star_count 1 (visible signed out), withStarred marks it");
  const off = must(await b.client.rpc("toggle_star", { p_project_id: projectId }), "star off");
  const [unstarred] = await withStarred(b.client, b.id, [seen]);
  check(off.starred === false && off.star_count === 0 && unstarred.starred === false, "star off: star_count 0");

  for (const sort of /** @type {const} */ (["recent", "stars"])) {
    const found = must(await exploreQuery(anon, { q: String(stamp), sort, after: null }), `explore ${sort}`);
    const row = found.find((/** @type {any} */ r) => r.id === projectId);
    check(Boolean(row) && toProject(row).title === title, `explore (${sort}, signed out) finds the project by a title word`);
    if (!row) continue;
    const after = decodeCursor(encodeCursor(sort, row), sort);
    const next = must(await exploreQuery(anon, { q: String(stamp), sort, after }), `explore ${sort} next page`);
    check(after !== null && !next.some((/** @type {any} */ r) => r.id === projectId), `explore (${sort}) cursor skips past the project`);
  }

  const prof = must(await anon.from("profiles").select(`${PROFILE_COLS},tags,created_at`).eq("username", a.username).maybeSingle(), "profile");
  const profProjects = must(await anon.from("projects").select(PROJECT_COLS).eq("owner_id", prof?.id).eq("visibility", "public"), "profile projects");
  check(prof?.id === a.id && profProjects.some((/** @type {any} */ p) => p.id === projectId), "profile select returns the owner's public projects");
} catch (err) {
  console.log("FAIL  unexpected error:", err instanceof Error ? err.message : err);
  failures++;
} finally {
  for (const id of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`WARN  could not delete test user ${id}: ${error.message}`);
  }
  // Blobs outlive users (uploaded_by set null); remove the fake ones this run inserted.
  if (createdHashes.length) {
    const { error } = await admin.from("blobs").delete().in("hash", createdHashes.map((h) => `\\x${h}`));
    if (error) console.log(`WARN  could not delete test blobs: ${error.message}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll flow checks passed");
process.exit(failures ? 1 : 0);
