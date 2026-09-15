import { describe, it, expect } from "vitest";
import {
  effectiveRecruiterJd,
  emptyJdContent,
  isJdBlank,
  isValidEmail,
  jdEmailHtml,
  jdEmailSubject,
  jdWhatsAppText,
  listItems,
  normalizeJdContent,
  normalizeWhatsAppPhone,
  sameJdContent,
  whatsAppLink,
} from "@/lib/hr/recruitment-jd";

/**
 * RECRUITMENT JDs (account holder, 2026-09-15) — a master and a recruiter copy
 * per position, sent by WhatsApp click-to-chat or email.
 */

const jd = normalizeJdContent({
  title: "Operations Executive",
  location: "Mumbai",
  experience: "1–3 years",
  summary: "Run client events end to end.",
  responsibilities: "- Coordinate vendors\n• Track the checklist\n\n3. Report daily",
  unknownField: "dropped",
});

describe("the JD itself", () => {
  it("keeps only known fields and fills a missing title", () => {
    expect(Object.keys(jd)).not.toContain("unknownField");
    expect(normalizeJdContent({}, "Web Developer").title).toBe("Web Developer");
    expect(normalizeJdContent(null).summary).toBe("");
  });

  it("reads list lines without the bullets or numbers people type", () => {
    expect(listItems(jd.responsibilities)).toEqual(["Coordinate vendors", "Track the checklist", "Report daily"]);
  });

  it("knows a blank JD, and when the recruiter copy matches the master", () => {
    expect(isJdBlank(emptyJdContent("Intern"))).toBe(true);
    expect(isJdBlank(jd)).toBe(false);
    expect(sameJdContent(jd, { ...jd, summary: `${jd.summary}  ` })).toBe(true);
    expect(sameJdContent(jd, { ...jd, location: "Pune" })).toBe(false);
  });

  it("sends the recruiter copy, falling back to the master", () => {
    const copy = { ...jd, location: "Pune" };
    expect(effectiveRecruiterJd(jd, copy)).toBe(copy);
    expect(effectiveRecruiterJd(jd, null)).toBe(jd);
    expect(effectiveRecruiterJd(null, null)).toBeNull();
  });
});

describe("WhatsApp", () => {
  it("writes the JD as a message with bold headings and bullets", () => {
    const text = jdWhatsAppText(jd, { recipientName: "Neha Shah" });
    expect(text.startsWith("Hi Neha,")).toBe(true);
    expect(text).toContain("*Operations Executive*");
    expect(text).toContain("*Location:* Mumbai");
    expect(text).toContain("*Key Responsibilities*\n• Coordinate vendors\n• Track the checklist\n• Report daily");
    expect(text).not.toContain("*Skills*");
  });

  it("reads Indian numbers the way people type them", () => {
    expect(normalizeWhatsAppPhone("98765 43210")).toBe("919876543210");
    expect(normalizeWhatsAppPhone("+91-98765-43210")).toBe("919876543210");
    expect(normalizeWhatsAppPhone("09876543210")).toBe("919876543210");
    expect(normalizeWhatsAppPhone("0044 7700 900123")).toBe("447700900123");
    expect(normalizeWhatsAppPhone("12345")).toBeNull();
    expect(normalizeWhatsAppPhone("")).toBeNull();
  });

  it("links to that chat, or lets WhatsApp ask for the contact when there's no number", () => {
    expect(whatsAppLink("919876543210", "Hi & bye")).toBe("https://wa.me/919876543210?text=Hi%20%26%20bye");
    expect(whatsAppLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
  });
});

describe("email", () => {
  it("checks the address", () => {
    expect(isValidEmail("neha@example.com")).toBe(true);
    expect(isValidEmail("neha@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("builds an on-brand body that escapes whatever was typed", () => {
    const html = jdEmailHtml({ ...jd, summary: "<script>alert(1)</script>" }, { recipientName: "Neha", note: "Great to speak today." });
    expect(html).toContain("Hi Neha,");
    expect(html).toContain("Great to speak today.");
    expect(html).toContain("<li style=\"font-size:14px;line-height:1.55;margin:0 0 4px\">Coordinate vendors</li>");
    expect(html).not.toContain("<script>");
    expect(jdEmailSubject(jd)).toBe("Job Description — Operations Executive | Altus Corp");
  });
});
