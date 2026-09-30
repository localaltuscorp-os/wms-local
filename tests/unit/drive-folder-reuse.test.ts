import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { googleDriveClient } = await import("@/lib/hr/records-export/drive-google");

const FILES = "https://www.googleapis.com/drive/v3/files";
const realFetch = globalThis.fetch;
let calls: { method: string; url: string }[] = [];
let folders: Record<string, string> = {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  folders = {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });

    if (method === "GET" && url.includes("?q=")) {
      const query = decodeURIComponent(url.split("?q=")[1]!.split("&")[0]!);
      const name = /name = '(.*?)(?<!\\)'/.exec(query)?.[1]?.replace(/\\'/g, "'").replace(/\\\\/g, "\\") ?? "";
      const parent = /'([^']*)' in parents/.exec(query)?.[1] ?? "";
      const id = folders[`${parent}/${name}`];
      return json({ files: id ? [{ id }] : [] });
    }
    if (method === "POST" && url.startsWith(FILES)) {
      return json({ id: `created-${calls.filter((call) => call.method === "POST").length}` });
    }
    return json({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function creates(): number {
  return calls.filter((call) => call.method === "POST" && call.url.startsWith(FILES)).length;
}

describe("Drive folder reuse", () => {
  it("reuses the existing module folder under the backup root", async () => {
    folders["backup-root/WMS"] = "module-wms";
    const drive = googleDriveClient("synthetic-token");

    const id = await drive.ensureFolder({ name: "WMS", parentId: "backup-root", knownId: null });

    expect(id).toBe("module-wms");
    expect(creates()).toBe(0);
  });

  it("reuses the same dated folder within a module", async () => {
    folders["module-wms/2026-09-29"] = "dated-folder";
    const drive = googleDriveClient("synthetic-token");

    const id = await drive.ensureFolder({ name: "2026-09-29", parentId: "module-wms", knownId: null });

    expect(id).toBe("dated-folder");
    expect(creates()).toBe(0);
  });

  it("does not reuse a same-name folder from another parent", async () => {
    folders["module-hr/2026-09-29"] = "hr-date";
    const drive = googleDriveClient("synthetic-token");

    const id = await drive.ensureFolder({ name: "2026-09-29", parentId: "module-wms", knownId: null });

    expect(id).toBe("created-1");
    expect(creates()).toBe(1);
  });

  it("escapes apostrophes in folder names", async () => {
    const drive = googleDriveClient("synthetic-token");

    await drive.ensureFolder({ name: "Test User's files", parentId: "backup-root", knownId: null });

    const lookup = calls.find((call) => call.url.includes("?q="));
    expect(decodeURIComponent(lookup!.url)).toContain("name = 'Test User\\'s files'");
  });
});
