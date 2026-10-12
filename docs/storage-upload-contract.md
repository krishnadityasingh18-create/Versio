# Storage and upload contract

Code: `lib/storage/index.js` (S3 adapter, server only), `lib/storage/keys.js` (pure helpers), `app/actions/upload.js`, `lib/upload-client.js`, `lib/hash.js`. Signatures: `docs/ACTIONS_CONTRACT.md`.

## Keys

| Key | Written by | Meaning |
|---|---|---|
| `staging/<uid>/<hashhex>` | browser, presigned PUT | caller's own upload; proves possession (F11). Expires via lifecycle rule (R2) |
| `objects/<hashhex>` | server, `CopyObject` from staging | the blob; one per hash, shared across users. `blobs.hash` is the same bytes |

Hashes are lowercase 64-char hex everywhere in JS. PostgREST returns `bytea` as `\x<hex>` (`byteaToHex` / `hexToBytea`).

## Signing

- **PUT** (10 min, `PUT_URL_TTL_SECONDS`): signs `Content-Length`. When `S3_VERIFIES_CHECKSUM=true` it also signs `x-amz-checksum-sha256` = base64 of the raw digest; the presigner puts it in the query string, so the browser sends only the returned `headers` (currently `{}`) and never re-sends the checksum as a header. The SDK runs with `requestChecksumCalculation: "WHEN_REQUIRED"` so no stray `x-amz-checksum-crc32` of an empty body ends up in the URL.
- **GET**: signed at the start of the current hour (`GET_URL_WINDOW_SECONDS`), valid 2 h (`GET_URL_TTL_SECONDS`), so the same file has the same URL within the hour. `response-cache-control: private, max-age=3600, immutable`. `response-content-disposition` is `inline` only for `text/plain`, `image/png`, `image/jpeg`, `model/stl`; everything else (HTML, SVG, unknown) is `attachment` with `application/octet-stream`. Code and prose extensions are served as `text/plain; charset=utf-8`.

## Save pipeline

1. Browser hashes changed files, drops paths whose hash equals the parent's, and uploads only hashes not already in the parent manifest.
2. `prepareUpload` validates (≤25 MB/file, ≤1000 files, quota pre-check) and returns one presigned PUT per unique hash. No DB call.
3. Browser PUTs bytes (4 in parallel).
4. `commitVersion`: reads the parent manifest with the user's client (RLS). For each upsert hash not in it: `HEAD staging/<uid>/<hash>` (missing → `HASH_NOT_VERIFIED`); size taken from storage; if `S3_VERIFIES_CHECKSUM !== "true"`, the staged bytes are re-hashed server-side and a mismatch → `HASH_NOT_VERIFIED`. Then `CopyObject` staging → objects, then `commit_version` via the service role with `p_actor` from `requireUser()`.

## Env

| Var | Supabase Storage (tonight) | Cloudflare R2 (later) |
|---|---|---|
| `S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` | `https://<account>.r2.cloudflarestorage.com` |
| `S3_REGION` | project region, e.g. `ap-south-1` | `auto` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Storage → S3 access keys | R2 API token (Object Read & Write, this bucket) |
| `S3_BUCKET` | private bucket name | bucket name |
| `S3_VERIFIES_CHECKSUM` | `false` (server re-hashes) | `true` (only after `npm run spike:r2` check 1 passes) |

Path-style addressing is always on. Supabase setup: create a **private** bucket, enable the S3 protocol, and allow the app origin in CORS for browser `PUT`/`GET` (unverified: whether Supabase's S3 endpoint returns CORS headers for presigned URLs; check in the browser on first deploy). Supabase has no lifecycle rules, so `staging/` is not auto-cleaned there.

## Switching to R2

1. Create the bucket and token per `docs/r2-setup.md`; run `npm run r2:config` (lifecycle + CORS) and `npm run spike:r2` (all four checks pass).
2. One-off copy of the existing blobs (staging is disposable, skip it), e.g. with rclone configured for both remotes:
   `rclone copy supabase:<bucket>/objects r2:<bucket>/objects --checksum`
   Then compare counts: `rclone size` on both sides, and `select count(*) from blobs` must match.
3. Change the five `S3_*` vars above to the R2 values and set `S3_VERIFIES_CHECKSUM=true`. Redeploy. No code or DB change: keys and hashes are identical.
4. Keep the Supabase bucket read-only for a few days, then delete it.

During step 2-3, saves can create objects in Supabase after the copy started; run the `rclone copy` once more after the env switch to pick them up (it skips what already exists).
