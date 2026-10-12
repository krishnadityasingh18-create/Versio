"use server";
// @ts-check
// Upload/save pipeline (BACKEND_PLAN.md §4.3) and downloads (§4.4). Contract: docs/ACTIONS_CONTRACT.md.
//
// Next-only modules (lib/supabase/*, lib/storage/index.js — all `server-only`) are imported lazily
// inside each action, like app/actions/auth.js, so input validation stays testable under `node --test`.
import { z } from "zod";
import { MAX_FILE_BYTES, MAX_FILES_PER_VERSION, USER_QUOTA_BYTES } from "../../lib/limits.js";
import { HASH_RE, byteaToHex, hexToBytea, contentTypeFor } from "../../lib/storage/keys.js";

/** @template T @typedef {{ ok: true, data: T } | { ok: false, code: string, message: string }} Result */

const hash = z.string().regex(HASH_RE);
const path = z.string().min(1).max(1024);
const size = z.number().int().min(0).max(MAX_FILE_BYTES);
const id = z.number().int().positive();

const prepareSchema = z.array(z.object({ hash, size, path })).min(1).max(MAX_FILES_PER_VERSION);

const commitSchema = z.object({
  projectId: z.guid(),
  copyId: id.nullable(),
  parentId: id.nullable(),
  note: z.string().max(2000).default(""),
  upserts: z
    .array(z.object({ path, hash, size }))
    .max(MAX_FILES_PER_VERSION)
    .refine((u) => new Set(u.map((x) => x.path)).size === u.length, "duplicate path"),
  deletes: z.array(path).max(MAX_FILES_PER_VERSION),
});

/** RPC `RAISE ... 'CODE'` values passed through as-is; message is user-safe. */
const RPC_MESSAGES = /** @type {Record<string, string>} */ ({
  NOT_AUTHENTICATED: "Sign in first.",
  USERNAME_REQUIRED: "Pick a username first.",
  NOT_AUTHORIZED: "You can't save to this project.",
  COPY_FROZEN: "This copy can't be changed right now.",
  INVALID_PARENT: "That version doesn't belong to this project.",
  INVALID_MANIFEST: "Some files in this save are invalid.",
  HASH_NOT_VERIFIED: "A file didn't finish uploading. Try saving again.",
  QUOTA_EXCEEDED: "You're out of storage space.",
  TOO_MANY_FILES: `A version can have at most ${MAX_FILES_PER_VERSION} files.`,
  STALE_PARENT: "Someone saved first. Reload to get the latest version.",
});

/** @param {string} code @param {string} [message] @returns {{ ok: false, code: string, message: string }} */
const fail = (code, message) => ({ ok: false, code, message: message ?? RPC_MESSAGES[code] ?? "Something went wrong. Try again." });

const invalid = () => fail("INVALID_INPUT", "Some of the details are invalid.");

/** @param {unknown} err */
function mapError(err) {
  const e = /** @type {{ code?: unknown, message?: unknown }} */ (err);
  if (e && e.code === "UNAUTHENTICATED") return fail("UNAUTHENTICATED", "Sign in first."); // AuthError
  const message = typeof e?.message === "string" ? e.message : "";
  const code = Object.keys(RPC_MESSAGES).find((c) => message.includes(c));
  if (code === "NOT_AUTHENTICATED") return fail("UNAUTHENTICATED", RPC_MESSAGES[code]);
  if (code) return fail(code);
  console.error("upload action failed:", message || err);
  return fail("INTERNAL");
}

/**
 * Presigned PUTs to the caller's staging keys. No database call (§4.3 step 2).
 * @param {{ hash: string, size: number, path: string }[]} files
 * @returns {Promise<Result<{ uploads: { hash: string, url: string, headers: Record<string, string> }[] }>>}
 */
export async function prepareUpload(files) {
  const parsed = prepareSchema.safeParse(files);
  if (!parsed.success) return invalid();
  /** @type {Map<string, number>} */
  const unique = new Map(parsed.data.map((f) => [f.hash, f.size]));
  let total = 0;
  for (const s of unique.values()) total += s;
  // ponytail: cheap pre-check vs the whole quota; the real check (incl. storage_used) is in commit_version.
  if (total > USER_QUOTA_BYTES) return fail("QUOTA_EXCEEDED");

  try {
    const { requireUser } = await import("../../lib/supabase/server.js");
    const storage = await import("../../lib/storage/index.js");
    const { uid } = await requireUser();
    const uploads = await Promise.all(
      [...unique].map(async ([h, s]) => ({ hash: h, ...(await storage.presignPut(storage.stagingKey(uid, h), { size: s, sha256Hex: h })) })),
    );
    return { ok: true, data: { uploads } };
  } catch (err) {
    return mapError(err);
  }
}

/**
 * Verifies the caller's staged uploads, promotes new blobs to objects/, then runs commit_version.
 * @param {{ projectId: string, copyId: number|null, parentId: number|null, note: string,
 *           upserts: { path: string, hash: string, size: number }[], deletes: string[] }} input
 * @returns {Promise<Result<{ versionId: number }>>}
 */
export async function commitVersion(input) {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return invalid();
  const { projectId, copyId, parentId, note, upserts, deletes } = parsed.data;

  try {
    const { requireUser } = await import("../../lib/supabase/server.js");
    const { createClient: createAdmin } = await import("../../lib/supabase/admin.js");
    const storage = await import("../../lib/storage/index.js");
    const { supabase, uid } = await requireUser();

    // Parent manifest via the user's client: RLS decides what they may reuse (F6).
    /** @type {Set<string>} */
    let parentHashes = new Set();
    if (parentId !== null) {
      const { data, error } = await supabase
        .from("versions")
        .select("file_hashes")
        .eq("id", parentId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return fail("NOT_FOUND", "That version doesn't exist.");
      parentHashes = new Set(/** @type {string[]} */ (data.file_hashes).map(byteaToHex));
    }

    // Every hash not in the parent must be in *this caller's* staging area (F11). Size from storage.
    const fresh = [...new Set(upserts.map((u) => u.hash))].filter((h) => !parentHashes.has(h));
    const checkBytes = !storage.verifiesChecksum();
    // ponytail: unbounded Promise.all over ≤1000 hashes; add a small pool if the store throttles.
    const verified = await Promise.all(
      fresh.map(async (h) => {
        const key = storage.stagingKey(uid, h);
        const staged = await storage.head(key);
        if (!staged || staged.size > MAX_FILE_BYTES) return null;
        // Supabase Storage doesn't enforce the signed checksum, so prove the bytes match the hash (F5).
        if (checkBytes && (await storage.readSha256(key)) !== h) return null;
        return { hash: h, size: staged.size };
      }),
    );
    if (verified.some((v) => v === null)) return fail("HASH_NOT_VERIFIED");

    // ponytail: always copies (content-addressed, so overwriting is harmless) instead of asking the DB
    // whether the blob exists; an RPC failure after this leaves an unreferenced objects/<hash>
    // until a cleanup sweep exists.
    await Promise.all(fresh.map((h) => storage.copy(storage.stagingKey(uid, h), storage.objectKey(h))));

    const { data, error } = await createAdmin().rpc("commit_version", {
      p_actor: uid,
      p_project_id: projectId,
      p_copy_id: copyId,
      p_parent_id: parentId,
      p_note: note,
      p_upserts: upserts.map(({ path: p, hash: h }) => ({ path: p, hash: h })),
      p_deletes: deletes,
      p_verified: verified,
    });
    if (error) return mapError(error);
    return { ok: true, data: { versionId: Number(data) } };
  } catch (err) {
    return mapError(err);
  }
}

/**
 * Signed download URLs for a version the caller can read (RLS). Works for signed-out viewers of public projects.
 * @param {number} versionId
 * @returns {Promise<Result<{ files: { path: string, hash: string, size: number, url: string|null, blocked: boolean }[] }>>}
 */
export async function getDownloadUrls(versionId) {
  const parsed = id.safeParse(versionId);
  if (!parsed.success) return invalid();

  try {
    const { createClient } = await import("../../lib/supabase/server.js");
    const { createClient: createAdmin } = await import("../../lib/supabase/admin.js");
    const storage = await import("../../lib/storage/index.js");
    const supabase = await createClient();

    const { data: version, error } = await supabase
      .from("versions")
      .select("file_paths, file_hashes")
      .eq("id", parsed.data)
      .maybeSingle();
    if (error) throw error;
    if (!version) return fail("NOT_FOUND", "That version doesn't exist.");

    /** @type {string[]} */
    const paths = version.file_paths;
    const hashes = /** @type {string[]} */ (version.file_hashes).map(byteaToHex);

    // Clients can't read blobs; the service role can. Chunked to keep the PostgREST URL short.
    /** @type {Map<string, { size: number, blocked_at: string|null }>} */
    const blobs = new Map();
    const unique = [...new Set(hashes)];
    for (let i = 0; i < unique.length; i += 100) {
      const { data: rows, error: blobErr } = await createAdmin()
        .from("blobs")
        .select("hash, size, blocked_at")
        .in("hash", unique.slice(i, i + 100).map(hexToBytea));
      if (blobErr) throw blobErr;
      for (const r of rows ?? []) blobs.set(byteaToHex(r.hash), { size: Number(r.size), blocked_at: r.blocked_at });
    }

    const files = await Promise.all(
      paths.map(async (p, i) => {
        const h = hashes[i];
        const blob = blobs.get(h);
        const blocked = Boolean(blob?.blocked_at);
        const url =
          blob && !blocked
            ? await storage.presignGet(storage.objectKey(h), { filename: p, contentType: contentTypeFor(p) })
            : null;
        return { path: p, hash: h, size: blob?.size ?? 0, url, blocked };
      }),
    );
    return { ok: true, data: { files } };
  } catch (err) {
    return mapError(err);
  }
}
