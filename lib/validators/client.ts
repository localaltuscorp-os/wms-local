import { z } from "zod";

// Client name caps at 120 to leave headroom over the 80 we allow for
// departments — client names trend longer (e.g. "Lawrence & Mayo").
const NameSchema = z
  .string()
  .trim()
  .min(1, "Client name is required")
  .max(120, "Client name is too long");

export const ClientIdSchema = z.string().uuid("Invalid client id");

export const CreateClientSchema = z.object({
  name: NameSchema,
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type CreateClientInput = z.infer<typeof CreateClientSchema>;

export const UpdateClientSchema = z
  .object({
    name: NameSchema.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No changes to save.",
  });
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
