import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  smtpSend: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mocks.smtpSend })),
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  },
}));
vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<p>rendered</p>") }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mocks.smtpSend.mockReset();
  mocks.resendSend.mockReset();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const message = {
  from: "Test App <test@example.com>",
  to: "recipient@example.com",
  subject: "Test message",
  text: "Hello",
};

describe("email transport selection", () => {
  it("uses SMTP first when it is fully configured", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "test-password";
    process.env.RESEND_API_KEY = "test-resend-key";
    mocks.smtpSend.mockResolvedValue({ messageId: "smtp-1" });

    const { getEmailClient } = await import("@/lib/email/transport");
    const result = await getEmailClient()!.emails.send(message);

    expect(result).toEqual({ data: { id: "smtp-1" }, error: null });
    expect(mocks.smtpSend).toHaveBeenCalledOnce();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("falls back to Resend when SMTP fails", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "test-password";
    process.env.RESEND_API_KEY = "test-resend-key";
    mocks.smtpSend.mockRejectedValue(new Error("SMTP unavailable"));
    mocks.resendSend.mockResolvedValue({ data: { id: "resend-1" }, error: null });

    const { getEmailClient } = await import("@/lib/email/transport");
    const result = await getEmailClient()!.emails.send(message);

    expect(result).toEqual({ data: { id: "resend-1" }, error: null });
    expect(mocks.smtpSend).toHaveBeenCalledOnce();
    expect(mocks.resendSend).toHaveBeenCalledOnce();
  });

  it("keeps Resend-only environments working", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    mocks.resendSend.mockResolvedValue({ data: { id: "resend-only" }, error: null });

    const { getEmailClient } = await import("@/lib/email/transport");
    const result = await getEmailClient()!.emails.send(message);

    expect(result).toEqual({ data: { id: "resend-only" }, error: null });
    expect(mocks.smtpSend).not.toHaveBeenCalled();
  });

  it("returns null when neither transport is configured", async () => {
    const { getEmailClient } = await import("@/lib/email/transport");
    expect(getEmailClient()).toBeNull();
  });
});
