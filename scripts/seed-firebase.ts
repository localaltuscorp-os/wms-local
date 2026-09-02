// Disabled for Altus Corp — fresh installs do not auto-create Firebase users.
// Use `pnpm bootstrap-admin` to create the first admin Firebase user; all
// subsequent users are created via the admin invite flow at /admin/employees.

console.log("Firebase seed disabled — use `pnpm bootstrap-admin` for the first admin,");
console.log("then invite teammates from /admin/employees once you're signed in.");
process.exit(0);
