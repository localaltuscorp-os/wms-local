import { z } from "zod";
import { EXIT_REASONS, REHIRE_ELIGIBILITIES } from "@/db/enums";

/**
 * ARCHIVE (offboard) an employee — input contract.
 *
 * This validates the form that REPLACED "Delete permanently". The old action
 * took two arguments (id, confirmation email) and destroyed 500+ rows. This one
 * takes a record of a departure, and destroys only the identity.
 *
 * Every date arrives as a `YYYY-MM-DD` string from `<input type="date">`, which
 * is also exactly what a Postgres `date` column wants, so they are kept as
 * strings rather than round-tripped through `Date` — a Date would re-introduce
 * the timezone bug where a last working day entered in IST lands on the
 * previous day in UTC.
 */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** An optional date field: absent, empty string, or a valid YYYY-MM-DD. */
const optionalDate = z
  .union([dateString, z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));

export const HandoverChecklistSchema = z.object({
  assetsReturned: z.boolean().default(false),
  accessRevoked: z.boolean().default(false),
  knowledgeTransferDone: z.boolean().default(false),
  finalSettlementDone: z.boolean().default(false),
  exitInterviewDone: z.boolean().default(false),
  note: z.string().max(2000).optional().nullable(),
});
export type HandoverChecklist = z.infer<typeof HandoverChecklistSchema>;

export const ExitInterviewSchema = z.object({
  wouldRecommend: z.boolean().optional().nullable(),
  primaryReason: z.string().max(2000).optional().nullable(),
  whatWorked: z.string().max(4000).optional().nullable(),
  whatDidNot: z.string().max(4000).optional().nullable(),
  managerFeedback: z.string().max(4000).optional().nullable(),
  conductedBy: z.string().max(200).optional().nullable(),
});
export type ExitInterview = z.infer<typeof ExitInterviewSchema>;

export const ArchiveEmployeeSchema = z
  .object({
    employeeId: z.string().uuid("Invalid employee id"),

    /**
     * Typed confirmation, kept from the old delete dialog. The action is still
     * irreversible on the Firebase side, so the "I really mean it" gate stays.
     */
    confirmationEmail: z.string().min(1, "Confirmation is required"),

    exitReason: z.enum(EXIT_REASONS),
    /** Required when — and only when — exitReason is `other`. */
    exitReasonOther: z.string().max(500).optional().nullable(),

    rehireEligibility: z.enum(REHIRE_ELIGIBILITIES),
    rehireNote: z.string().max(2000).optional().nullable(),

    /**
     * The DOJ as the admin confirmed it. Pre-filled from `employees.joined_at`
     * but editable, because the stored value is frequently an import artefact
     * and the exit record is the moment someone actually looks at it.
     */
    joinedAt: optionalDate,
    resignationDate: optionalDate,
    lastWorkingDay: optionalDate,

    noticeServed: z.boolean().optional().nullable(),
    noticeDays: z.number().int().min(0).max(365).optional().nullable(),
    paidInLieu: z.boolean().default(false),

    /**
     * Who inherits the open work. Optional: a departure with nothing
     * outstanding needs no successor, and forcing one would invent a handover
     * that did not happen.
     */
    successorId: z.string().uuid().optional().nullable(),

    /** Freeze the record against every retention timer (investigations). */
    legalHold: z.boolean().default(false),
    legalHoldReason: z.string().max(1000).optional().nullable(),

    handover: HandoverChecklistSchema.optional(),
    exitInterview: ExitInterviewSchema.optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    // `other` with no description is an empty record that defeats the point of
    // having the bucket — mirrored by a CHECK constraint in migration 0212, so
    // this cannot be bypassed by calling the action directly.
    if (val.exitReason === "other" && !val.exitReasonOther?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["exitReasonOther"],
        message: "Describe the reason when choosing Other.",
      });
    }
    if (val.legalHold && !val.legalHoldReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["legalHoldReason"],
        message: "A legal hold needs a reason — it overrides every retention rule.",
      });
    }
    // A last working day before the joining date is a typo, and it would make
    // every tenure calculation built on this record negative.
    if (val.joinedAt && val.lastWorkingDay && val.lastWorkingDay < val.joinedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["lastWorkingDay"],
        message: "Last working day cannot precede the joining date.",
      });
    }
  });

export type ArchiveEmployeeInput = z.input<typeof ArchiveEmployeeSchema>;
export type ArchiveEmployeeParsed = z.output<typeof ArchiveEmployeeSchema>;
