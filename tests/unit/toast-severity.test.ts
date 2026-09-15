import { describe, expect, it } from "vitest";
import { toastKind } from "@/lib/toast-severity";

/**
 * A toast's colour is the only signal most of these messages carry. A green
 * tick beside "isn't connected yet" tells the user the opposite of what
 * happened, which is what this guards.
 */
describe("toast colour", () => {
  it("lets an explicit type win over the text", () => {
    // The heuristic must never override a caller who said what they meant -
    // including the deliberate cases where a success message reads negative.
    expect(toastKind("Saved.", "error")).toBe("error");
    expect(toastKind("Could not save.", "success")).toBe("success");
    expect(toastKind("Anything at all", "info")).toBe("info");
  });

  it("reds the real failure messages this app sends", () => {
    for (const m of [
      // The one that started this - a plain negative with no failure verb.
      "Aadhaar auto-fill isn't connected yet — enter the details manually.",
      "Aadhaar lookup timed out — enter the details manually.",
      "Aadhaar lookup returned an unexpected response — enter the details manually.",
      "No details found for this Aadhaar.",
      "Could not save the holiday.",
      "That date is already a holiday.".replace("already", "invalid"),
      "You already have 2 active devices — unable to add another.",
      "Only Ruchita and Rutvisha can change the holiday calendar.".replace(
        "can change",
        "cannot change",
      ),
      "This module is unavailable.",
      "Your session expired.",
      "The file is missing.",
    ]) {
      expect(toastKind(m), m).toBe("error");
    }
  });

  it("leaves ordinary successes green", () => {
    for (const m of [
      "Auto-filled 4 fields from Aadhaar.",
      "Letter issued, archived & emailed to someone@example.com.",
      "Holiday added - it now shows as a holiday on everyone's attendance.",
      "Diwali removed.",
      "Saved.",
      "Copied to clipboard.",
      "2 rows imported.",
    ]) {
      expect(toastKind(m), m).toBe("success");
    }
  });

  it("cannot judge a bare instruction — those must be typed at the call site", () => {
    // "Enter a valid 12-digit Aadhaar number." carries no failure word at all;
    // it reads like any other prompt. Reddening it would mean matching "valid",
    // which also sits inside genuinely positive messages. The Aadhaar field
    // passes type: "error" for exactly this reason - the heuristic is a
    // fallback, not a classifier, and this records where it stops.
    expect(toastKind("Enter a valid 12-digit Aadhaar number.")).toBe("success");
    expect(toastKind("Enter a valid 12-digit Aadhaar number.", "error")).toBe("error");
  });

  it("does not red a bare 'no' or 'not' — those appear in successes", () => {
    // Deliberately excluded from the patterns: reddening these would be worse
    // than the bug being fixed.
    expect(toastKind("Task marked not important.")).toBe("success");
    expect(toastKind("No changes to publish.")).toBe("success");
  });
});
