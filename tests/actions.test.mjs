// @ts-check
// Backend actions: row mappers and input validation. No network, no Next runtime: invalid input
// must return INVALID_INPUT before `run()` reaches the lazy import of lib/supabase/server.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byteaToHex, mapDbError, toCopy, toNotification, toProject, toRequestEvent, toRequestSummary, toVersion,
} from "../lib/actions/common.js";
import { createProject, getProject, getVersion, restoreVersion, updateProject } from "../app/actions/projects.js";
import { getCopy, makeCopy } from "../app/actions/copies.js";
import {
  getRequest, promoteCopy, resubmitRequest, reviewRequest, submitRequest,
} from "../app/actions/requests.js";
import { markNotificationsRead } from "../app/actions/notifications.js";

const HASH = "ab".repeat(32);
const UUID = "6f1c2a3e-8b4d-4c6e-9f1a-2b3c4d5e6f70";
const author = { id: UUID, username: "ann", display_name: "Ann" };

test("byteaToHex strips the PostgREST \\x prefix and lowercases", () => {
  assert.equal(byteaToHex("\\x" + HASH.toUpperCase()), HASH);
  assert.equal(byteaToHex(HASH), HASH);
});

test("toVersion zips file_paths + file_hashes into files[]", () => {
  const v = toVersion({
    id: "7", project_id: UUID, copy_id: null, parent_id: 3, note: null, created_at: "t", author,
    file_paths: ["a.txt", "b/c.md"], file_hashes: ["\\x" + HASH, "\\x" + "CD".repeat(32)],
  });
  assert.equal(v.id, 7);
  assert.equal(v.parent_id, 3);
  assert.equal(v.copy_id, null);
  assert.deepEqual(v.author, author);
  assert.deepEqual(v.files, [{ path: "a.txt", hash: HASH }, { path: "b/c.md", hash: "cd".repeat(32) }]);
});

test("toVersion without manifest columns yields files: []", () => {
  assert.deepEqual(toVersion({ id: 1, project_id: UUID, author }).files, []);
});

test("toCopy computes is_stale against the project's main", () => {
  const row = { id: 5, project_id: UUID, state: "private", base_version_id: 10, head_version_id: 12, created_at: "t", author };
  assert.equal(toCopy(row, 10).is_stale, false);
  assert.equal(toCopy(row, 11).is_stale, true);
  assert.equal(toCopy(row, null).is_stale, true);
  assert.equal(toCopy(row, 10).published_at, null);
});

test("toProject / toRequestSummary / toRequestEvent / toNotification shapes", () => {
  const p = toProject({ id: UUID, owner: null, title: "T", type: "code", visibility: "public", license: "mit",
    main_version_id: "9", created_at: "a", updated_at: "b" });
  assert.equal(p.main_version_id, 9);
  assert.deepEqual(p.owner, { id: "", username: null, display_name: null });
  assert.equal(p.description, null);

  const r = toRequestSummary({ id: "2", copy_id: "5", project_id: UUID, submitted_version_id: "12",
    status: "pending", created_at: "a", updated_at: "b", project: { title: "T" }, owner: author, contributor: author });
  assert.deepEqual([r.id, r.copy_id, r.submitted_version_id, r.project_title], [2, 5, 12, "T"]);
  assert.equal(toRequestSummary({ ...r, project: null }).project_title, "");

  const e = toRequestEvent({ id: 1, kind: "approved", version_id: null, created_at: "a", actor: author });
  assert.deepEqual([e.version_id, e.comment], [null, null]);

  const n = toNotification({ id: "4", type: "copy_promoted", ref_id: "5", payload: null, read: false, created_at: "a" });
  assert.deepEqual(n.payload, {});
  assert.equal(n.id, 4);
});

test("mapDbError maps RPC codes and hides everything else", () => {
  for (const code of ["NOT_AUTHORIZED", "COPY_FROZEN", "STALE_PARENT", "STALE_COPY", "QUOTA_EXCEEDED", "USERNAME_REQUIRED", "INVALID_STATE"]) {
    const r = mapDbError({ message: code, code: "P0001" });
    assert.equal(r.code, code);
    assert.ok(r.message.length > 0 && r.message !== code);
  }
  assert.equal(mapDbError({ message: 'relation "x" does not exist' }).code, "INTERNAL");
  assert.equal(mapDbError({ message: "NOT_AUTHORIZED but more" }).code, "INTERNAL");
  assert.equal(mapDbError(null).code, "INTERNAL");
});

/** @param {Promise<any>} p */
async function assertInvalid(p) {
  const r = await p;
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_INPUT");
  assert.equal(typeof r.message, "string");
}

const ok = { title: "T", description: null, type: "writing", visibility: "public", license: "cc_by" };

test("projects actions reject bad input before touching Supabase", async () => {
  /** @type {any} */ const any = createProject;
  await assertInvalid(any({ ...ok, title: "   " }));
  await assertInvalid(any({ ...ok, title: "x".repeat(121) }));
  await assertInvalid(any({ ...ok, type: "video" }));
  await assertInvalid(any({ ...ok, license: "gpl" }));
  await assertInvalid(any({ ...ok, description: "x".repeat(2001) }));
  await assertInvalid(any(undefined));
  await assertInvalid(/** @type {any} */ (updateProject)({ projectId: "nope" }));
  await assertInvalid(/** @type {any} */ (updateProject)({ projectId: UUID, visibility: "secret" }));
  await assertInvalid(/** @type {any} */ (restoreVersion)({ projectId: UUID, versionId: -1 }));
  await assertInvalid(/** @type {any} */ (restoreVersion)({ projectId: UUID, versionId: 1.5 }));
  await assertInvalid(getProject("not-a-uuid"));
  await assertInvalid(getVersion(0));
  await assertInvalid(/** @type {any} */ (getVersion)("12abc"));
  await assertInvalid(/** @type {any} */ (getVersion)(true));
});

test("copies actions reject bad input", async () => {
  await assertInvalid(makeCopy("123"));
  await assertInvalid(/** @type {any} */ (getCopy)(null));
  await assertInvalid(/** @type {any} */ (getCopy)("-3"));
});

test("requests actions reject bad input", async () => {
  await assertInvalid(/** @type {any} */ (submitRequest)({ copyId: "x" }));
  await assertInvalid(submitRequest({ copyId: 1, note: "x".repeat(2001) }));
  await assertInvalid(/** @type {any} */ (resubmitRequest)({}));
  await assertInvalid(/** @type {any} */ (reviewRequest)({ requestId: 1, decision: "merge" }));
  await assertInvalid(reviewRequest({ requestId: 1, decision: "approve", comment: "x".repeat(4001) }));
  await assertInvalid(/** @type {any} */ (promoteCopy)({ copyId: 1, acknowledgeStale: "yes" }));
  await assertInvalid(getRequest(0));
});

test("notifications actions reject bad input", async () => {
  await assertInvalid(/** @type {any} */ (markNotificationsRead)("1"));
  await assertInvalid(markNotificationsRead([1, -2]));
  await assertInvalid(markNotificationsRead(Array.from({ length: 501 }, (_, i) => i + 1)));
});

test("valid input outside a Next runtime returns a Result instead of throwing", async () => {
  const r = await getVersion(1);
  assert.equal(r.ok, false);
  assert.equal(/** @type {any} */ (r).code, "INTERNAL");
});
