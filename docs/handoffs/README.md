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

**Restores leave id counters behind.** After restoring any table from backup,
re-sync the sequences, or the next insert fails with a duplicate-key error on a
column the application never sets.
