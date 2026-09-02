# Runbook: Bootstrap the first admin (one-time per environment)

This procedure creates the very first admin employee on a brand-new environment,
breaking the chicken-and-egg of invite-only signup.

## When to use this

- Brand-new production environment (after the first M2.0 deploy)
- Brand-new staging environment
- After a database reset that wiped `employees`

**Do not run this casually.** It uses service-role credentials and bypasses
every safety net. Once one admin exists, all subsequent employee additions go
through `/admin/employees` like normal.

## Prerequisites

1. The new environment's Supabase project is created and migrations have run.
2. The new environment's Firebase project is created and Email/Password sign-in is enabled.
3. Public sign-up is disabled in Firebase Auth settings.
4. The Cloud Function `setAuthClaim` is deployed to the same Firebase project.
5. Resend is configured (domain verified, API key obtained).

## Procedure

1. Copy `.env.local` (or your prod env-var dump from Vercel) to `.env.bootstrap` on your local machine.
2. Add `SUPABASE_SERVICE_ROLE_KEY=...` to `.env.bootstrap` if it isn't there.
3. Run:

   ```bash
   pnpm bootstrap-admin -- --email heteshvichare927@gmail.com --name "Hetesh Vichare"
   ```

4. The script prints the firebase_uid, the employees.id, and the password-reset link.
5. The new admin receives an email with the link (assuming Resend was configured). If not, the script prints the link to stdout — share it manually.
6. The new admin clicks the link, sets a password on `/set-password`, lands on `/welcome`.
7. **DELETE `.env.bootstrap` immediately.** It contains service-role keys.

## Verification

```bash
# As the new admin, open /admin/employees in the browser.
# You should see one employee: yourself, with "Admin = ✓".
# Click "+ Invite employee" to invite the next person.
```

## Troubleshooting

- **"Employee with email X already exists"** — the script refuses to clobber an existing row. Either delete the row manually in Drizzle Studio or pick a different email.
- **Email never arrives** — check the script's stdout for the printed link. Likely Resend isn't configured yet; share the link out-of-band.
- **`auth/email-already-in-use`** — a Firebase user with this email already exists from a prior attempt. Delete it from Firebase console → Authentication → Users, then re-run.
