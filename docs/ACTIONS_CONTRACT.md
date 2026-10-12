# Versio: Actions Contract (tonight-mvp)

The fixed interface between the three parallel workstreams. **Signatures here are frozen**: if you need a change, write it in the "Contract change requests" section at the bottom instead of editing another stream's file.

Stub files with these signatures (JSDoc + `throw new Error("NOT_IMPLEMENTED")`) are already committed. Each stream replaces the bodies of **its own** stubs only.

| Stream | Owns (may edit) | Must not edit |
|---|---|---|
| **storage** | `lib/storage/*`, `lib/hash.js`, `lib/upload-client.js`, `app/actions/upload.js`, `tests/storage*.test.mjs`, `tests/upload*.test.mjs`, `docs/storage-upload-contract.md` | `supabase/`, `app/` outside `app/actions/upload.js`, other actions |
| **backend** | `app/actions/projects.js`, `copies.js`, `requests.js`, `notifications.js`, `lib/actions/*` (shared helpers), `supabase/migrations/0006_*.sql`+, `tests/actions*.test.mjs` | `lib/storage/*`, `app/actions/upload.js`, UI |
| **frontend** | everything under `app/` **except** `app/actions/*` and `app/auth/callback/*`; `components/*`; Tailwind/PostCSS config; `package.json` (add deps only) | `lib/*`, `supabase/*`, `app/actions/*` |

Existing code (`lib/supabase/*`, `proxy.js`, `app/actions/auth.js`, migrations 0001–0005) is frozen for everyone.

---

## Result shape (all server actions)

```js
/** @template T @typedef {{ ok: true, data: T } | { ok: false, code: string, message: string }} Result */
```

- Never throw to the client; map errors to `{ ok: false, code, message }`.
- `code` is the RPC's error code when one was raised (`NOT_AUTHORIZED`, `COPY_FROZEN`, `STALE_PARENT`, `STALE_COPY`, `QUOTA_EXCEEDED`, `USERNAME_REQUIRED`, …), else `UNAUTHENTICATED`, `INVALID_INPUT`, `NOT_FOUND`, `INTERNAL`.
- `message` is a short, user-safe sentence.
- IDs: project ids are uuid strings; version/copy/request/notification ids are **numbers** (bigint fits in JS number at our scale).
- Hashes are always **lowercase 64-char hex** strings in JS. Only the storage layer converts to base64 or bytea.

## Shared types

```js
/** @typedef {"writing"|"code"|"cad"} ProjectType */
/** @typedef {"public"|"private"} Visibility */
/** @typedef {"cc_by"|"cc_by_sa"|"cc_by_nc"|"mit"|"all_rights_reserved"} License */
/** @typedef {"private"|"in_review"|"published"} CopyState */
/** @typedef {"pending"|"changes_requested"|"approved"|"rejected"} RequestStatus */
/** @typedef {{ id: string, username: string|null, display_name: string|null }} ProfileRef */
/** @typedef {{ path: string, hash: string }} ManifestEntry */
/** @typedef {{ id: number, project_id: string, copy_id: number|null, parent_id: number|null,
 *              author: ProfileRef, note: string|null, created_at: string, files: ManifestEntry[] }} Version */
/** @typedef {{ id: string, owner: ProfileRef, title: string, description: string|null, type: ProjectType,
 *              visibility: Visibility, license: License, main_version_id: number|null,
 *              created_at: string, updated_at: string }} Project */
/** @typedef {{ id: number, project_id: string, author: ProfileRef, state: CopyState,
 *              base_version_id: number, head_version_id: number, published_at: string|null,
 *              created_at: string, is_stale: boolean }} Copy */
/** @typedef {{ id: number, copy_id: number, project_id: string, project_title: string,
 *              owner: ProfileRef, contributor: ProfileRef, submitted_version_id: number,
 *              status: RequestStatus, created_at: string, updated_at: string }} RequestSummary */
/** @typedef {{ id: number, actor: ProfileRef, kind: "submitted"|"changes_requested"|"resubmitted"|"approved"|"rejected",
 *              version_id: number|null, comment: string|null, created_at: string }} RequestEvent */
/** @typedef {{ id: number, type: string, ref_id: string|null, payload: Record<string, unknown>,
 *              read: boolean, created_at: string }} Notification */
```

`Copy.is_stale` = `base_version_id !== project.main_version_id`.

---

## storage stream

### `lib/storage/index.js` (server only)

S3-compatible adapter. Works with **Supabase Storage's S3 endpoint tonight** and **Cloudflare R2 later**, by env only:

```
S3_ENDPOINT=            # Supabase: https://<ref>.storage.supabase.co/storage/v1/s3   R2: https://<account>.r2.cloudflarestorage.com
S3_REGION=              # Supabase: project region (e.g. ap-south-1)                   R2: auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_VERIFIES_CHECKSUM=   # "true" for R2 (signed x-amz-checksum-sha256 enforced). "false" → commit re-hashes staged bytes server-side.
```

```js
presignPut(key, { size, sha256Hex })  -> Promise<{ url: string, headers: Record<string,string> }>
presignGet(key, { filename, contentType }) -> Promise<string>
head(key)                             -> Promise<{ size: number } | null>
copy(srcKey, dstKey)                  -> Promise<void>   // throws if src missing
remove(keys: string[])                -> Promise<void>
readSha256(key)                       -> Promise<string> // hex; used only when S3_VERIFIES_CHECKSUM !== "true"
stagingKey(uid, hashHex) / objectKey(hashHex)
```

### `app/actions/upload.js`

```js
prepareUpload(files: {hash, size, path}[]) -> Result<{ uploads: { hash, url, headers }[] }>
commitVersion({ projectId, copyId: number|null, parentId: number|null, note: string,
                upserts: {path, hash, size}[], deletes: string[] }) -> Result<{ versionId: number }>
getDownloadUrls(versionId: number) -> Result<{ files: { path, hash, size, url: string|null, blocked: boolean }[] }>
```

### `lib/upload-client.js` (browser) — **the only thing the frontend calls for saving**

```js
saveVersion({
  projectId, copyId /* number|null */, parentId /* number|null */, note,
  parentFiles /* ManifestEntry[] — current files of the parent, [] for first save */,
  changes /* { path, file?: File|Blob, text?: string }[] — added or changed files */,
  deletes /* string[] */,
  onProgress /* optional (done, total) => void */,
}) -> Promise<Result<{ versionId: number }>>
```

Hashes changed files (`lib/hash.js`, SHA-256 via `crypto.subtle`), skips files whose hash equals the parent's for that path, calls `prepareUpload`, PUTs bytes, calls `commitVersion`.

---

## backend stream

### `app/actions/projects.js`

```js
createProject({ title, description, type, visibility, license }) -> Result<{ projectId: string }>
updateProject({ projectId, title?, description?, visibility?, license? }) -> Result<{}>
restoreVersion({ projectId, versionId }) -> Result<{ versionId: number }>
getDashboard() -> Result<{ me: ProfileRef & { storage_used: number }, projects: Project[], copies: (Copy & { project_title: string })[] }>
getProject(projectId) -> Result<{
  project: Project, isOwner: boolean,
  main: Version | null,                       // current main with files
  history: { version: Version, promoted_by: ProfileRef, from_copy_id: number|null, created_at: string }[],  // main_history, newest first
  othersCopies: Copy[],                       // published copies (+ in_review ones if isOwner)
  myCopies: Copy[],                           // caller's own copies of this project
}>
getVersion(versionId) -> Result<{ version: Version }>
```

### `app/actions/copies.js`

```js
makeCopy(projectId) -> Result<{ copyId: number }>
getCopy(copyId) -> Result<{
  copy: Copy, project: Project, isAuthor: boolean, isOwner: boolean,
  head: Version, versions: Version[] /* newest first, files may be omitted */,
  openRequest: RequestSummary | null,
}>
```

### `app/actions/requests.js`

```js
submitRequest({ copyId, note }) -> Result<{ requestId: number }>
resubmitRequest({ requestId, note }) -> Result<{}>
reviewRequest({ requestId, decision: "approve"|"request_changes"|"reject", comment }) -> Result<{}>
promoteCopy({ copyId, acknowledgeStale: boolean }) -> Result<{}>   // STALE_COPY when stale and not acknowledged
getInbox() -> Result<{ incoming: RequestSummary[], outgoing: RequestSummary[] }>
getRequest(requestId) -> Result<{
  request: RequestSummary, events: RequestEvent[], isOwner: boolean,
  submitted: Version, base: Version,           // for side-by-side
}>
```

### `app/actions/notifications.js`

```js
listNotifications() -> Result<{ items: Notification[], unread: number }>
markNotificationsRead(ids: number[]) -> Result<{}>
```

Live updates: client subscribes with the browser client to private channel `user:<uid>` (`config: { private: true }`), any broadcast event → re-call `listNotifications()`.

---

## frontend stream

Pages (App Router, Tailwind v4, plain components, no shadcn CLI needed tonight):

`/` landing (minimal), `/login`, `/signup`, `/onboarding` (username → `setUsername`), `/auth/auth-error`,
`/dashboard`, `/projects/new`, `/p/[id]` (tabs: Files · History · Versions by others; owner actions),
`/p/[id]/edit` (owner saves to main), `/c/[id]` (copy view + editor + Request to publish),
`/requests` (inbox: incoming/outgoing), `/requests/[id]` (review screen: side-by-side text, approve / ask for changes / reject, promote),
header with notifications dropdown.

Plain-language UI vocabulary from PRD §4 only (never "commit", "fork", "PR", "merge").
File contents for viewing: `getDownloadUrls(versionId)` → `fetch(url)` → text for writing/code; download link for CAD.

---

## Contract change requests

| From | Request | Resolution |
|---|---|---|
