import { describe, it, expect } from "vitest";
import {
  TEMPLATE_KEYS,
  goalLevelTemplateKey,
  templateHref,
} from "@/lib/templates/keys";

/**
 * The template KEYS are the address the download buttons and the registry share
 * (lib/templates/keys.ts). These tests pin the two rules that decide which file
 * a person actually receives: which key a Goals level maps to, and what URL a
 * button builds.
 */

describe("goalLevelTemplateKey", () => {
  it("gives each level with its own template its own key", () => {
    expect(goalLevelTemplateKey("month")).toBe(TEMPLATE_KEYS.monthlyGoals);
    expect(goalLevelTemplateKey("quarter")).toBe(TEMPLATE_KEYS.quarterlyGoals);
    expect(goalLevelTemplateKey("year")).toBe(TEMPLATE_KEYS.yearlyGoals);
  });

  it("sends week and day to the level-agnostic Goals workbook, NOT the Weekly Goals module's", () => {
    // The Weekly Goals module's template has a different column set, so a level
    // mapped onto it would be handed a workbook its parser cannot read.
    expect(goalLevelTemplateKey("week")).toBe(TEMPLATE_KEYS.goals);
    expect(goalLevelTemplateKey("day")).toBe(TEMPLATE_KEYS.goals);
    expect(goalLevelTemplateKey("week")).not.toBe(TEMPLATE_KEYS.weeklyGoals);
  });

  it("falls back to the Goals workbook for an absent or unknown level", () => {
    expect(goalLevelTemplateKey(null)).toBe(TEMPLATE_KEYS.goals);
    expect(goalLevelTemplateKey(undefined)).toBe(TEMPLATE_KEYS.goals);
    expect(goalLevelTemplateKey("")).toBe(TEMPLATE_KEYS.goals);
    expect(goalLevelTemplateKey("fortnight")).toBe(TEMPLATE_KEYS.goals);
  });
});

describe("templateHref", () => {
  it("builds the one download URL, with no query when there is nothing to say", () => {
    expect(templateHref(TEMPLATE_KEYS.tasks)).toBe("/api/templates/tasks");
  });

  it("carries the level and period the Goals board is viewing", () => {
    expect(templateHref(TEMPLATE_KEYS.monthlyGoals, { level: "month", periodKey: "2026-07" })).toBe(
      "/api/templates/monthly_goals_bulk_import?level=month&periodKey=2026-07",
    );
  });

  it("carries the plan kind for the Projects workbook", () => {
    expect(templateHref(TEMPLATE_KEYS.projects, { kind: "milestone" })).toBe(
      "/api/templates/projects_bulk_import?kind=milestone",
    );
  });

  it("omits empty parameters rather than sending blanks", () => {
    expect(templateHref(TEMPLATE_KEYS.goals, { level: "", periodKey: null })).toBe(
      "/api/templates/goals",
    );
  });
});

describe("the key list", () => {
  it("has a unique string for every template", () => {
    const keys = Object.values(TEMPLATE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(typeof k).toBe("string");
  });
});
