import { z } from "zod";

const ListKeySchema = z
  .string()
  .trim()
  .min(1, "Category is required")
  .max(60, "Category name is too long")
  .regex(/^[a-z][a-z0-9_]*$/, "Category key must be lowercase letters, numbers and underscores");

const LabelSchema = z
  .string()
  .trim()
  .min(1, "Option name is required")
  .max(80, "Option name is too long");

export const DdOptionIdSchema = z.string().uuid("Invalid option id");

export const CreateDdOptionSchema = z.object({
  listKey: ListKeySchema,
  label: LabelSchema,
});
export type CreateDdOptionInput = z.infer<typeof CreateDdOptionSchema>;

/** Starting a category that has never had a row before. */
export const CreateDdCategorySchema = z.object({
  categoryLabel: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(60, "Category name is too long"),
  firstOptionLabel: LabelSchema,
});
export type CreateDdCategoryInput = z.infer<typeof CreateDdCategorySchema>;

export const RetireDdOptionSchema = z.object({
  id: DdOptionIdSchema,
});
export type RetireDdOptionInput = z.infer<typeof RetireDdOptionSchema>;
