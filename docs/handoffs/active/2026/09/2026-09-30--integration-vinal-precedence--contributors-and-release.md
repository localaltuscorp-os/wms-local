# Contributor precedence and deployment handoff

- **Date:** 2026-09-30
- **Development branch:** `integration/vinal-precedence-shreya-om-2026-09-30`
- **Objective:** Record Shreya's branch tip, retain the latest Om delivery, make Vinal authoritative over Rudra where their implementations overlap, deploy development, and separately promote only the approved module-backup feature to production.
- **Status:** Development and backup-only production releases pushed; Vercel development production deployment verified healthy.

## Development integration

- Starting development SHA: `5dbff9dc8bc45c0ad7a553d3943743fa0773dc44`.
- Contributor tips audited: Om `0c581e5c`, Rudra `7975e980`, Shreya `979224fe`, Vinal `b6ea842b`.
- Om, Rudra, and Vinal were already ancestors of the starting development SHA.
- Shreya had no unique tree patch beyond content already integrated; her branch tip was merged for ancestry and traceability.
- Vinal was made authoritative in the three overlapping files whose current content still carried Rudra's later phone-input overrides:
  - `components/dossier/onboarding-form.tsx`
  - `components/hr/candidate/invite-candidate-dialog.tsx`
  - `components/hr/registers/address-book.tsx`
- `components/hr/candidate/intake-field.tsx` already matched Vinal and required no edit.

## Database impact

- No new migration is introduced by the precedence correction.
- Existing integrated migrations remain unchanged and no SQL has been executed.

## Security and access impact

- None from the three precedence edits; they change phone input behavior only.
- The previously integrated Om/Rudra/Vinal authorization changes remain intact.

## Validation

- `pnpm.cmd typecheck`: PASS.
- Focused phone/onboarding tests: PASS, 58/58 across three files.
- Changed-file ESLint: PASS, zero errors.
- `pnpm.cmd build`: PASS; optimized compile, TypeScript, page-data collection, and all 36 static pages completed.
- `pnpm.cmd check:leaks`: PASS; zero PGlite source or NFT traces.

## Backup-only production release

- Production base/rollback SHA: `8750402e`.
- Production release branch: `release/module-backup-only-2026-09-30`.
- `fork/main` release SHA: `a29a03ce`.
- Outgoing production diff: seven files, limited to the Drive folder helper, module-backup naming/registry/dataset code, two focused tests, and the canonical release handoff.
- No database migration or SQL execution.
- Production candidate typecheck, focused tests, changed-file ESLint, optimized build, and leak check passed.

## Development deployment

- Development `origin/main` SHA: `7aa16b49`.
- Vercel project: `altus-corp2/wms-local`.
- Ready deployment ID: `dpl_3MxPkwojbGLHAY9SiSnnx7ZM7mKA`.
- Deployment URL: `https://wms-local-o3j1c3xya-altus-corp2.vercel.app`.
- Production alias: `https://wms-local.vercel.app`.
- Health monitoring: three consecutive probes returned HTTP 200 for `/`, `/api/health`, `/attendance`, `/my-salary`, and `/admin/module-backups`.
- The redundant queued retry deployment was removed after the Ready deployment and alias were verified.
- Vercel rollback candidate: the preceding Ready production deployment `https://wms-local-33e5j6fhg-altus-corp2.vercel.app`.
