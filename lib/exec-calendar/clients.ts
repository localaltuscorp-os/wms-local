import { hexColors } from "./taxonomy";

/**
 * THE CLIENT LIST for calendar blocks (asked 2026-09-18).
 *
 * A fixed list in code with each client's sheet colour, replacing the picker
 * that listed every Client Engagement record. A block stores the client's KEY
 * (`exec_calendar_events.client_key`, migration 0237). Adding a client is one
 * line here; renaming the label is safe, changing a key orphans old blocks.
 *
 * PURE: shared by the editor, the grid, the hover card and the save action.
 */
export interface ExecClient {
  key: string;
  label: string;
  hex: string;
}

export const EXEC_CLIENTS: readonly ExecClient[] = [
  { key: "stellary", label: "Stellary", hex: "#FBCB9C" },
  { key: "vpinnacle", label: "Vpinnacle", hex: "#F36923" },
  { key: "hys", label: "HYS", hex: "#FF9900" },
  { key: "ehara", label: "Ehara", hex: "#F36923" },
  { key: "niaa", label: "Niaa", hex: "#FBCB9C" },
  { key: "sukhsons", label: "Sukhsons", hex: "#FF9900" },
  { key: "soul_storri", label: "Soul Storri", hex: "#FFEBD2" },
  { key: "l_and_m", label: "L&M", hex: "#FF9900" },
  { key: "anchorstone", label: "Anchorstone", hex: "#E3581C" },
  { key: "sarvottam", label: "Sarvottam", hex: "#F36923" },
  { key: "arihant", label: "Arihant", hex: "#F36923" },
  { key: "sattva", label: "Sattva", hex: "#FBCB9C" },
  { key: "kangaroo", label: "Kangaroo", hex: "#FF9900" },
];

const BY_KEY = new Map(EXEC_CLIENTS.map((c) => [c.key, c]));

export function isExecClientKey(v: string): boolean {
  return BY_KEY.has(v);
}

/** The client for a key, or null (no client, or a key since removed). */
export function execClient(key: string | null | undefined): ExecClient | null {
  return key ? BY_KEY.get(key) ?? null : null;
}

/** The shades for a client (see hexColors). */
export function clientColors(key: string) {
  return hexColors(execClient(key)?.hex ?? "#A6A6A6");
}
