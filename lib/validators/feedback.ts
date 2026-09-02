import { z } from "zod";
import { FEEDBACK_TYPES } from "@/lib/training/feedback-templates";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v && v.length > 0 ? v : null));
const optionalUuid = z.string().uuid().optional().nullable().transform((v) => v ?? null);

export const CreateFeedbackSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  ratedEmployeeId: optionalUuid,
  ratedName: optionalText(160),
  clientName: optionalText(160),
  serviceId: optionalUuid,
  rating: z.number().int().min(1).max(5).optional().nullable().transform((v) => v ?? null),
  q1: optionalText(4000),
  q2: optionalText(4000),
  voiceNotePath: optionalText(500),
  voiceTranscript: optionalText(5000),
  picturePath: optionalText(500),
  escalate: z.boolean().default(false),
  escalatedToId: optionalUuid,
});
export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;

export const ResolveFeedbackSchema = z.object({
  id: z.string().uuid(),
  resolutionHow: z.string().trim().min(1, "Explain how it was resolved.").max(4000),
});

export const FeedbackIdSchema = z.object({ id: z.string().uuid() });
