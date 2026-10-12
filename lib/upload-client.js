"use client";
// @ts-check
// The only thing the frontend calls to save (docs/ACTIONS_CONTRACT.md, BACKEND_PLAN.md §4.3).
import { sha256Hex } from "./hash.js";
import { prepareUpload, commitVersion } from "../app/actions/upload.js";

/** @template T @typedef {{ ok: true, data: T } | { ok: false, code: string, message: string }} Result */
/** @typedef {{ path: string, hash: string }} ManifestEntry */
/** @typedef {{ path: string, hash: string, size: number, body: Blob }} Hashed */

const PUT_CONCURRENCY = 4;

/**
 * Pure: which hashed changes become upserts, and which of those need bytes uploaded.
 * Unchanged paths are dropped; a hash already anywhere in the parent is reused without upload (F6).
 * @param {ManifestEntry[]} parentFiles
 * @param {Hashed[]} hashed
 */
export function planSave(parentFiles, hashed) {
  const byPath = new Map(parentFiles.map((f) => [f.path, f.hash]));
  const parentHashes = new Set(byPath.values());
  const upserts = hashed.filter((c) => byPath.get(c.path) !== c.hash);
  /** @type {Map<string, Hashed>} */
  const toUpload = new Map();
  for (const c of upserts) if (!parentHashes.has(c.hash)) toUpload.set(c.hash, c);
  return { upserts, toUpload: [...toUpload.values()] };
}

/**
 * @param {{ projectId: string, copyId: number|null, parentId: number|null, note: string,
 *           parentFiles: ManifestEntry[], changes: { path: string, file?: Blob, text?: string }[],
 *           deletes: string[], onProgress?: (done: number, total: number) => void }} input
 * @returns {Promise<Result<{ versionId: number }>>}
 */
export async function saveVersion({ projectId, copyId, parentId, note, parentFiles, changes, deletes, onProgress }) {
  const hashed = await Promise.all(
    changes.map(async (c) => {
      const body = c.file ?? new Blob([c.text ?? ""], { type: "text/plain" });
      return { path: c.path, hash: await sha256Hex(body), size: body.size, body };
    }),
  );
  const { upserts, toUpload } = planSave(parentFiles, hashed);
  if (upserts.length === 0 && deletes.length === 0) {
    return { ok: false, code: "NO_CHANGES", message: "Nothing changed since the last save." };
  }

  if (toUpload.length > 0) {
    const prep = await prepareUpload(toUpload.map(({ hash, size, path }) => ({ hash, size, path })));
    if (!prep.ok) return prep;
    const bodies = new Map(toUpload.map((c) => [c.hash, c.body]));
    const queue = [...prep.data.uploads];
    let done = 0;
    let failed = false;
    onProgress?.(0, queue.length);
    const total = queue.length;
    const worker = async () => {
      for (let u = queue.shift(); u && !failed; u = queue.shift()) {
        // Checksum (if any) is already in the URL query; never re-send it as a header.
        const res = await fetch(u.url, { method: "PUT", headers: u.headers, body: bodies.get(u.hash) }).catch(() => null);
        if (!res?.ok) failed = true;
        else onProgress?.(++done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PUT_CONCURRENCY, total) }, worker));
    if (failed) return { ok: false, code: "UPLOAD_FAILED", message: "A file failed to upload. Check your connection and try again." };
  }

  return commitVersion({
    projectId,
    copyId,
    parentId,
    note,
    upserts: upserts.map(({ path, hash, size }) => ({ path, hash, size })),
    deletes,
  });
}
