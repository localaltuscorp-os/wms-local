import { parse } from "csv-parse/sync";
import { z } from "zod";

const BoolSchema = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : /^true$/i.test(v.trim())));

export const LegacyEmployeeRowSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(["doer", "initiator", "both"]),
    department: z
      .string()
      .trim()
      .max(80)
      .optional()
      .nullable()
      .transform((v) => (v && v !== "" ? v : null)),
    is_admin: BoolSchema,
  })
  .transform((r) => ({
    name: r.name,
    email: r.email,
    role: r.role,
    department: r.department,
    isAdmin: r.is_admin,
  }));
export type LegacyEmployeeRow = z.infer<typeof LegacyEmployeeRowSchema>;

export const LegacyTaskRowSchema = z.object({
  doer: z.string().trim().min(1),
  initiator: z.string().trim().min(1),
  assignDate: z.string().trim().min(1),
  dueDate: z.string().trim().min(1),
  status: z.string().trim().min(1),
  subject: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v !== "" ? v : null)),
  description: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v !== "" ? v : null)),
  priority: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z
        .enum(["imp_urgent", "imp_not_urgent", "not_imp_urgent", "not_imp_not_urgent"])
        .optional()
        .nullable(),
    )
    .transform((v) => v ?? null),
});
export type LegacyTaskRow = z.infer<typeof LegacyTaskRowSchema>;

export interface ParseResult<T> {
  rows: T[];
  errors: { line: number; message: string; raw: Record<string, unknown> }[];
}

export function parseLegacyEmployees(csv: string): ParseResult<LegacyEmployeeRow> {
  return runParse<LegacyEmployeeRow>(csv, LegacyEmployeeRowSchema);
}
export function parseLegacyTasks(csv: string): ParseResult<LegacyTaskRow> {
  return runParse<LegacyTaskRow>(csv, LegacyTaskRowSchema);
}

function runParse<T>(csv: string, schema: z.ZodTypeAny): ParseResult<T> {
  let raw: Record<string, unknown>[];
  try {
    raw = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
  } catch (err) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          message: (err as Error).message ?? "csv parse failure",
          raw: {},
        },
      ],
    };
  }
  const rows: T[] = [];
  const errors: ParseResult<T>["errors"] = [];
  raw.forEach((r, i) => {
    const res = schema.safeParse(r);
    if (res.success) rows.push(res.data as T);
    else errors.push({ line: i + 2, message: res.error.issues[0]?.message ?? "invalid", raw: r });
  });
  return { rows, errors };
}
