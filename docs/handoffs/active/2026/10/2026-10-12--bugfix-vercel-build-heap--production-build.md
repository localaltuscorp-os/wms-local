# Vercel production-build heap fix

## Problem

The production deployment for wms-local main `38d7b919fb485f5bd56c09aa47f316d253b56711` compiled successfully, then remained in Next.js TypeScript validation until Vercel cancelled it. A local production build reproduced the failure: its TypeScript worker reached the configured 4 GB Node heap, exited before creating `.next/BUILD_ID`, and left no deployable Vercel output.

## Change

- Branch: `bugfix/vercel-build-heap-2026-10-12`
- Raise the Node heap used by `build` and `build:clean` from 4096 MB to 6144 MB.
- No application, database, permission, or runtime behavior changes.

The 6 GB limit leaves headroom on Vercel's 8 GB build machine while allowing the current TypeScript graph to complete.

## Validation

- A production build with the former 4 GB heap compiled, then exhausted the heap during TypeScript and produced no `BUILD_ID`.
- With 6 GB, the same build compiled in 6 minutes and completed TypeScript in 13 minutes. It then reached page-data collection and failed only because the clean checkout did not have database/Supabase environment variables.
- An environment-backed retry compiled successfully but remained in TypeScript when the 30-minute local command monitor expired; it did not return a compiler diagnostic or OOM.
- `pnpm check:leaks` passed before this branch: zero watched package leaks across 4,038 built server files.
- Push through a PR and require the latest `test` CI check.
- Deploy the merged main commit to the linked `wms-local` Vercel production project.

## Rollback

Revert the package-script change if the TypeScript graph is reduced enough to fit the former limit or if Vercel changes the builder memory allocation.
