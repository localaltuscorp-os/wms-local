import { z } from "zod";
import { STATUS_COLOR_TOKENS } from "@/db/enums";

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// Accept either a preset token (blue/green/amber/red/rose/purple) or a raw
// hex string. The ColorPicker emits both forms; status_settings stores
// whichever is currently selected and consumers resolve via colorToCss().
export const colorTokenSchema = z.union([
  z.enum(STATUS_COLOR_TOKENS),
  z.string().regex(HEX, "Must be a 3-, 4-, 6-, or 8-digit hex (e.g. #a855f7)"),
]);

export type ColorToken = z.infer<typeof colorTokenSchema>;
