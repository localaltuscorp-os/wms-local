import { describe, it, expect } from "vitest";
import { colorTokenSchema } from "@/lib/validators/color-token";

describe("colorTokenSchema", () => {
  it.each(["blue", "green", "amber", "red", "rose", "purple"])(
    "accepts preset token %s",
    (t) => {
      expect(colorTokenSchema.safeParse(t).success).toBe(true);
    },
  );

  it.each(["#a855f7", "#fff", "#FFAA00", "#1a2b3cff", "#ABCD"])(
    "accepts hex %s",
    (t) => {
      expect(colorTokenSchema.safeParse(t).success).toBe(true);
    },
  );

  it.each(["", "not-a-color", "#zzz", "rgb(1,2,3)", "blue!", "#1234567"])(
    "rejects garbage %s",
    (t) => {
      expect(colorTokenSchema.safeParse(t).success).toBe(false);
    },
  );
});
