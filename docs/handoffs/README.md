# Handoff notes, one file per person

Each developer keeps their own file here — `om.md`, `rudra.md`, `vinal.md`,
`shreya.md`, and so on. Add to it as you work, not once at the end.

These are merged into the changelog in [`HANDOFF.md`](../../HANDOFF.md) after
the work lands. **Nobody edits `HANDOFF.md` directly except the repository
owner** — if everyone appends to the same file, every pull request conflicts on
it. One file per person never does.

## What an entry needs

```markdown
## 2026-09-11 — short summary

**What changed**
- Bullet per user-visible or structural change. Name the files.

**Why**
- The reason. Assume the reader has no context.

**SQL to run before deploying**
- The statements, or "None". See below — this one matters most.

**How to verify**
- The command, URL or click-path that proves it works.
```

## The SQL section is the important one

Write down every migration your branch needs, and say plainly that it has not
been run yet. Code that reaches production before its migrations is the single
most expensive failure this project has had:

- **8 Sep** — a merge shipped code whose migrations never ran. Daily Goals died
  on a missing `goals.client`; attendance punch-in died on a stale device index.
- **9 Sep** — sign-in failed with *"Email or password didn't match"* while
  Firebase was succeeding, because `employees.employment_status` was missing and
  the session route 500'd behind a generic message.

Both were invisible in the diff and obvious in the database. A one-line note
here would have caught each of them.

## Two things that are easy to get wrong

**"Success" is not proof.** The Supabase editor runs only the selected text if
anything is selected — a partial selection reports success having done nothing.
Press Ctrl+A before Run, then verify by reading the schema back.

**The editor shows only the LAST result set.** A file of eight `SELECT`s runs
all eight and displays the eighth; the other seven are discarded silently, and
what you are looking at is indistinguishable from a clean full run. This hid
six of seven checks on 15 September, including the one deciding whether the
code could be deployed at all. **Write a verification query as ONE statement**
returning one table of `(check_name, ok)` ordered failures-first —
[`db/VERIFY-0215-0224.sql`](../../db/VERIFY-0215-0224.sql) is the worked
example. Same reason a restore script should not end in `COMMIT`: a trailing
`COMMIT` returns no rows, so it becomes the last result set and hides the
report above it. One statement is atomic anyway.

**Restores leave id counters behind.** After restoring any table from backup,
re-sync the sequences, or the next insert fails with a duplicate-key error on a
column the application never sets. (Check the id type first — a `uuid` default
has no counter and needs nothing.)

## Vercel: three rules

The free team plan pauses the project when a limit is hit, so these are not
housekeeping.

**1. Every push to `main` is a full 431-function deployment, and every old one
still occupies storage.** One deployment's bundles total ~10.3 GB against a
10 GB Function Storage allowance. Batch work onto one deploy instead of five,
and delete old deployments (Deployments → ⋯ → Delete), keeping production plus
one or two to roll back to.

**2. Never add a client-side poller without doing the arithmetic.** A 4-second
`setInterval` is 900 requests an hour **per open tab, per person**, and if it
hits an authenticated endpoint each one costs a session verification (crypto,
which is billed CPU, not cheap I/O wait) plus its queries. That is what took
Fluid Active CPU to 75%. If you must poll: skip while
`document.visibilityState === "hidden"`, and pick the interval from what the
feature actually needs rather than from what feels responsive.

**3. `outputFileTracingIncludes` in `next.config.ts` looks like bloat and is
load-bearing.** The `@sparticuz/chromium` binary is unpacked at runtime, so
nothing statically imports it and tracing drops it unless it is named; the
`public/letter-fonts`, `public/letterhead` and `public/logos` includes are
there because `public/` is CDN-served and is not guaranteed to be on the
function filesystem. Delete them to save space and the letter PDFs fail at
runtime — no fonts, no letterhead, or "input directory …/bin does not exist".
The genuine saving is to stop **three** routes each carrying their own copy of
that 67 MB binary, not to stop including it.
