# Versio Security Audit

Manual code-level audit plus live probing of the running deployment (Supabase project `hxwilokouidvrotwptur`). Done overnight on the `tonight-mvp` branch. No third-party offensive tooling was run against the live project (deferred at the owner's request). Nothing was pushed.

**Result: no exploitable vulnerabilities found.** The code follows the F1–F11 threat model in `BACKEND_PLAN.md` and holds up under live cross-tenant attack probing. One informational note is below.

## Method
1. Read every security-critical file: RLS (`0002`), RPCs (`0003`/`0005`/`0006`), `app/actions/upload.js`, `lib/storage/*`, `app/actions/explore.js` + `lib/actions/explore.js`, `profiles.js`, `app/auth/callback/route.js`, `proxy.js`, `lib/supabase/*`.
2. Ran a live attacker probe: two throwaway users hitting PostgREST/RPC directly with the anon key + a real user JWT (the exact capability a malicious browser has).
3. Ran a live stored-XSS probe: uploaded hostile files and inspected the real signed-GET response headers.
4. Scanned for secret leakage and accidental secret commits.
All test data was deleted after each run.

## Live cross-tenant probe — 14/14 blocked
Attacker (user B / an outsider C) against victim A, all via a normal signed-in client:

| Attack | Result |
|---|---|
| Read A's private project | 0 rows (RLS) |
| Direct `UPDATE` A's project (rename / unlock main) | 42501 permission denied |
| Direct `INSERT` a version row | 42501 |
| Call `commit_version` as a client | 42501 (service_role only) |
| `SELECT` from `blobs` | 42501 (revoked + RLS false) |
| Call `takedown_blob` as a client | 42501 (service_role only) |
| Promote own un-published copy | P0001 (RPC check) |
| Outsider approves A's request | P0001 |
| Contributor self-approves their request | P0001 |
| Outsider reads an in-review copy | 0 rows |
| Outsider reads `request_events` | 0 rows |
| Steal A's username | P0001 (`USERNAME_TAKEN`) |
| `UPDATE` A's notifications | 42501 |
| `INSERT` a star as A | 42501 |

## Live stored-XSS guard — 5/5 safe
Uploaded `<script>…</script>` under several names; inspected the real signed-GET headers:

| File | Content-Disposition | Content-Type | Rendered? |
|---|---|---|---|
| `evil.html` | attachment | application/octet-stream | no (download) |
| `evil.svg` | attachment | application/octet-stream | no |
| `evil.htm` | attachment | application/octet-stream | no |
| `note.txt` | inline | text/plain; charset=utf-8 | shown as literal text |
| `tricky";name=x.html` | attachment (filename sanitized to `tricky_;name=x.html`) | application/octet-stream | no + no header injection |

## What holds the line
- **Writes are RPC-only.** `INSERT/UPDATE/DELETE` revoked from `anon`/`authenticated` on every table, including future tables via `alter default privileges`. Clients cannot write rows directly; every mutation runs through a `SECURITY DEFINER` RPC that checks the actor first.
- **Locked main** is enforced at the database: only the owner's RPC path can move `projects.main_version_id`.
- **`commit_version` and `takedown_blob` are `service_role`-only.** The server passes `p_actor` from a locally-verified JWT, never from client input; sizes come from storage HEAD, not the client; reuse-without-upload is gated on the parent manifest (F6/F11); unenforced-checksum stores get a server-side re-hash of the staged bytes (F5).
- **Storage**: endpoint/credentials are env-only (no SSRF), keys are validated hex/uuid (no path traversal), and `presignGet` signs content-disposition/type overrides that force hostile files to download as `application/octet-stream`; `contentTypeFor` never emits `text/html` or `image/svg+xml`.
- **Auth**: `safeNext` blocks `//` and `/\` open-redirect vectors; server identifies users via locally-verified JWT claims (`getClaims`), never `getSession`; the service-role key is server-only (`server-only` import) and never logged.
- **Explore search**: `cleanQuery` strips LIKE wildcards (`% _ *`) and PostgREST `or(...)` delimiters; the keyset cursor is validated (UUID + timestamp/int) before being embedded.
- **Secrets**: `.env.local` is git-ignored; no secret values are committed; `console.*` prints variable names, never values.

## Informational (no action required)
- **No `X-Content-Type-Options: nosniff` on storage GETs.** It cannot be set through a presigned S3 GET, and it is not needed here: the storage origin is isolated from the app origin (so a rendered file can never reach app cookies/DOM), `text/plain` is not sniffed into HTML by modern browsers, and hostile renderable types are already forced to `attachment`/`octet-stream`. If storage ever moves behind the app's own domain, revisit this.

## Re-test 2026-10-14 (fresh live probe, current `tonight-mvp`)
Strix was requested but cannot run here (needs Docker + a paid LLM key, neither present), so this was a native re-probe of the live project `hxwilokouidvrotwptur` with the anon key and a disposable JWT, exactly what a malicious browser has. The throwaway attacker user was deleted afterward (cascade verified). **Still no exploitable vulnerabilities.**

- **Anon reads** — only the one *public* project + its public profile/versions are returned; `stars`/`notifications`/`copies`/`request_events` return `[]` under RLS; `blobs` is 401. A newly created *private* project was invisible to anon both by id (`[]`) and in the full listing.
- **Anon writes** — every `INSERT/UPDATE/DELETE` on `projects`/`versions`/`profiles`/`stars` → `42501` (privileges revoked). Privileged RPCs (`commit_version`, `takedown_blob`) are not even in anon's schema cache (`PGRST202`).
- **Authenticated cross-tenant** (real JWT, after setting a username so ownership checks actually run) — `update_project`, `restore_version`, `promote_copy`, `review_request` on victim A all → `NOT_AUTHORIZED` (P0001); `make_copy` of an `all_rights_reserved` project → `LICENSE_FORBIDS_COPY`; `set_username('kdsv')` → `USERNAME_TAKEN`. Direct table writes → `42501`. `commit_version` as `authenticated` → `42501` (service_role only); `takedown_blob` is `revoke ... from public, anon, authenticated`.
- **`mark_notifications_read`** confirmed scoped at the DB: `where user_id = v_uid and id = any(p_ids)` — a caller cannot touch another user's notifications.
- **Storage** code unchanged since the original audit; `presignGet` still forces `ResponseContentDisposition`/`ResponseContentType`, keys validated against `/^[0-9a-f]{64}$/` + UUID regex.

## Not in scope (owner to do)
- Active third-party pentest tooling (Strix) — blocked on Docker + an LLM API key.
- Google OAuth and a production email provider (Supabase's built-in email is rate-limited).
- Rate limiting / abuse controls beyond Supabase defaults.
- ~~`profiles.storage_used` is readable by anon~~ **Patched 2026-10-14** (migrations `0007`/`0008`): table-wide `select` on `profiles` was replaced with a column grant on the public columns only (`id, username, display_name, avatar_url, tags, created_at`); `storage_used` is no longer client-readable by anon or authenticated, and the owner's own value is served by the `my_storage_used()` SECURITY DEFINER RPC (scoped to `auth.uid()`). Verified live: `select=storage_used` and `select=*` → `42501`; explicit public reads and the owner RPC still work.
