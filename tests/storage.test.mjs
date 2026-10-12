// @ts-check
// Pure storage helpers + presigned URL shape. No network: presigning is local math.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  stagingKey,
  objectKey,
  hexToBase64,
  base64ToHex,
  byteaToHex,
  hexToBytea,
  signingWindowStart,
  contentTypeFor,
  contentDisposition,
  responseContentType,
} from "../lib/storage/keys.js";

const H = createHash("sha256").update("hello").digest("hex");
const UID = "11111111-1111-1111-1111-111111111111";

test("keys", () => {
  assert.equal(stagingKey(UID, H), `staging/${UID}/${H}`);
  assert.equal(objectKey(H), `objects/${H}`);
  assert.throws(() => objectKey(H.toUpperCase()));
  assert.throws(() => objectKey("../x"));
  assert.throws(() => stagingKey("../../objects", H));
});

test("hex <-> base64 is the raw digest, not the hex text", () => {
  assert.equal(hexToBase64(H), createHash("sha256").update("hello").digest("base64"));
  assert.equal(base64ToHex(hexToBase64(H)), H);
});

test("bytea <-> hex", () => {
  assert.equal(byteaToHex(`\\x${H.toUpperCase()}`), H);
  assert.equal(hexToBytea(H), `\\x${H}`);
});

test("signing window floors to the hour", () => {
  const t = Date.UTC(2026, 9, 13, 14, 37, 12);
  assert.equal(signingWindowStart(t).toISOString(), "2026-10-13T14:00:00.000Z");
  assert.equal(signingWindowStart(t).getTime(), signingWindowStart(Date.UTC(2026, 9, 13, 14, 59, 59)).getTime());
});

test("content type and disposition: only the allow-list is inline", () => {
  assert.equal(contentTypeFor("a/b/notes.MD"), "text/plain");
  assert.equal(contentTypeFor("x.png"), "image/png");
  assert.equal(contentTypeFor("part.stl"), "model/stl");
  assert.equal(contentTypeFor("evil.html"), "application/octet-stream");
  assert.equal(contentTypeFor("logo.svg"), "application/octet-stream");
  assert.equal(contentTypeFor("Makefile"), "application/octet-stream");

  assert.match(contentDisposition("dir/a.txt", "text/plain"), /^inline; filename="a.txt"/);
  assert.match(contentDisposition("evil.html", "application/octet-stream"), /^attachment;/);
  const odd = contentDisposition('na"me\\é.txt', "text/plain");
  assert.match(odd, /filename="na_me__\.txt"/);
  assert.match(odd, /filename\*=UTF-8''na%22me%5C%C3%A9\.txt/);

  assert.equal(responseContentType("text/plain"), "text/plain; charset=utf-8");
  assert.equal(responseContentType("text/html"), "application/octet-stream");
});

// lib/storage/index.js imports `server-only`, which is a no-op under the react-server condition.
// Presigning needs no network, so this checks the real URLs the browser will get.
const presignScript = `
const s = await import("./lib/storage/index.js");
const put = await s.presignPut(s.stagingKey("${UID}", "${H}"), { size: 5, sha256Hex: "${H}" });
const g1 = await s.presignGet(s.objectKey("${H}"), { filename: "x.html", contentType: "application/octet-stream" });
const g2 = await s.presignGet(s.objectKey("${H}"), { filename: "x.html", contentType: "application/octet-stream" });
console.log(JSON.stringify({ put, g1, g2 }));
`;

/** @param {string} verifies */
function presign(verifies) {
  const out = execFileSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", presignScript], {
    env: {
      ...process.env,
      S3_ENDPOINT: "https://example.storage.supabase.co/storage/v1/s3",
      S3_REGION: "ap-south-1",
      S3_ACCESS_KEY_ID: "test-key",
      S3_SECRET_ACCESS_KEY: "test-secret",
      S3_BUCKET: "versio",
      S3_VERIFIES_CHECKSUM: verifies,
    },
    encoding: "utf8",
  });
  return JSON.parse(out);
}

test("presignPut: path-style, signs content-length, checksum only when enforced, no extra crc32", () => {
  const r2 = presign("true");
  const u = new URL(r2.put.url);
  assert.equal(u.pathname, `/storage/v1/s3/versio/staging/${UID}/${H}`);
  assert.deepEqual(r2.put.headers, {});
  assert.equal(u.searchParams.get("x-amz-checksum-sha256"), hexToBase64(H));
  assert.match(u.searchParams.get("X-Amz-SignedHeaders") ?? "", /content-length/);
  assert.equal(u.searchParams.get("x-amz-checksum-crc32"), null);
  assert.equal(u.searchParams.get("X-Amz-Expires"), "600");

  const supa = new URL(presign("false").put.url);
  assert.equal(supa.searchParams.get("x-amz-checksum-sha256"), null);
  assert.match(supa.searchParams.get("X-Amz-SignedHeaders") ?? "", /content-length/);
});

test("presignGet: stable within the hour, attachment for non-allow-listed, 2h TTL", () => {
  const { g1, g2 } = presign("false");
  assert.equal(g1, g2);
  const u = new URL(g1);
  assert.match(u.searchParams.get("response-content-disposition") ?? "", /^attachment;/);
  assert.equal(u.searchParams.get("response-cache-control"), "private, max-age=3600, immutable");
  assert.equal(u.searchParams.get("X-Amz-Expires"), "7200");
  assert.match(u.searchParams.get("X-Amz-Date") ?? "", /T\d\d0000Z$/);
});
