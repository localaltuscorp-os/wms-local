import { describe, it, expect } from "vitest";
import { isAcceptableAvatarUrl } from "@/lib/avatar-url";

describe("isAcceptableAvatarUrl", () => {
  it("accepts empty (clears avatar)", () => {
    expect(isAcceptableAvatarUrl("")).toBe(true);
  });
  it("accepts http(s) URLs", () => {
    expect(isAcceptableAvatarUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isAcceptableAvatarUrl("http://example.com/a.png")).toBe(true);
  });
  it("accepts root-relative preset/upload paths", () => {
    expect(isAcceptableAvatarUrl("/avatars/preset-01.svg")).toBe(true);
    expect(isAcceptableAvatarUrl("/api/profile/avatar/123")).toBe(true);
  });
  it("rejects protocol-relative (external) URLs", () => {
    expect(isAcceptableAvatarUrl("//evil.com/x.png")).toBe(false);
  });
  it("rejects bare/relative-without-slash and junk", () => {
    expect(isAcceptableAvatarUrl("avatars/preset-01.svg")).toBe(false);
    expect(isAcceptableAvatarUrl("javascript:alert(1)")).toBe(false);
    expect(isAcceptableAvatarUrl("ftp://x/y")).toBe(false);
  });
});
