import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { codeOf } from "../fixtures/source-code";

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
];

/**
 * KNOWN DEBT. Exact counts, so this can only be reduced by wiring handlers.
 * Update the number as each tranche lands.
 *
 * ⚠️ A COUNT THAT ROSE IS NOT NECESSARILY A REGRESSION. These numbers went UP by
 * 1/1/4 on 2026-09-21 because the fork merge (ad554486 → da534f7c) landed six new
 * unguarded handlers, not because an existing guard was removed — see the reason
 * on each entry. A DROP is always work done. When a count changes, say which.
 */
const PENDING: readonly { prefix: string; count: number; reason: string }[] = [
  {
    prefix: "app/(app)/",
    count: 29,
    reason:
      "TRANCHES 1–2 — the export/download handlers. These are the highest-value remaining: revoking a module hides its screen while `/salary/export.xlsx`, `/tasks/export.pdf` and their siblings still hand over the same data. Most resolve to a node already (they sit under the page's prefix), so wiring is one guard call each with no catalogue change. 29 = 28 before the fork merge + `salary/incentive-breakup/[employeeId]`, which hands over one person's incentive breakdown.",
  },
  {
    prefix: "app/(admin)/",
    count: 3,
    reason:
      "TRANCHE 2 — the admin activity and employee exports, alongside closing the Admin Panel pages. 3 = 2 before the fork merge + `admin/upload-master/download/[key]`, which serves a bulk-import template by key.",
  },
  {
    prefix: "app/api/",
    count: 30,
    reason:
      "TRANCHE 3 — the HR, reports, training and media endpoints, including the policy downloads and the PDF/email renderers. Several render through headless Chromium or send mail, so they matter as much as the Letters four that are already closed. 30 = 26 before the fork merge + 4 the merge added: `hr/records/[personId]/zip` (one person's WHOLE HR record), `hr/records/drive/{connect,run}` (Drive OAuth + the job that writes to it) and `jd/attachments/[id]`. The zip and the two Drive handlers are the most sensitive of the four and want wiring first.",
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

  it("finds the handlers at all — a walk that silently finds nothing proves nothing", () => {
    expect(handlers.length).toBeGreaterThan(100);
  });

  it("every exemption and pending entry states a real reason", () => {
    for (const e of EXEMPT) {
      expect(e.reason.length, `${e.prefix} needs a real reason`).toBeGreaterThan(40);
    }
    for (const p of PENDING) {
      expect(p.reason.length, `${p.prefix} needs a real reason`).toBeGreaterThan(40);
    }
  });

  it("the debt is EXACTLY the recorded size — drift in either direction fails", () => {
    // A new unguarded handler raises a count; wiring one lowers it. Both are
    // failures until the numbers are updated, so this list cannot rot into a
    // rubber stamp and cannot be quietly ignored.
    const open = unguarded();
    const actual = new Map<string, number>();
    for (const rel of open) {
      for (const p of PENDING) {
        if (rel.startsWith(p.prefix)) {
          actual.set(p.prefix, (actual.get(p.prefix) ?? 0) + 1);
          break;
        }
      }
    }

    const mismatches: string[] = [];
    for (const p of PENDING) {
      const got = actual.get(p.prefix) ?? 0;
      if (got !== p.count) {
        mismatches.push(`${p.prefix}: recorded ${p.count}, found ${got}`);
      }
    }
    // Anything unguarded that belongs to NO pending area is a handler nobody has
    // classified — the failure this test exists for.
    const unclassified = open.filter((rel) => !PENDING.some((p) => rel.startsWith(p.prefix)));

    expect(unclassified).toEqual([]);
    expect(mismatches).toEqual([]);
  });

  it("prints the live inventory, so the next tranche is planned from real counts", () => {
    const open = unguarded();
    const byArea = new Map<string, string[]>();
    for (const rel of open) {
      const area = rel.split("/").slice(0, 3).join("/");
      const list = byArea.get(area) ?? [];
      list.push(rel);
      byArea.set(area, list);
    }
    if (open.length) {
      console.log(
        `\n[route-handler-coverage] ${open.length} handler(s) still to wire:\n` +
          [...byArea.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([area, list]) => `  ${String(list.length).padStart(3)}  ${area}`)
            .join("\n"),
      );
    }
    expect(true).toBe(true);
  });
});
