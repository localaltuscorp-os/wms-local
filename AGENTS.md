# Repository Workflow and Safety Rules

## Development workflow

- `origin` is the Development Repository: `localaltuscorp-os/wms-local`.
- `origin/main` is the protected development and integration branch. It is not the production repository.
- Use `feature/<short-description>` for feature work and `bugfix/<short-description>` for bug fixes.
- Developers and interns work only on their own feature or bugfix branches.
- Changes reach `origin/main` only through pull requests.
- Direct pushes to `origin/main` are prohibited for normal development.

## Production workflow

- `fork` is the Production Repository: `localaltuscorp-os/Altus-OS`.
- `fork/main` is the production branch and production release source.
- Developers and interns must not modify production application code directly.
- Production fixes must first be implemented and tested in the Development Repository.
- Only an explicitly authorized release owner may promote approved changes from Development to Production.
- Production deployment is based on `fork/main`.

## Release rules

- Never promote unapproved code.
- Record the exact approved development commit SHA.
- Check ancestry between `origin/main` and `fork/main` before promotion.
- Do not assume those branches have identical histories.
- Never force-push production.
- Record release evidence, required migrations, rollback information, and approval before production promotion.

## Pull request rules

- Keep pull requests small and focused.
- Run the applicable checks before requesting review.
- Address review comments before merge.
- Do not bypass failing checks.
- Do not force-push unless explicitly authorized for a specific development-branch situation.

## Security and PII rules

- Never hardcode real names, email addresses, phone numbers, employee or user identifiers, access lists, credentials, passwords, API keys, tokens, or other personal or sensitive data in application code, tests, seeds, SQL, documentation, screenshots, comments, or sample requests.
- Represent access through existing database records, roles, permissions, capability grants, authentication and authorization mechanisms, or approved configuration.
- When asked to give a specific person access, do not hardcode that identity. Determine the appropriate role, permission, capability, or approved configuration source first.
- Use clearly fake identities and data in tests and examples, such as `Test User` and `test@example.com`.
- Before committing, inspect the diff for secrets, credentials, PII, and real production data.
- If sensitive data is found, stop and report the file and safe remediation without exposing or copying the value.

## Code quality

- Follow the existing project architecture and conventions.
- Prefer minimal, focused changes.
- Do not introduce frameworks or infrastructure without approval.
- Preserve existing functionality unless the task explicitly requires a behavior change.

## Testing commands

Available repository commands:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:visual`
- `pnpm build`
- `pnpm check:leaks`
- `pnpm deploy`

Run only checks appropriate to the change. Do not claim a check is enforced by GitHub unless the repository configuration actually enforces it.

## Codex behavior

- Inspect before modifying.
- Explain risky changes before making them.
- Never silently alter production.
- Never assume branch or repository ownership.
- Never expose secrets or PII.
- Never bypass repository protections.
- If requirements conflict with this file and the conflict affects security, production, data integrity, or repository history, stop and request clarification.

## Documentation and handoff rules

- Do not create handoff files randomly throughout the repository.
- All active developer handoffs belong under `docs/handoffs/active/YYYY/MM/`.
- Name handoffs `YYYY-MM-DD--<branch-or-work-item>--<short-topic>.md`.
- Use branch, ticket, or neutral work-item identifiers rather than real people's names.
- Do not create `final`, `final2`, `latest`, `new`, or duplicate handoff files.
- Maintain one active handoff per task or work item, and update it instead of creating unnecessary duplicates.
- Handoffs must not contain secrets, credentials, tokens, production connection strings, or real-person PII.
- Do not put general architecture documentation inside handoffs. Use `docs/architecture/` for architecture, `docs/development/` for development documentation, `docs/deployment/` for deployment documentation, and `docs/troubleshooting/` for troubleshooting or incident documentation.
- Do not embed SQL in handoff documents when it belongs in the database structure. Reference the relevant migration or SQL script path instead.
- Completed tasks that require a transition or handoff should leave one structured handoff for the next developer or team member.

## SQL organization rules

- Do not scatter SQL files through the repository root or unrelated directories.
- Canonical migrations belong in `db/migrations/`; seed SQL belongs in `db/seeds/`.
- Reusable diagnostic, maintenance, preflight, verification, and release SQL belongs under the appropriate `db/scripts/` subdirectory.
- Do not create arbitrary SQL files in the project root or duplicate migrations.
- Never casually rename or move files under `db/migrations/` or `db/migrations/meta/`: filenames and ordering may be part of migration history.
- Never execute production SQL casually. Production database changes must follow the approved release and migration process.
- Never store database passwords, connection strings, API keys, tokens, or credentials in SQL files.
- Never put real personal data into seed or test SQL unless explicitly approved and appropriately protected.
- Before moving SQL, determine whether application code, scripts, documentation, handoffs, or release procedures reference it.

## Repository organization rules

- Every file should have one clear and predictable home.
- Before creating a new documentation or SQL file, check whether an appropriate existing location already exists.
- Do not create duplicate files merely because a similarly named file already exists; prefer updating the canonical document.
- Clearly identify historical or archive material.
- Do not reorganize existing files merely for aesthetics; verify references and dependencies first.

## Mandatory engineering workflow

### Never blindly execute a prompt

A prompt is an instruction, not proof that the requested implementation is correct. Before changing anything, determine the actual outcome sought; the feature owner; involved routes, components, services, schema, migrations, and external services; relevant authentication and authorization; existing business rules; downstream dependencies; and whether the change fits the established architecture. If the request is ambiguous or technically unsafe, stop and explain the issue before modifying files.

### Understand before modifying

Inspect the relevant routes or pages, components, server actions or API handlers, libraries or services, schema, migrations, authentication/session logic, RBAC or permissions, tests, configuration, and documentation. Follow the actual call and data flow; do not select a file merely because its name sounds relevant.

### Build a small mental model first

Before implementation, trace the appropriate flow:

- Request work: input → validation → authentication → authorization → business logic → database or external service → response/UI → logging or audit where applicable.
- UI work: UI → component → state/form → server action/API → business logic → database → response → UI update.
- Database work: application dependency → schema/table → migration → query/write path → affected features → rollback implications.

### Explain current behavior and plan non-trivial work

Before changing non-trivial functionality, explain in plain language how it currently works, its controlling files, data reads/writes, permissions, intended change, non-change, and credible breakage risk. Then provide a concise plan covering the problem, current behavior, root cause, proposed change, likely files, database impact, authorization impact, API/data flow, tests, and rollback considerations. Do not begin broad changes until the plan is understood.

### Keep changes small and do not guess

- Prefer the smallest correct change.
- Do not refactor unrelated code, rename unrelated files, reorganize for aesthetics, rewrite working systems, upgrade dependencies without reason, change architecture without approval, or alter unrelated database structures.
- Report unrelated problems separately.
- Do not invent business logic, roles, permissions, identities, database records, workflows, or production behavior. Inspect existing code and documentation first; if still unclear, ask for clarification.
- Do not introduce a new service, table, permission system, API layer, configuration mechanism, or abstraction merely because it appears cleaner. Reuse established architecture where appropriate.

### Trace shared-code dependencies

Before changing shared components, utilities, auth/permission helpers, database functions, API routes, server actions, hooks, configuration, or shared types, search for their consumers and understand the affected behavior.

## Codebase context and repository map

For every non-trivial task, provide concise codebase context when useful:

```text
Feature:
Entry point:
Main components:
Server/API path:
Business logic:
Database tables:
Authentication:
Authorization:
Tests:
Deployment considerations:
```

Major repository areas:

- `app/`: Next.js App Router pages, layouts, server actions, and API route handlers. Inspect route/layout ownership and server-side guards before changing behavior.
- `components/`: feature-oriented UI components. Do not assume a UI-only change is safe without tracing its action/API and data path.
- `lib/`: shared domain logic, integrations, auth, security, permissions, queries, and utilities. Treat changes here as potentially cross-feature.
- `db/`: Drizzle schema, enums, canonical migrations, historical/local SQL, and future seeds/scripts directories. Never casually move, rename, or rewrite canonical migration files or metadata.
- `scripts/`: operational scripts for migrations, imports, seeds, diagnostics, and verification. Inspect inputs and database effects before running or changing them.
- `tests/`: unit, integration, fixtures, end-to-end, and visual tests. Use synthetic test data only.
- `android-app/`: native Android application; changes may require separate Android build validation.
- `.github/`: GitHub Actions workflow configuration. Do not alter CI/deployment controls without approval.
- `docs/`: architecture, development, deployment, handoff, runbook, plan, specification, and troubleshooting material. Follow the documentation organization rules above.
- Root configuration includes `package.json`, `next.config.ts`, `tsconfig.json`, `drizzle.config.ts`, `vercel.json`, `proxy.ts`, ESLint, Vitest, and Playwright configuration. Shared configuration changes require consumer and deployment impact review.

## Database safety

Before any database change:

1. Inspect the current schema and related canonical migrations.
2. Find application code using the affected table, column, query, or write path.
3. Determine whether existing data is affected and whether the migration is forward-only or needs rollback planning.
4. Check whether the requested change duplicates an existing migration.
5. Never rename, delete, or rewrite existing canonical migrations casually.
6. Never execute production SQL casually, store credentials in SQL, or use real personal data in test/seed SQL unless explicitly approved and protected.

Canonical migrations remain in `db/migrations/`; their filenames and ordering are part of the migration process.

## Authentication and authorization safety

Authentication and authorization changes are high risk. Before changing them inspect session handling, current-user lookup, authentication providers, employee lookup, roles, permissions, capabilities, route protection, server-side authorization, client-side permission checks, and database permission tables.

- Never rely only on client-side hiding for security.
- Never weaken an authorization check merely to make a feature work.
- Never hardcode employee names, emails, phone numbers, employee IDs, user IDs, Firebase IDs, access lists, credentials, tokens, or personal details.
- For a requested individual access change, use the existing role, permission, capability, employee-record, or approved configuration architecture. If the intended model is unclear, stop and ask.
- When authorization behavior changes, explicitly report the previous and new access behavior, affected roles/capabilities, routes/features, and test coverage.

## PII and security review

Never add real personal information to application code, tests, fixtures, seeds, SQL, documentation, screenshots, comments, sample requests, or logs. Use synthetic examples such as `Test User` and `test@example.com`.

Before a commit or pull request, inspect the diff for PII, secrets, API keys, tokens, passwords, credentials, production identifiers, and real customer or employee data. If anything sensitive is found, stop; report the file/location and safe remediation without printing the value.

## Testing and diff review

Do not call work done merely because code changed. Determine relevant checks and use the existing commands where applicable:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:visual`
- `pnpm build`
- `pnpm check:leaks`

Do not claim a test passed unless it actually ran. If it cannot run, explain why. For bug fixes, reproduce or identify the failure where practical, make the smallest fix, test it, and test nearby affected behavior.

Before declaring work complete, review the final diff: intended files only, no unrelated formatting/generated changes, no unexpected SQL/auth/permission changes, no PII/secrets, correct behavior, and appropriate tests.

## Git and production safety

Before Git operations, inspect `git status`, `git branch`, `git remote -v`, `git log`, and `git diff`. Preserve unrelated existing work. Before committing, verify exactly which files belong to the commit; never commit unrelated intern work.

Never casually use destructive commands or history rewriting, including `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .`, `git stash`, force-push, rebase, merge, cherry-pick, or amend.

Development is `origin` → `localaltuscorp-os/wms-local` → `origin/main`. Production is `fork` → `localaltuscorp-os/Altus-OS` → `fork/main`. `origin/main` is not production. Developers and interns must not directly modify production application code; production fixes first go through Development review and testing. Only an authorized release owner promotes approved code to production.

## Handoff requirements

Every non-trivial completed task should provide enough information for the next developer to continue without guessing.

- Update the active task handoff as meaningful changes are made; do not wait until the end of the task.
- Before every push, review and update that handoff so it records all work completed since the branch's previous push, including files changed, database/migration implications, tests run, known issues, and required next steps.
- A push is not ready until its accompanying handoff accurately describes the code being pushed. If no handoff is needed for a truly trivial change, state that explicitly in the pull request or commit context rather than silently omitting it.

- Active handoffs: `docs/handoffs/active/YYYY/MM/`
- Historical handoffs: `docs/handoffs/archive/YYYY/MM/`
- Filename: `YYYY-MM-DD--<branch-or-work-item>--<short-topic>.md`
- Do not use real people's names or include secrets/PII.

Include date, work item/branch, objective, status, summary, files/components changed, database and migration information, testing, known issues, remaining work, deployment and rollback considerations, and relevant commit/release SHA when available.

## Intern education requirement

For non-trivial tasks, explain enough for the intern to understand what was wrong, why it was wrong, how the system works, what changed, why that location/design is correct, possible breakage, testing performed, and what to know before revisiting the area. Use plain language without unnecessary implementation detail.

## Stop conditions

Stop and ask for clarification when requirements are ambiguous; business logic is unknown; a request conflicts with established architecture; production access is requested; real PII or credentials are requested; production database execution is requested; destructive Git operations appear necessary; existing work could be overwritten; a security boundary would weaken; a migration may unexpectedly affect production data; or materially different architectural choices need an owner decision.

## Final response format for non-trivial tasks

At completion, report:

1. What I understood.
2. Current implementation.
3. What changed, by file/component.
4. Why this approach was used.
5. Database impact, or `None`.
6. Security/access impact, or `None`.
7. Exact testing commands and results.
8. Remaining risks/issues.
9. Handoff information for the next developer.
10. Relevant Git status/diff summary.

Never claim completion without verifying the result.

## Engineering principle

The repository is not a prompt-execution environment. Codex is an engineering assistant, and interns are expected to learn the system.

```text
UNDERSTAND → INSPECT → EXPLAIN → PLAN → IMPLEMENT → TEST → REVIEW → DOCUMENT → HAND OFF
```

Optimize for correct implementation, repository safety, security, maintainability, testability, traceability, and intern learning—not merely for a prompt to appear completed.
