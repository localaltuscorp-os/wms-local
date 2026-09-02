#!/usr/bin/env node
/**
 * PRODUCTION BRANCH GUARD.
 *
 * Refuses to continue unless HEAD is on `main`. Wired in front of the scripts
 * that can reach production (`pnpm deploy`), so a build kicked off from a
 * feature branch stops here instead of shipping.
 *
 * WHY THIS IS A .mjs AND NOT THE SHELL SNIPPET IN THE BRIEF. npm/pnpm run
 * scripts through `cmd.exe` on Windows, which is what this project is developed
 * on — a `[ "$CURRENT_BRANCH" != "main" ]` test is a syntax error there, so the
 * guard would either crash or, worse, exit 0 and wave the deploy through. Node
 * is the one interpreter guaranteed present wherever pnpm is.
 *
 * WHY IT READS CI's ref FIRST. On a GitHub runner the checkout is a detached
 * HEAD at a commit, so `git rev-parse --abbrev-ref HEAD` reports "HEAD" and
 * tells you nothing about which branch was dispatched. `GITHUB_REF_NAME` is the
 * authoritative answer there.
 */

import { execSync } from "node:child_process";

const REQUIRED = "main";

/** Loud, deliberate escape hatch. Emergencies exist; silence does not help
 *  them. Anyone using this has to type it, and it is echoed in the log. */
const OVERRIDE = process.env.ALLOW_NON_MAIN_DEPLOY === "1";

function currentBranch() {
  // CI first — see the note above about detached HEAD on runners.
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const branch = currentBranch();

if (branch === null) {
  console.error(
    "\x1b[31mError:\x1b[0m could not determine the current git branch.\n" +
      "  Deployments are restricted to `main`, and a guard that cannot read the\n" +
      "  branch has to fail closed.",
  );
  process.exit(1);
}

if (branch === "HEAD") {
  console.error(
    "\x1b[31mError:\x1b[0m HEAD is detached — there is no branch to check.\n" +
      "  Run `git checkout main` first.",
  );
  process.exit(1);
}

if (branch !== REQUIRED) {
  if (OVERRIDE) {
    // Checked HERE, inside the failing case. An override tested after the
    // `process.exit(1)` below can never run — that is a guard with a documented
    // escape hatch that does not actually exist, which is worse than no hatch.
    console.warn(
      `\x1b[33m!\x1b[0m ALLOW_NON_MAIN_DEPLOY=1 — building from \`${branch}\`, not \`${REQUIRED}\`.\n` +
        "  This ships code that is not on the production branch.",
    );
    process.exit(0);
  }
  console.error(
    `\x1b[31mError:\x1b[0m deployments are restricted strictly to the \`${REQUIRED}\` branch.\n` +
      `  You are on \`${branch}\`.\n\n` +
      "  Land the work first:\n" +
      `    git checkout ${REQUIRED}\n` +
      `    git pull origin ${REQUIRED}\n` +
      `    git merge <your-branch>      # or merge the PR on GitHub\n` +
      "    pnpm deploy\n\n" +
      "  Override (emergencies only): ALLOW_NON_MAIN_DEPLOY=1 pnpm deploy",
  );
  process.exit(1);
}

console.log(`\x1b[32m✓\x1b[0m on \`${branch}\` — cleared to build for production.`);
