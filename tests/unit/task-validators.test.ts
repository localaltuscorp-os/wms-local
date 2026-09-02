import { describe, it, expect } from "vitest";
import {
  CreateTaskSchema,
  EditTaskFieldsSchema,
  ApproveSchema,
  ReassignSchema,
  TransferExternalSchema,
  CancelSchema,
  CommentSchema,
} from "@/lib/validators/task";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

describe("CreateTaskSchema", () => {
  const base = {
    title: "Verify KYC for borrower 4471",
    doerId: VALID_UUID,
    initiatorId: VALID_UUID,
    priority: "imp_urgent" as const,
    dueAt: "2026-06-01T18:30:00.000Z",
    description: null,
    subject: null,
    notes: null,
  };

  it("accepts a valid payload", () => {
    expect(() => CreateTaskSchema.parse(base)).not.toThrow();
  });

  it("rejects empty title", () => {
    expect(() => CreateTaskSchema.parse({ ...base, title: "" })).toThrow();
  });

  it("rejects a title longer than 240 characters", () => {
    expect(() =>
      CreateTaskSchema.parse({ ...base, title: "a".repeat(241) }),
    ).toThrow();
  });

  it("rejects a non-UUID doerId", () => {
    expect(() =>
      CreateTaskSchema.parse({ ...base, doerId: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects an unknown priority", () => {
    expect(() =>
      CreateTaskSchema.parse({ ...base, priority: "blocker" as never }),
    ).toThrow();
  });

  it("rejects a non-ISO dueAt", () => {
    expect(() => CreateTaskSchema.parse({ ...base, dueAt: "tomorrow" })).toThrow();
  });

  it("parses dueAt into a Date object", () => {
    const parsed = CreateTaskSchema.parse(base);
    expect(parsed.dueAt).toBeInstanceOf(Date);
  });

  it("trims title", () => {
    const parsed = CreateTaskSchema.parse({ ...base, title: "  hello  " });
    expect(parsed.title).toBe("hello");
  });

  it("defaults description / subject / notes to null when omitted", () => {
    const { description, subject, notes, ...rest } = base;
    const parsed = CreateTaskSchema.parse(rest);
    expect(parsed.description).toBeNull();
    expect(parsed.subject).toBeNull();
    expect(parsed.notes).toBeNull();
  });
});

describe("EditTaskFieldsSchema", () => {
  it("accepts a single-field update", () => {
    expect(() =>
      EditTaskFieldsSchema.parse({ title: "Renamed" }),
    ).not.toThrow();
  });

  it("accepts multiple fields at once", () => {
    expect(() =>
      EditTaskFieldsSchema.parse({
        title: "Renamed",
        priority: "imp_not_urgent",
        notes: "Follow up next week.",
      }),
    ).not.toThrow();
  });

  it("rejects an empty object", () => {
    expect(() => EditTaskFieldsSchema.parse({})).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() =>
      EditTaskFieldsSchema.parse({ status: "done" } as never),
    ).toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => EditTaskFieldsSchema.parse({ title: "" })).toThrow();
  });

  it("parses dueAt into a Date when present", () => {
    const parsed = EditTaskFieldsSchema.parse({
      dueAt: "2026-07-01T00:00:00.000Z",
    });
    expect(parsed.dueAt).toBeInstanceOf(Date);
  });

  it("allows description to be explicitly null", () => {
    const parsed = EditTaskFieldsSchema.parse({ description: null });
    expect(parsed.description).toBeNull();
  });
});

describe("ApproveSchema", () => {
  it("accepts decision='approved' with no note", () => {
    expect(() =>
      ApproveSchema.parse({ decision: "approved" }),
    ).not.toThrow();
  });

  it("accepts decision='not_approved' with a note", () => {
    expect(() =>
      ApproveSchema.parse({ decision: "not_approved", note: "Need rework" }),
    ).not.toThrow();
  });

  it("rejects an unknown decision", () => {
    expect(() =>
      ApproveSchema.parse({ decision: "maybe" as never }),
    ).toThrow();
  });

  it("rejects note > 2000 chars", () => {
    expect(() =>
      ApproveSchema.parse({ decision: "approved", note: "a".repeat(2001) }),
    ).toThrow();
  });
});

describe("ReassignSchema", () => {
  it("accepts a valid UUID and resetStatus=false", () => {
    expect(() =>
      ReassignSchema.parse({ newDoerId: VALID_UUID, resetStatus: false }),
    ).not.toThrow();
  });

  it("defaults resetStatus to false when omitted", () => {
    const parsed = ReassignSchema.parse({ newDoerId: VALID_UUID });
    expect(parsed.resetStatus).toBe(false);
  });

  it("rejects a non-UUID newDoerId", () => {
    expect(() =>
      ReassignSchema.parse({ newDoerId: "not-a-uuid" }),
    ).toThrow();
  });
});

describe("TransferExternalSchema", () => {
  it("requires a non-empty note", () => {
    expect(() => TransferExternalSchema.parse({ note: "Sent to KYC vendor" })).not.toThrow();
    expect(() => TransferExternalSchema.parse({ note: "" })).toThrow();
    expect(() => TransferExternalSchema.parse({})).toThrow();
  });

  it("trims the note", () => {
    const parsed = TransferExternalSchema.parse({ note: "  Sent away  " });
    expect(parsed.note).toBe("Sent away");
  });
});

describe("CancelSchema", () => {
  it("accepts an empty payload (note optional)", () => {
    expect(() => CancelSchema.parse({})).not.toThrow();
  });

  it("accepts a note", () => {
    expect(() => CancelSchema.parse({ note: "Customer withdrew" })).not.toThrow();
  });
});

describe("CommentSchema", () => {
  it("requires a non-empty body", () => {
    expect(() => CommentSchema.parse({ body: "Looks good." })).not.toThrow();
    expect(() => CommentSchema.parse({ body: "" })).toThrow();
    expect(() => CommentSchema.parse({ body: "   " })).toThrow();
  });

  it("rejects body > 4000 chars", () => {
    expect(() =>
      CommentSchema.parse({ body: "a".repeat(4001) }),
    ).toThrow();
  });

  it("trims the body", () => {
    const parsed = CommentSchema.parse({ body: "  hi  " });
    expect(parsed.body).toBe("hi");
  });
});
