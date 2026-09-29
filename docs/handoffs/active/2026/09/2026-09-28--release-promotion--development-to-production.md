# Development-to-production release handoff

- **Date:** 2026-09-28
- **Work item:** `release-promotion`
- **Status:** Approved production promotion is pending.
- **Development source base:** `origin/main` at `a14e34bcea52c3e10467d3d5f7da7a1bd51e6065`; the direct descendant that records this handoff is the approved promotion source.
- **Production target:** `fork/main` at `af5632e76fc3ba35eb2aac24ebfde69550823eda`.

## Release scope

- Repository workflow policy and documentation.
- Archive reassignment improvements and related Project Plan access/query changes integrated from the Shreya branch.

## Release safety

- `fork/main` is an ancestor of the approved Development source, so promotion is a fast-forward only.
- No SQL, schema, migration, database, Vercel, or GitHub-settings change is part of this release.
- Production was not modified while this handoff was prepared.

## Validation

- `pnpm typecheck` passed.
- Environment-aware `next build` passed, including compilation, TypeScript, static generation, and final optimization.
- `pnpm test` completed with 26 known baseline failures across 12 unrelated suites. No Archive or Project Plan test failure was reported from the integrated Shreya files.

## Approval and rollback

- Promotion was explicitly authorized by the maintainer.
- If a production regression is found, investigate and fix it in the Development Repository first. Do not make application-code fixes directly in `fork/main`.
- Deployment is not performed by this Git promotion; the production deployment owner must deploy the resulting `fork/main` commit.

## Remaining action

Push this verified, fast-forward-only range from Development `origin/main` to Production `fork/main`, then record the resulting production SHA and deployment status.
