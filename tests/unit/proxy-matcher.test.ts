import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { codeOf } from "../fixtures/source-code";
import { config } from "../../proxy";

const ROOT = process.cwd();

function routeHandlers(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeHandlers(full, out);
    else if (entry === "route.ts" || entry === "route.js") {
      out.push(full.slice(ROOT.length + 1).split("\\").join("/"));
    }
  }
  return out;
}

function matchesProxy(pathname: string): boolean {
  const source = config.matcher[0];
  return new RegExp(`^${source}$`).test(pathname);
}

describe("proxy matcher", () => {
  it("keeps website pages and cookie-authenticated APIs behind the proxy", () => {
    expect(matchesProxy("/hub")).toBe(true);
    expect(matchesProxy("/admin/employees")).toBe(true);
    expect(matchesProxy("/api/logs/ingest")).toBe(true);
    expect(matchesProxy("/api/profile/avatar")).toBe(true);
  });

  it("does not run for native APIs or cron handlers", () => {
    expect(matchesProxy("/api/mobile/me")).toBe(false);
    expect(matchesProxy("/api/mobile/tasks/123/status")).toBe(false);
    expect(matchesProxy("/api/cron/digest")).toBe(false);
    expect(matchesProxy("/api/cron/weekly-goals?job=monday")).toBe(false);
  });

  it("retains the existing static-asset exclusions", () => {
    expect(matchesProxy("/_next/static/chunks/app.js")).toBe(false);
    expect(matchesProxy("/_next/image")).toBe(false);
    expect(matchesProxy("/favicon.ico")).toBe(false);
    expect(matchesProxy("/images/logo.png")).toBe(false);
  });
});

describe("auth invariants for matcher-excluded route families", () => {
  it("every native route retains its Firebase bearer/device authenticator", () => {
    const routes = routeHandlers(join(ROOT, "app", "api", "mobile"));
    expect(routes.length).toBeGreaterThan(50);

    const missing = routes.filter(
      (route) => !/\bauthenticateMobileRequest\s*\(/.test(codeOf(route)),
    );
    expect(missing).toEqual([]);
  });

  it("every cron route fails behind its CRON_SECRET bearer check", () => {
    const routes = routeHandlers(join(ROOT, "app", "api", "cron"));
    expect(routes.length).toBeGreaterThan(30);

    const missing = routes.filter((route) => {
      const source = codeOf(route);
      return !(
        /process\.env\.CRON_SECRET/.test(source) &&
        /headers\.get\(["']authorization["']\)/i.test(source) &&
        /Bearer\s+\$\{/.test(source)
      );
    });
    expect(missing).toEqual([]);
  });
});
