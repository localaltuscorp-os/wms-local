# Repository policy direct-integration handoff

- **Date:** 2026-09-28
- **Work item:** `repository-policy`
- **Status:** Documentation-policy commit is complete locally; authorized direct integration into `origin/main` is pending.
- **Commit:** `e944d3d5` (`docs: add repository workflow policies`)

## Objective

Add the repository workflow and engineering policy to the Development Repository.

## Changes

- Adds the tracked `AGENTS.md` repository policy.
- Adds the `.gitignore` exception required to track `AGENTS.md`.
- Adds `docs/README.md` documenting the approved documentation and handoff locations.
- Records that developers and interns use feature or bugfix branches, while only an explicitly authorized maintainer may directly integrate a reviewed and tested isolated change into `origin/main`.

## Scope and safety

- Documentation and repository-policy only.
- No application/runtime, SQL, schema, migration, database, deployment, Vercel, GitHub-settings, or production changes.
- The dirty local `main` worktree was not used or modified.
- Production remote `fork` and `fork/main` were not touched.

## Validation

- Reviewed the complete documentation-only diff.
- Ran `git diff --check` successfully.
- Reviewed the diff for secrets, credentials, tokens, and real PII; none were introduced.

## Remaining action

The policy commit was directly integrated into `origin/main` by an authorized maintainer. The policy is now the Development Repository baseline.
