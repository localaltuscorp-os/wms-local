# Repository policy documentation handoff

- **Date:** 2026-09-26
- **Work item / branch:** `docs/repository-policy`
- **Status:** Ready for review; not pushed and no pull request created yet.
- **Commit:** `5b72393e` (`docs: add repository workflow and engineering policies`)

## Objective

Document the repository workflow and engineering policies for the Development and Production repositories.

## Changes completed

- Added `AGENTS.md` with repository workflow, engineering, security, database, Git, testing, intern-learning, and handoff requirements.
- Added `docs/README.md` describing the approved documentation locations, including active and archived handoff paths.
- Updated `.gitignore` so the repository policy file is intentionally versioned.

## Files changed

- `.gitignore`
- `AGENTS.md`
- `docs/README.md`

## Database and runtime impact

- No application or runtime behavior changed.
- No SQL, schema, migration, database, deployment, or Vercel changes were made.
- No existing handoff files were modified.

## Validation completed

- Reviewed the complete documentation-policy diff.
- Ran `git diff --check` successfully; no whitespace errors were found.
- Reviewed the changes for secrets, credentials, tokens, and real PII; none were introduced.
- Confirmed the branch is based on `origin/main` and contains only the documentation-policy commit before this handoff commit.

## Next steps

1. Review the documentation-policy branch.
2. Push `docs/repository-policy` to `origin` after this handoff is committed.
3. Create a pull request to `origin/main`; do not merge without maintainer approval.
