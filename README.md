# Versio

**Save every version of your work. Let others improve it without fear.**

Versio is a web app that keeps the full version history of your files and lets
other people suggest changes on their own copy — your main version only changes
when *you* approve it. It is the open, GitHub-style collaboration flow for
writers, coders, and CAD artists, with no Git install and no Git vocabulary.

---

## ✨ What it does

- **Locked main, safe collaboration.** The owner's main version is locked. No
  one edits it directly. Contributors work on a private copy and request to
  publish; the owner reviews and decides.
- **Version history for everyone.** Save a version with a note, browse the
  history, and (as the owner) restore an older version.
- **Plain-language, no Git.** Everything is buttons and dropdowns — "Make my
  copy" instead of fork, "Request to publish" instead of pull request, "Make
  this the main version" instead of merge.
- **Built for three kinds of work:**
  - **Writing** — word-level side-by-side diffs.
  - **Code** — line-level diffs with syntax highlighting.
  - **CAD** — 3D STL previews for reviewing models in the browser.
- **Credit is preserved.** Published copies are credited as "based on X by
  owner," and promoting a copy records the contributor in the main history.
- **Content-addressed storage.** Each file is stored once, keyed by its
  SHA-256 hash, so file contents are never duplicated across versions.

> Project types and UI vocabulary follow `PRD.md`, which is the source of truth
> for product behavior.

---

## 🔁 The review & version flow

1. **Publish.** The owner creates a project (writing, code, or CAD). Its main
   version is locked.
2. **Make my copy.** A contributor creates a private draft built on the current
   main, then edits and saves versions.
3. **Request to publish.** The contributor submits the copy for review with a
   note.
4. **Review.** The owner opens a side-by-side diff and picks one of three
   actions:
   - **Approve** — the copy becomes public in the contributor's space, credited
     to the owner's original.
   - **Ask for changes** — the owner comments, the contributor resubmits, and
     the same request continues.
   - **Reject** — an optional reason is sent and the draft stays private.
5. **Promote (optional).** The owner can make any published copy the new main
   version. The old main stays in history and the contributor is credited; a
   warning is shown before promoting a copy built on a stale main.

The locked-main rule is enforced in the database: clients never write tables
directly, all writes go through `SECURITY DEFINER` RPCs, and Row-Level Security
makes a project's `main_version_id` updatable only by its owner.

---

## 🧱 Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + React — see note below |
| Styling | Tailwind CSS v4 |
| Database | Supabase Postgres with Row-Level Security + `SECURITY DEFINER` RPCs |
| Auth | Supabase Auth (email/password, Google, GitHub OAuth) |
| File storage | S3-compatible object storage for file blobs (Supabase Storage S3 endpoint now, Cloudflare R2 later) |
| Diffs | [`diff`](https://www.npmjs.com/package/diff) (word- and line-level) |
| Code highlighting | [Shiki](https://shiki.style/) |
| 3D previews | [three.js](https://threejs.org/) (loaded lazily, CAD only) |
| Validation | [Zod](https://zod.dev/) |
| Language / types | JavaScript (ES modules) with `// @ts-check` + JSDoc, checked by `tsc` |
| Tests | `node:test` (built-in test runner) + pgTAP for the database |

> **Note on Next.js:** this repo pins a custom Next.js build whose APIs and file
> conventions differ from stock Next (for example, middleware is `proxy.js`).
> Read `AGENTS.md` and the guides under `node_modules/next/dist/docs/` before
> changing framework-level code.

---

## 📁 Project structure

```
app/                 Next.js App Router
  actions/           server actions (uploads, projects, copies, requests, notifications)
  p/[id]/            project page (Files · History · Versions by others)
  c/[id]/            copy (private draft / review) page
  u/[username]/      public profile
  requests/          requests inbox + review screen
  explore/           discovery
  dashboard/  login/  signup/  onboarding/  auth/
components/          React UI (Editor, Compare, Code, StlViewer, Notifications, …)
lib/
  supabase/          server/client/admin clients + local JWT claims
  storage/           S3-compatible storage adapter
  hash.js  limits.js upload-client.js
supabase/
  migrations/        schema, RLS policies, RPCs, auth trigger
  tests/             pgTAP tests
tests/               node:test suites (actions, auth, upload, storage, p1)
scripts/             flow/RLS checks, storage config, spikes
docs/                architecture, contracts, and the security audit
PRD.md               product requirements (source of truth)
BACKEND_PLAN.md      backend architecture, data model, and RPC design
```

---

## 🛠️ Local development

### Prerequisites

- Node.js (with the built-in `node --test` runner)
- [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker (for local Supabase)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then fill in .env.local
```

The required environment variables (see `.env.example`):

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `NEXT_PUBLIC_SITE_URL` | public | App origin for auth redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | privileged DB access (never prefix with `NEXT_PUBLIC_`) |
| `S3_ENDPOINT` / `S3_REGION` | server only | S3-compatible storage endpoint |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | server only | storage credentials |
| `S3_VERIFIES_CHECKSUM` | server only | `true` when the store enforces signed `x-amz-checksum-sha256` |

Never commit `.env.local`.

### Run

```bash
npm run db:start    # start local Supabase (applies migrations)
npm run dev         # start the Next.js dev server
```

Other database scripts:

```bash
npm run db:reset    # reset the local database and re-apply migrations
npm run db:test     # run pgTAP tests (supabase test db)
```

---

## ✅ Testing

```bash
npm test            # node:test suites under tests/**/*.test.mjs
npm run typecheck   # tsc -p jsconfig.json --noEmit (JSDoc type check)
npm run db:test     # database RLS/RPC tests (pgTAP)
```

Extra live checks (require a configured Supabase/storage environment):

```bash
npm run check:rls   # probe RLS policies via real PostgREST calls
npm run check:flow  # exercise the end-to-end core flow
```

---

## 🔒 Security

Versio is built around a locked-main threat model: no direct client table
writes, all mutations via `SECURITY DEFINER` RPCs, and Row-Level Security on
every table. A full code-level audit and live cross-tenant / stored-XSS probing
are documented in [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md).

---

## 👥 Contributors

- **Krishnaditya Singh** — [@krishnadityasingh18-create](https://github.com/krishnadityasingh18-create)
- **Sidhant Sinha** — [@SenCruCiAl](https://github.com/SenCruCiAl)
- **Soumyadip Das** — [@dip-soumya](https://github.com/dip-soumya)
