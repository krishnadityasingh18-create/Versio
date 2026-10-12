// @ts-check
// Pure storage helpers: no `server-only`, no SDK, no env. Importable from `node --test`
// (same split as lib/supabase/claims.js). lib/storage/index.js builds on these.
import { GET_URL_WINDOW_SECONDS } from "../limits.js";

export const HASH_RE = /^[0-9a-f]{64}$/;

/** @param {string} hashHex */
function assertHash(hashHex) {
  if (!HASH_RE.test(hashHex)) throw new Error("hash must be lowercase 64-char hex");
}

/** @param {string} uid @param {string} hashHex */
export function stagingKey(uid, hashHex) {
  if (!/^[0-9a-f-]{36}$/i.test(uid)) throw new Error("uid must be a uuid");
  assertHash(hashHex);
  return `staging/${uid}/${hashHex}`;
}

/** @param {string} hashHex */
export function objectKey(hashHex) {
  assertHash(hashHex);
  return `objects/${hashHex}`;
}

/** Hex digest -> base64 of the raw digest (what x-amz-checksum-sha256 wants). @param {string} hashHex */
export function hexToBase64(hashHex) {
  assertHash(hashHex);
  return Buffer.from(hashHex, "hex").toString("base64");
}

/** @param {string} b64 */
export function base64ToHex(b64) {
  return Buffer.from(b64, "base64").toString("hex");
}

/**
 * PostgREST renders bytea as "\\x<hex>". Returns lowercase hex.
 * @param {string} value
 */
export function byteaToHex(value) {
  return (value.startsWith("\\x") ? value.slice(2) : value).toLowerCase();
}

/** @param {string} hashHex */
export function hexToBytea(hashHex) {
  assertHash(hashHex);
  return `\\x${hashHex}`;
}

/**
 * Start of the current signing window, so a GET URL is byte-identical within the hour (§4.4).
 * @param {number} [nowMs]
 */
export function signingWindowStart(nowMs = Date.now()) {
  const windowMs = GET_URL_WINDOW_SECONDS * 1000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/** Types a browser may render inline. Everything else downloads (stored-XSS guard, §4.4). */
export const INLINE_TYPES = new Set(["text/plain", "image/png", "image/jpeg", "model/stl"]);

const TEXT_EXT = new Set(
  ("txt md markdown rst csv tsv json yml yaml toml ini cfg log tex bib " +
    "js mjs cjs jsx ts tsx py rb go rs java kt c h cc cpp hpp cs swift php lua r sql sh bash ps1 css scss")
    .split(" "),
);

/**
 * Content type served for a file path. Text-like code is served as text/plain (never text/html,
 * never image/svg+xml); unknown types are opaque octet-streams.
 * @param {string} path
 */
export function contentTypeFor(path) {
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "stl") return "model/stl";
  if (TEXT_EXT.has(ext)) return "text/plain";
  return "application/octet-stream";
}

/**
 * Content-Disposition for a GET: inline only for the allow-list, attachment otherwise.
 * @param {string} filename
 * @param {string} contentType
 */
export function contentDisposition(filename, contentType) {
  const kind = INLINE_TYPES.has(contentType) ? "inline" : "attachment";
  const base = filename.split("/").pop() || "file";
  const ascii = base.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

/**
 * Response Content-Type override: never echo a renderable type we don't allow inline.
 * @param {string} contentType
 */
export function responseContentType(contentType) {
  if (contentType === "text/plain") return "text/plain; charset=utf-8";
  return INLINE_TYPES.has(contentType) ? contentType : "application/octet-stream";
}
