// @ts-check
import "server-only";
import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PUT_URL_TTL_SECONDS, GET_URL_TTL_SECONDS } from "../limits.js";
import {
  stagingKey,
  objectKey,
  hexToBase64,
  signingWindowStart,
  contentDisposition,
  responseContentType,
} from "./keys.js";

export { stagingKey, objectKey };

// S3-compatible adapter (Supabase Storage S3 endpoint tonight, R2 later): env only.
// See docs/storage-upload-contract.md.

/** @param {string} name */
function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** True when the store enforces the signed x-amz-checksum-sha256 (R2). */
export function verifiesChecksum() {
  return process.env.S3_VERIFIES_CHECKSUM === "true";
}

/** @type {S3Client | null} */
let cached = null;

function client() {
  if (cached) return cached;
  cached = new S3Client({
    endpoint: env("S3_ENDPOINT"),
    region: env("S3_REGION"),
    credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
    forcePathStyle: true, // Supabase's S3 endpoint needs path-style; R2 accepts it.
    // Without these the SDK adds an x-amz-checksum-crc32 of the *empty* body to presigned PUTs,
    // and non-AWS stores may reject the extra checksum headers.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return cached;
}

const bucket = () => env("S3_BUCKET");

/**
 * Presigned PUT that signs Content-Length (and, where enforced, the SHA-256). The browser
 * sends `headers` as-is; the checksum rides in the query string, never as a header.
 * @param {string} key
 * @param {{ size: number, sha256Hex: string }} opts
 * @returns {Promise<{ url: string, headers: Record<string, string> }>}
 */
export async function presignPut(key, { size, sha256Hex }) {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentLength: size,
    // Only sign the checksum where the store enforces it; otherwise commit re-hashes server-side
    // (and an unknown checksum param can't break uploads on a store that doesn't support it).
    ...(verifiesChecksum() ? { ChecksumSHA256: hexToBase64(sha256Hex) } : {}),
  });
  const url = await getSignedUrl(client(), cmd, { expiresIn: PUT_URL_TTL_SECONDS });
  return { url, headers: {} };
}

/**
 * Presigned GET, signed at the start of the hour so the URL is stable (browser-cacheable).
 * @param {string} key
 * @param {{ filename: string, contentType: string }} opts
 * @returns {Promise<string>}
 */
export function presignGet(key, { filename, contentType }) {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseCacheControl: "private, max-age=3600, immutable",
    ResponseContentDisposition: contentDisposition(filename, contentType),
    ResponseContentType: responseContentType(contentType),
  });
  return getSignedUrl(client(), cmd, { expiresIn: GET_URL_TTL_SECONDS, signingDate: signingWindowStart() });
}

/** @param {unknown} err */
function isNotFound(err) {
  const e = /** @type {{ name?: string, $metadata?: { httpStatusCode?: number } }} */ (err);
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * @param {string} key
 * @returns {Promise<{ size: number } | null>}
 */
export async function head(key) {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0 };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Server-side copy. Throws if the source is missing.
 * @param {string} srcKey
 * @param {string} dstKey
 */
export async function copy(srcKey, dstKey) {
  // Keys are hex/uuid/slashes only, so no URL-encoding is needed in CopySource.
  await client().send(new CopyObjectCommand({ Bucket: bucket(), Key: dstKey, CopySource: `${bucket()}/${srcKey}` }));
}

/** @param {string[]} keys */
export async function remove(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const Objects = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    await client().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects, Quiet: true } }));
  }
}

/**
 * Streams the object and returns its SHA-256 as lowercase hex.
 * Used only when S3_VERIFIES_CHECKSUM !== "true".
 * @param {string} key
 * @returns {Promise<string>}
 */
export async function readSha256(key) {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const hash = createHash("sha256");
  for await (const chunk of /** @type {AsyncIterable<Uint8Array>} */ (/** @type {unknown} */ (res.Body))) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
