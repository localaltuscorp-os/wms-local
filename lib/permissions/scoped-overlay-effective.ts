import type { EffectivePermission } from "./effective";

export type ScopedAccessLevel = "full" | "viewing" | "custom";

export interface ScopedAccessChoice {
  moduleKey: string;
  accessLevel: ScopedAccessLevel;
  navigationKeys: string[];
}

function applies(choice: ScopedAccessChoice, nodeKey: string): boolean {
  return nodeKey === choice.moduleKey || nodeKey.startsWith(`${choice.moduleKey}.`);
}

function customAllows(choice: ScopedAccessChoice, nodeKey: string): boolean {
  return choice.navigationKeys.some((key) => nodeKey === key || nodeKey.startsWith(`${key}.`));
}

/** Union selected scopes, then intersect result with pre-existing permission. */
export function applyScopedAccess(existing: EffectivePermission, nodeKey: string, choices: readonly ScopedAccessChoice[] | null): EffectivePermission {
  if (choices === null) return existing;
  let show = false;
  let view = false;
  let edit = false;
  for (const choice of choices) {
    if (!applies(choice, nodeKey)) continue;
    if (choice.accessLevel === "custom" && !customAllows(choice, nodeKey)) continue;
    show = true;
    view = true;
    if (choice.accessLevel === "full") edit = true;
  }
  return { show: existing.show && show, view: existing.view && view, edit: existing.edit && edit, ...(existing.deniedBy ? { deniedBy: existing.deniedBy } : {}) };
}
