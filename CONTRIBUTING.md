# Contributing to Versio

Thanks for working on Versio! This guide keeps the three of us (and anyone who
joins later) moving without stepping on each other. For project setup and the
tech stack, see the [README](./README.md) first.

## How we work

`main` is protected: **no direct pushes.** Every change lands through a Pull
Request with **at least one approval**. Work happens on short-lived branches.

## Getting started

```bash
git clone https://github.com/krishnadityasingh18-create/Versio.git
cd Versio
npm install
cp .env.example .env.local   # fill in the values (see the README env table)
npm run dev                  # http://localhost:3000
```

Supabase (local DB + migrations):

```bash
npm run db:start   # start local Supabase
npm run db:reset   # apply migrations to the local DB
npm run db:test    # run the pgTAP database tests
```

## Branching

Branch off the latest `main`, one branch per piece of work:

```bash
git checkout main && git pull
git checkout -b feat/short-description
```

Use a type prefix so branches are self-explaining:

| Prefix | For |
|--------|-----|
| `feat/`  | a new feature |
| `fix/`   | a bug fix |
| `docs/`  | docs only |
| `chore/` | tooling, deps, config |
| `refactor/` | no behavior change |

## Commits

- Write clear, present-tense messages (`Add star toggle`, not `added stuff`).
- Keep each commit focused; it's easier to review and to revert.
- Pairing or mobbing? Credit everyone with a trailer so you all get contribution
  credit for the shared commit:

  ```
  Co-authored-by: Name <email@example.com>
  ```

## Before you open a PR

Run the checks locally — a green PR gets reviewed faster:

```bash
npm run typecheck
npm test
npm run check:rls    # if you touched supabase/ (RLS / RPCs)
npm run check:flow   # if you touched the end-to-end data flow
```

Never commit secrets. `.env.local` is git-ignored — keep it that way. If you add
a new config value, document it in `.env.example` (with a placeholder, not a real
value).

## Opening the Pull Request

1. Push your branch and open a PR into `main`.
2. Keep it focused — small PRs are reviewed and merged faster than big ones.
3. Fill in what changed and why; link any issue it closes (`Closes #12`).
4. Wait for **one approval**. Resolve all review conversations before merging.
5. Pushing new commits dismisses stale approvals, so get a fresh look after
   big changes.

## Reviewing someone's PR

- Be prompt and kind — the goal is better code, not gatekeeping.
- Pull the branch and run it when a change is non-trivial.
- Approve once it's correct and the checks pass; request changes with specifics.

## Reporting bugs / ideas

Open an Issue describing what you expected, what happened, and how to reproduce
it. For security concerns, see [docs/SECURITY_AUDIT.md](./docs/SECURITY_AUDIT.md)
and raise it privately with the maintainers rather than in a public issue.
