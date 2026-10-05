import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workspaceForPath } from "@/lib/workspaces";
import { nodeKeyForPath } from "@/lib/permissions/catalog";

describe("the legacy WMS entry", () => {
  it("keeps /wms inside the WMS workspace access boundary", () => {
    expect(workspaceForPath("/wms")).toBe("wms");
    expect(nodeKeyForPath("/wms")).toBe("wms");
  });

  it("forwards old WMS links through the canonical workspace entry", () => {
    const page = readFileSync("app/(app)/wms/page.tsx", "utf8");
    expect(page).toContain('redirect("/ws/wms")');
  });
});
