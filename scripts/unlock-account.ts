/**
 * BREAK-GLASS: release a locked account from the command line.
 *
 * For when the app itself cannot be reached — a bad deploy, everyone locked out
 * at once — and the in-app screen (/account-locks) is therefore unavailable.
 *
 * Usage:
 *   pnpm unlock                                  # list every locked account
 *   pnpm unlock someone@altuscorp.in             # report one, change nothing
 *   pnpm unlock someone@altuscorp.in --apply     # release it
 *
 * The `unlock` script passes `--conditions=react-server`, which this file needs:
 * lib/auth/account-lockout.ts imports `server-only`, and that package throws when
 * plain Node resolves it. Without the flag the script dies on its first import.
 *
 * Without --apply it only reports the state. There is no authorisation check
 * here and there cannot be one: whoever holds the production DATABASE_URL can
 * already write this table directly. That is why the in-app path checks
 * `canUnlockAccounts` instead, and why every unlock is logged.
 */
import { getLockoutState, listLockedAccounts, unlockAccount } from "../lib/auth/account-lockout";

const email = process.argv[2]?.trim().toLowerCase();
const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  if (!email) {
    const locked = await listLockedAccounts();
    if (locked.length === 0) {
      console.log("Nobody is locked out.");
    } else {
      console.log(`${locked.length} locked account(s):`);
      for (const r of locked) {
        console.log(`  ${r.email}${r.employeeName ? ` (${r.employeeName})` : ""} — locked ${r.lockedAt?.toISOString()}`);
      }
    }
    console.log("\nPass an email to unlock one:  scripts/unlock-account.ts <email> --apply");
    return;
  }

  const before = await getLockoutState(email);
  console.log(`${email}: ${before.locked ? "LOCKED" : "not locked"} · ${before.failedCount} failed attempt(s)`);
  if (!before.locked && before.failedCount === 0) {
    console.log("Nothing to do.");
    return;
  }
  if (!apply) {
    console.log("Dry run. Re-run with --apply to clear it.");
    return;
  }
  await unlockAccount(email, null);
  const after = await getLockoutState(email);
  console.log(`Unlocked. Now: ${after.locked ? "STILL LOCKED (unexpected)" : "not locked"} · ${after.failedCount} failed attempt(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
