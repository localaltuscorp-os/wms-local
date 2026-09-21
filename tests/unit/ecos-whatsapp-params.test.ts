import { describe, it, expect } from "vitest";
import {
  WA_PARAM_LIMITS,
  buildBroadcastTemplateComponents,
  cleanTemplateParam,
  whatsappOutcomeOf,
} from "@/lib/ecos/whatsapp-params";

describe("cleanTemplateParam", () => {
  it("removes what Meta rejects: newlines, tabs, runs of spaces, emptiness", () => {
    expect(cleanTemplateParam("Line one\nLine\ttwo    end", 100)).toBe("Line one Line two end");
    expect(cleanTemplateParam("   ", 10)).toBe("-");
    expect(cleanTemplateParam(null, 10)).toBe("-");
  });

  it("cuts long text with an ellipsis inside the limit", () => {
    const out = cleanTemplateParam("a".repeat(500), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildBroadcastTemplateComponents", () => {
  it("fills the four body variables in order", () => {
    const [body] = buildBroadcastTemplateComponents({
      from: "Altus HR",
      title: "Office closed Friday",
      bodyText: "The office is closed on Friday for maintenance.\nPlease work from home.",
      link: "https://os.altuscorp.in/communications/abc",
    }) as Array<{ type: string; parameters: Array<{ type: string; text: string }> }>;
    expect(body?.type).toBe("body");
    expect(body?.parameters.map((p) => p.text)).toEqual([
      "Altus HR",
      "Office closed Friday",
      "The office is closed on Friday for maintenance. Please work from home.",
      "https://os.altuscorp.in/communications/abc",
    ]);
    for (const p of body!.parameters) {
      expect(p.text).not.toMatch(/[\n\t]| {4,}/);
    }
    expect(body!.parameters[2]!.text.length).toBeLessThanOrEqual(WA_PARAM_LIMITS.summary);
  });

  it("falls back to the subject when there is no body text", () => {
    const [body] = buildBroadcastTemplateComponents({ from: "HR", title: "Subject", bodyText: "", link: "x" }) as Array<{
      parameters: Array<{ text: string }>;
    }>;
    expect(body?.parameters[2]?.text).toBe("Subject");
  });
});

describe("whatsappOutcomeOf", () => {
  it("reads each stored outcome", () => {
    expect(whatsappOutcomeOf({ whatsapp: { status: "sent", id: "wamid.1", at: "t" } })).toEqual({
      status: "sent",
      id: "wamid.1",
      at: "t",
    });
    expect(whatsappOutcomeOf({ whatsapp: { status: "skipped", reason: "no_phone", at: "t" } })?.status).toBe(
      "skipped",
    );
    expect(whatsappOutcomeOf({ whatsapp: { status: "failed", reason: "Invalid param", at: "t" } })).toEqual({
      status: "failed",
      reason: "Invalid param",
      at: "t",
    });
  });

  it("returns null for nothing or nonsense", () => {
    expect(whatsappOutcomeOf({})).toBeNull();
    expect(whatsappOutcomeOf(null)).toBeNull();
    expect(whatsappOutcomeOf({ whatsapp: { status: "skipped", reason: "made_up" } })).toBeNull();
    expect(whatsappOutcomeOf({ whatsapp: "sent" })).toBeNull();
  });
});
