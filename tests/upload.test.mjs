// @ts-check
// Validation paths of the upload actions (rejected before any Next-only import), browser hashing,
// and the client's save planning. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prepareUpload, commitVersion, getDownloadUrls } from "../app/actions/upload.js";
import { sha256Hex } from "../lib/hash.js";
import { planSave } from "../lib/upload-client.js";
import { MAX_FILE_BYTES, MAX_FILES_PER_VERSION } from "../lib/limits.js";

const H = "a".repeat(64);
const PID = "11111111-1111-1111-1111-111111111111";
const ok = { projectId: PID, copyId: null, parentId: null, note: "", upserts: [{ path: "a.txt", hash: H, size: 1 }], deletes: [] };

/** @param {any} r */
const code = (r) => (r.ok ? "OK" : r.code);

test("prepareUpload rejects bad input", async () => {
  assert.equal(code(await prepareUpload([])), "INVALID_INPUT");
  assert.equal(code(await prepareUpload([{ hash: H.toUpperCase(), size: 1, path: "a" }])), "INVALID_INPUT");
  assert.equal(code(await prepareUpload([{ hash: H, size: MAX_FILE_BYTES + 1, path: "a" }])), "INVALID_INPUT");
  assert.equal(code(await prepareUpload([{ hash: H, size: 1, path: "" }])), "INVALID_INPUT");
  const many = Array.from({ length: MAX_FILES_PER_VERSION + 1 }, () => ({ hash: H, size: 1, path: "a" }));
  assert.equal(code(await prepareUpload(many)), "INVALID_INPUT");
  // @ts-expect-error malformed
  assert.equal(code(await prepareUpload(null)), "INVALID_INPUT");
});

test("prepareUpload pre-checks quota without touching storage", async () => {
  const big = Array.from({ length: 21 }, (_, i) => ({ hash: i.toString(16).padStart(64, "0"), size: MAX_FILE_BYTES, path: `f${i}` }));
  assert.equal(code(await prepareUpload(big)), "QUOTA_EXCEEDED");
});

test("commitVersion rejects bad input", async () => {
  assert.equal(code(await commitVersion({ ...ok, projectId: "nope" })), "INVALID_INPUT");
  assert.equal(code(await commitVersion({ ...ok, copyId: 1.5 })), "INVALID_INPUT");
  assert.equal(code(await commitVersion({ ...ok, parentId: -1 })), "INVALID_INPUT");
  assert.equal(code(await commitVersion({ ...ok, note: "x".repeat(2001) })), "INVALID_INPUT");
  assert.equal(code(await commitVersion({ ...ok, upserts: [{ path: "a", hash: "zz", size: 1 }] })), "INVALID_INPUT");
  const dup = [{ path: "a", hash: H, size: 1 }, { path: "a", hash: H, size: 1 }];
  assert.equal(code(await commitVersion({ ...ok, upserts: dup })), "INVALID_INPUT");
  // @ts-expect-error malformed
  assert.equal(code(await commitVersion({ ...ok, deletes: "a" })), "INVALID_INPUT");
});

test("getDownloadUrls rejects bad ids", async () => {
  for (const bad of [0, -3, 1.2, NaN, "5", null]) {
    // @ts-expect-error malformed
    assert.equal(code(await getDownloadUrls(bad)), "INVALID_INPUT");
  }
});

test("sha256Hex matches node:crypto for strings and blobs (UTF-8)", async () => {
  const s = "héllo\n";
  const want = createHash("sha256").update(s, "utf8").digest("hex");
  assert.equal(await sha256Hex(s), want);
  assert.equal(await sha256Hex(new Blob([s])), want);
  assert.equal(await sha256Hex(""), createHash("sha256").digest("hex"));
});

test("planSave skips unchanged paths and reuses parent hashes without upload", () => {
  const body = new Blob([]);
  const parent = [{ path: "a.txt", hash: "1".repeat(64) }, { path: "b.txt", hash: "2".repeat(64) }];
  const { upserts, toUpload } = planSave(parent, [
    { path: "a.txt", hash: "1".repeat(64), size: 1, body }, // unchanged -> dropped
    { path: "c.txt", hash: "2".repeat(64), size: 1, body }, // copy of b -> upsert, no upload
    { path: "d.txt", hash: "3".repeat(64), size: 1, body }, // new
    { path: "e.txt", hash: "3".repeat(64), size: 1, body }, // same new bytes -> one upload
  ]);
  assert.deepEqual(upserts.map((u) => u.path), ["c.txt", "d.txt", "e.txt"]);
  assert.deepEqual(toUpload.map((u) => u.hash), ["3".repeat(64)]);
});
