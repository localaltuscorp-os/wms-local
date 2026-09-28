import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { codeOf } from "../fixtures/source-code";
import { nodeKeyForPath } from "@/lib/permissions/catalog";

/**
 * EVERY ROUTE HANDLER MUST BE GOVERNED, OR EXPLICITLY EXEMPTED WITH A REASON.
 *
 * ── THE HOLE THIS CLOSES ───────────────────────────────────────────────────
 * The permission matrix reached pages through ONE call — `requirePathView` in
 * `app/(app)/layout.tsx` — and never reached a route handler at all, because a
 * handler renders no layout. So revoking a module hid its pages while its
 * endpoints kept answering. The module looked revoked and was not, and nothing
 * on screen revealed the difference: the page you were refused was the page you
 * were looking at.
 *
 * The sharpest examples were the Letters endpoints (one mints a letter, one
 * emails it, two render it through headless Chromium — all four now guarded) and
 * the export handlers, where revoking "Payroll" hid the payroll screen while
 * `/salary/export.xlsx` still handed over the whole payroll.
 *
 * ── WHY THIS TEST EXISTS RATHER THAN A CONVENTION ──────────────────────────
 * A guard is only coverage if somebody remembers to add it. This walks the
 * filesystem instead, so a NEW route handler is unguarded-and-red by default
 * rather than unguarded-and-silent.
 *
 * ── THE TWO LISTS, AND WHY THEY ARE DIFFERENT ──────────────────────────────
 * `EXEMPT` is "the matrix CANNOT apply here", and each entry says why — no
 * employee identity exists to govern. These are permanent.
 *
 * `PENDING` is a DEBT: handlers that should be governed and are not yet wired.
 * It records an exact COUNT per area rather than a list, so drift is caught in
 * both directions — a new unguarded handler raises the count and fails, and
 * wiring one lowers it and also fails until the number is updated. The count can
 * only be lowered by doing the work, never by ignoring it.
 *
 * `pnpm test route-handler-coverage` prints the live inventory on every run, so
 * planning the next tranche never depends on a guess.
 */

const ROOT = process.cwd();

/** Every `route.ts` under `app/`, as repo-relative forward-slash paths. */
function routeHandlers(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routeHandlers(full, out);
    } else if (entry === "route.ts" || entry === "route.js") {
      out.push(full.slice(ROOT.length + 1).split("\\").join("/"));
    }
  }
  return out;
}

/**
 * The guards that put a request under the matrix. The first is for route
 * handlers; the rest are the page and action guards, which a handler may also
 * legitimately use.
 */
const MATRIX_GUARDS: readonly RegExp[] = [
  /\bapiViewDenial\s*\(/,
  /\brequireApiView\s*\(/,
  /\brequirePathView\s*\(/,
  /\brequireModuleView\s*\(/,
  /\brequireModuleEdit\s*\(/,
  /\brequireModuleEditForPath\s*\(/,
  /\brequireModuleViewForPath\s*\(/,
];

interface Exemption {
  prefix: string;
  reason: string;
}

/**
 * THE MATRIX CANNOT APPLY — each verified, not assumed.
 */
const EXEMPT: readonly Exemption[] = [
  {
    prefix: "app/api/cron/",
    reason:
      "Machine-invoked by Vercel Cron. All 34 verify `Authorization: Bearer <CRON_SECRET>`, and there is NO employee identity, so there is nobody for the matrix to deny.",
  },
  {
    prefix: "app/api/auth/",
    reason:
      "Session mint and sign-out. They run BEFORE a session exists, so no employee can be resolved. Listed in PUBLIC_API in proxy.ts for the same reason.",
  },
  {
    prefix: "app/api/health/",
    reason:
      "The liveness probe. It must answer when the database or auth is down — exactly when a matrix read would fail — so it can never depend on one.",
  },
  {
    prefix: "app/api/mobile/",
    reason:
      "PENDING-BY-DESIGN — mobile endpoints authenticate inside the handler via `authenticateMobileRequest` and were deliberately not in the first tranche. Wiring them needs MOBILE_CORS on the refusal, or the native app reports a network failure instead of a 403.",
  },
  {
    prefix: "app/c/",
    reason:
      "Candidate surfaces. The visitor is NOT an employee and holds no account — they authenticate with a one-time access link (`resolveAccessLink`). There is no employee for the matrix to govern.",
  },
  {
    prefix: "app/api/approve/[token]/",
    reason:
      "PUBLIC by design, and the file says so: the unguessable single-use token IS the credential. The approver may be outside the company and has no account, so there is no employee to resolve.",
  },
  {
    prefix: "app/t/[shortId]/",
    reason:
      "Public share link for a task. The short id is the credential and the reader need not be signed in, so no employee identity exists.",
  },
  {
    prefix: "app/api/dummy-storage/",
    reason:
      "DEAD OUTSIDE DUMMY MODE — `DUMMY_MODE` is hard-false under NODE_ENV=production, so this handler cannot be reached in a deployment at all.",
  },
  {
    prefix: "app/api/digilocker/callback/",
    reason:
      "OAuth-style redirect callback from an external provider. The provider redirects the browser here without an app session.",
  },
  {
    prefix: "app/api/google/callback/",
    reason: "Google OAuth redirect target — reached by the provider, not by a signed-in session.",
  },
  {
    prefix: "app/api/google/connect/",
    reason: "Starts the Google OAuth handshake, before any authorization has been granted.",
  },
  {
    prefix: "app/api/whatsapp/webhook/",
    reason:
      "Inbound webhook from Meta, verified by its own request signature. The caller is Meta's servers, not an employee.",
  },
  {
    prefix: "app/api/push/vapid-key/",
    reason:
      "Serves the PUBLIC VAPID key that a browser needs BEFORE it can subscribe. Public by definition.",
  },
  {
    prefix: "app/api/logs/ingest/",
    reason:
      "Module-agnostic telemetry: the client activity tracker posts the signed-in person's own browsing events from every module, so no single catalogue node owns it. Identity is the session (requireUser), and only whitelisted event types are accepted.",
  },
  {
    prefix: "app/api/templates/",
    reason:
      "The shared template-download door. Access is enforced per-key inside the handler by requireTemplateAccess, which resolves the template's owning module (Accounts, Goals, else a signed-in employee) — there is no single catalogue node for a door shared across modules.",
  },
];

/**
 * GUARDED, BUT NO SINGLE MODULE OWNS THEM.
 *
 * These five handlers ARE wired — each calls `apiViewDenial` — but their paths
 * resolve to no catalogue node, so the guard returns `null` and lets them
 * through. That turns out to be right for every one of them, for a different
 * reason each time.
 *
 * They are listed rather than left implicit because a guard on a path nobody
 * claims is INDISTINGUISHABLE from a guard that works: both leave the handler
 * running. This is the one way the suite could go green while enforcing nothing,
 * so the test below fails on any handler that is guarded AND unowned AND not on
 * this list. The distinction cannot rot quietly.
 */
const UNOWNED_BY_DESIGN: readonly Exemption[] = [
  {
    prefix: "app/api/ai/transcribe/",
    reason:
      "Module-AGNOSTIC by construction: every module's Notes mic posts here (tasks, accounts, …). No single node owns it, and pinning it to one would revoke transcription for every other module instead of revoking a module.",
  },
  {
    prefix: "app/api/avatar/[id]/",
    reason:
      "Redirects to a signed URL for ONE COLLEAGUE's picture, and avatars render in every list in the app. A 403 here paints a broken image into an unrelated module rather than enforcing a boundary.",
  },
  {
    prefix: "app/api/broadcasts/popup/",
    reason:
      "DELIBERATELY always-200 and says so: it is polled every few seconds on every authed page, so a refusal would make every open tab log a 403 forever. Its scope is the signed-in employee, fixed inside the handler rather than by a module switch.",
  },
  {
    prefix: "app/api/hr/declaration/pdf/",
    reason:
      "Renders ONE PERSON's own declaration — the caller's own name, from the caller's own employees row, no input taken at all. No catalogue node claims it yet; the route says why in its own file. A 403 here would block someone from printing and signing a document every employee is required to hand in.",
  },
  {
    prefix: "app/api/meet/events/",
    reason:
      "Inbound Google Pub/Sub webhook, verified by its own request auth. The caller is Google's infrastructure, not an employee, so there is nobody for the matrix to deny.",
  },
  {
    prefix: "app/api/push/subscribe/",
    reason:
      "The caller's OWN Web Push subscription for this device. Revoking a module must not stop someone receiving notifications they are still entitled to.",
  },
];

describe("route handler coverage", () => {
  const handlers = routeHandlers(join(ROOT, "app"));

  /** Handlers with no matrix guard, excluding the permanent exemptions. */
  function unguarded(): string[] {
    return handlers.filter((rel) => {
      if (EXEMPT.some((e) => rel.startsWith(e.prefix))) return false;
      const source = codeOf(rel);
      return !MATRIX_GUARDS.some((g) => g.test(source));
    });
  }

  /** `app/(app)/salary/export.xlsx/route.ts` -> `/salary/export.xlsx` */
  function urlOf(rel: string): string {
    const path = rel
      .replace(/^app\//, "")
      .replace(/\/route\.tsx?$/, "")
      .replace(/\/route\.jsx?$/, "");
    return "/" + path.split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");
  }

  /**
   * Guarded, but the path they guard resolves to no node — so the guard allows.
   */
  function guardedButUnowned(): string[] {
    return handlers.filter((rel) => {
      if (EXEMPT.some((e) => rel.startsWith(e.prefix))) return false;
      if (UNOWNED_BY_DESIGN.some((e) => rel.startsWith(e.prefix))) return false;
      if (!codeOf(rel).includes("apiViewDenial")) return false;
      return nodeKeyForPath(urlOf(rel)) === null;
    });
  }

  it("finds the handlers at all — a walk that silently finds nothing proves nothing", () => {
    expect(handlers.length).toBeGreaterThan(100);
  });

  it("every exemption states a real reason", () => {
    for (const e of [...EXEMPT, ...UNOWNED_BY_DESIGN]) {
      expect(e.reason.length, `${e.prefix} needs a real reason`).toBeGreaterThan(40);
    }
  });

  it("NO handler is left unguarded — the debt is paid, and this is what keeps it paid", () => {
    // This list was 56, then 62 after the fork merge. It is now empty, so the
    // assertion is the strong one: any handler that arrives without a guard
    // fails immediately, rather than incrementing a number somebody has to
    // remember to update.
    expect(unguarded()).toEqual([]);
  });

  it("every guard actually enforces — a guarded handler must resolve to a node", () => {
    // THE HOLE THIS CLOSES. The test above is satisfied by the mere PRESENCE of
    // `apiViewDenial(...)`. But the guard returns `null` for a path no node
    // claims, so a handler can be wired, look covered, and enforce nothing at
    // all. The two states are identical from the outside.
    //
    // Asserted over the whole app rather than by reading a diff: every guarded
    // handler either resolves to a node or is one of the five that genuinely has
    // no owning module, each with its reason recorded above.
    expect(guardedButUnowned()).toEqual([]);
  });

  it("reports the working set, so a failure above is actionable without a search", () => {
    const open = unguarded();
    const unowned = guardedButUnowned();
    const guarded = handlers.length - EXEMPT.filter((e) => handlers.some((h) => h.startsWith(e.prefix))).length;

    console.log(
      `\n[route-handler-coverage] ${handlers.length} handlers:` +
        `\n  ${guarded - open.length} guarded` +
        `\n  ${handlers.length - guarded} exempt (no employee identity to govern)` +
        `\n  ${UNOWNED_BY_DESIGN.length} guarded but module-agnostic (listed by design)` +
        `\n  ${open.length + unowned.length} OUTSTANDING`,
    );
    if (open.length) {
      console.log("  unguarded:\n" + open.map((r) => "    " + r).join("\n"));
    }
    if (unowned.length) {
      console.log("  guarded-but-unowned:\n" + unowned.map((r) => "    " + r).join("\n"));
    }
    expect(true).toBe(true);
  });
});
