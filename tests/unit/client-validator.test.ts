import { describe, it, expect } from "vitest";
import { CreateClientSchema } from "@/lib/validators/client";

describe("CreateClientSchema", () => {
  it("accepts a normal client name", () => {
    expect(CreateClientSchema.safeParse({ name: "Altus Corp" }).success).toBe(
      true,
    );
  });

  it("accepts names with ampersands and punctuation", () => {
    expect(
      CreateClientSchema.safeParse({ name: "Lawrence & Mayo" }).success,
    ).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const res = CreateClientSchema.safeParse({ name: "  Sarvottam  " });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.name).toBe("Sarvottam");
  });

  it("rejects empty / whitespace-only names", () => {
    expect(CreateClientSchema.safeParse({ name: "" }).success).toBe(false);
    expect(CreateClientSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects names longer than 120 chars", () => {
    expect(
      CreateClientSchema.safeParse({ name: "X".repeat(121) }).success,
    ).toBe(false);
    expect(
      CreateClientSchema.safeParse({ name: "X".repeat(120) }).success,
    ).toBe(true);
  });
});
