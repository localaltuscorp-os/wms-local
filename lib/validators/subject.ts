import { z } from "zod";

const NameSchema = z
  .string()
  .trim()
  .min(1, "Subject name is required")
  .max(80, "Subject name is too long");

export const SubjectIdSchema = z.string().uuid("Invalid subject id");

export const CreateSubjectSchema = z.object({
  name: NameSchema,
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type CreateSubjectInput = z.infer<typeof CreateSubjectSchema>;

export const UpdateSubjectSchema = z
  .object({
    name: NameSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No changes to save." });
export type UpdateSubjectInput = z.infer<typeof UpdateSubjectSchema>;
