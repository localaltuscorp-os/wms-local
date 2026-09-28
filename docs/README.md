# Documentation guide

This repository is gradually moving legacy documentation and SQL into predictable locations. Do not manually move existing legacy handoff or SQL files while that migration is under review.

- Active handoffs belong in `docs/handoffs/active/YYYY/MM/`.
- Historical handoffs belong in `docs/handoffs/archive/YYYY/MM/`.
- Architecture documentation belongs in `docs/architecture/`.
- Development guidance and change records belong in `docs/development/`.
- Deployment and release documentation belongs in `docs/deployment/`.
- Troubleshooting and incident documentation belongs in `docs/troubleshooting/`.
- Canonical database migrations belong in `db/migrations/`.
- Reusable database scripts belong in the appropriate `db/scripts/` subdirectory.

Existing files in `db/migrations/` and `db/migrations/meta/` must never be casually moved or renamed. Migration filenames and ordering are part of the migration process. Existing scattered legacy handoffs and operational SQL are being reviewed and will be migrated gradually through approved changes only.
