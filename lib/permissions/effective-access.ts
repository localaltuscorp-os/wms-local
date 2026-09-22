/**
 * PURE COMPOSITION FOR EFFECTIVE ACCESS.
 *
 * When several roles grant the same (module, action), the effective access view
 * shows ONE row with the combined sources — never duplicate rows for the same
 * permission. This is the merge, extracted pure so it can be unit-tested without
 * a database.
 */

export interface EffectiveAccessLine {
  nodeKey: string;
  module: string;
  page: string;
  action: string;
  scope: string | null;
  source: string;
}

/**
 * Merge identical (node, action) rows, combining their sources into one
 * "Role A · Role B" string. Preserves scope when every source agrees on it.
 */
export function mergeEffectiveAccessLines(rows: EffectiveAccessLine[]): EffectiveAccessLine[] {
  const map = new Map<string, EffectiveAccessLine>();
  for (const r of rows) {
    const key = `${r.nodeKey}|${r.action}`;
    const existing = map.get(key);
    if (existing) {
      const sources = new Set(existing.source.split(" · ").map((s) => s.trim()).filter(Boolean));
      sources.add(r.source.trim());
      existing.source = [...sources].sort().join(" · ");
      // When sources disagree on scope, dropping it is the honest answer.
      if (existing.scope !== r.scope) existing.scope = null;
    } else {
      map.set(key, { ...r });
    }
  }
  return [...map.values()].sort(
    (a, b) => a.module.localeCompare(b.module) || a.action.localeCompare(b.action),
  );
}
