import { z } from "zod";

const NameSchema = z
  .string()
  .trim()
  .min(1, "Department name is required")
  .max(80, "Department name is too long");

export const DepartmentIdSchema = z.string().uuid("Invalid department id");

export const CreateDepartmentSchema = z.object({
  name: NameSchema,
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z
  .object({
    name: NameSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No changes to save.",
  });
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
