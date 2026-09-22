import { describe, it, expect } from "vitest";
import {
  JD_FIELDS,
  JD_SENT_FIELDS,
  jdEmailHtml,
  jdWhatsAppText,
  listItems,
  normalizeJdContent,
  slugify,
  type JdFieldKey,
} from "@/lib/operations/recruitment-jd";
import {
  RECRUITMENT_JD_SEED,
  RECRUITMENT_JD_SEED_BY_SLUG,
} from "@/lib/operations/recruitment-jd-seed";

/**
 * THE TEMPLATE AND THE JDs WRITTEN INTO IT.
 *
 * The account holder's requirement (2026-09-17) is that every JD has the same
 * structure with different content. These tests are that requirement: one field
 * list, every role filling the same core headings, and nothing internal
 * escaping into a message to a candidate.
 */

/** The headings a real Altus JD is not a real Altus JD without. */
const CORE: JdFieldKey[] = [
  "title",
  "department",
  "location",
  "employmentType",
  "workMode",
  "workSchedule",
  "qualification",
  "salary",
  "aboutCompany",
  "summary",
  "responsibilities",
  "requirements",
  "skills",
  "competencies",
  "mustHave",
  "kpis",
  "benefits",
  "howToApply",
];

describe("the template", () => {
  it("has a unique key per field and no empty labels", () => {
    const keys = JD_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of JD_FIELDS) expect(f.label.trim().length).toBeGreaterThan(0);
  });

  it("sends everything except the fields marked internal", () => {
    // ATS keywords are for job boards; a candidate receiving them reads as a
    // mistake, so they are editable but never sent.
    const sent = JD_SENT_FIELDS.map((f) => f.key);
    expect(sent).not.toContain("atsKeywords");
    expect(JD_FIELDS.length - JD_SENT_FIELDS.length).toBe(1);
  });

  it("survives a round trip through normalize", () => {
    const c = RECRUITMENT_JD_SEED[0]!.content;
    expect(normalizeJdContent(c)).toEqual(c);
  });

  it("drops unknown keys rather than storing them", () => {
    const out = normalizeJdContent({ title: "X", notAField: "boom" } as unknown);
    expect(out).not.toHaveProperty("notAField");
    expect(out.title).toBe("X");
  });
});

describe("the eight JDs", () => {
  it("are all present, uniquely slugged, and ordered", () => {
    expect(RECRUITMENT_JD_SEED).toHaveLength(8);
    const slugs = RECRUITMENT_JD_SEED.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // A slug is already in slug form, so re-slugging it is a no-op.
    for (const s of RECRUITMENT_JD_SEED) expect(slugify(s.slug)).toBe(s.slug);
    const orders = RECRUITMENT_JD_SEED.map((s) => s.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("every one fills every core heading — same structure, different content", () => {
    for (const s of RECRUITMENT_JD_SEED) {
      for (const key of CORE) {
        expect(
          s.content[key].trim(),
          `${s.slug} is missing "${JD_FIELDS.find((f) => f.key === key)?.label}"`,
        ).not.toBe("");
      }
    }
  });

  it("keeps the list fields as real lists, not one run-on line", () => {
    const lists = JD_FIELDS.filter((f) => f.kind === "list");
    for (const s of RECRUITMENT_JD_SEED) {
      for (const f of lists) {
        const body = s.content[f.key].trim();
        if (!body) continue;
        expect(listItems(body).length, `${s.slug}.${f.key}`).toBeGreaterThan(1);
      }
    }
  });

  it("titles the content the same as the role", () => {
    for (const s of RECRUITMENT_JD_SEED) expect(s.content.title).toBe(s.title);
    expect(RECRUITMENT_JD_SEED_BY_SLUG.get("creative-intern")?.title).toMatch(/Creative Intern/);
  });

  it("uses Duration only for internships", () => {
    /* The structural rule, not a blanket one: Duration is an internship field.
       The Business Strategy Intern PDF states no duration, so that role leaves
       it blank and the heading simply does not appear — which is exactly how a
       shared template is supposed to handle a section a role has nothing for. */
    for (const s of RECRUITMENT_JD_SEED) {
      if (!s.slug.endsWith("-intern")) {
        expect(s.content.duration.trim(), `${s.slug} should not carry a Duration`).toBe("");
      }
    }
    const withDuration = RECRUITMENT_JD_SEED.filter((s) => s.content.duration.trim());
    expect(withDuration.length).toBeGreaterThan(0);
    for (const s of withDuration) expect(s.slug).toMatch(/-intern$/);
  });
});

describe("what actually goes out", () => {
  const jd = RECRUITMENT_JD_SEED_BY_SLUG.get("senior-sales-manager")!.content;

  it("never leaks the ATS keywords into WhatsApp or email", () => {
    /* Several ATS keywords ("B2B Sales") legitimately appear in the body too, so
       the test picks one that exists ONLY on the ATS line — otherwise it would
       fail on text that is genuinely supposed to be sent. */
    const otherText = JD_SENT_FIELDS.map((f) => jd[f.key]).join(" ").toLowerCase();
    const exclusive = jd.atsKeywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 3 && !otherText.includes(k.toLowerCase()));
    expect(exclusive.length).toBeGreaterThan(0);

    const whatsapp = jdWhatsAppText(jd);
    const email = jdEmailHtml(jd);
    for (const k of exclusive) {
      expect(whatsapp, `WhatsApp leaked "${k}"`).not.toContain(k);
      expect(email, `Email leaked "${k}"`).not.toContain(k);
    }
    // …and the heading itself is absent too.
    expect(whatsapp).not.toContain("ATS Keywords");
    expect(email).not.toContain("ATS Keywords");
  });

  it("greets a named recipient and still works without a name", () => {
    expect(jdWhatsAppText(jd, { recipientName: "Asha Menon" })).toContain("Hi Asha,");
    expect(jdWhatsAppText(jd)).toContain("Hello,");
  });

  it("carries the fact box and every written section", () => {
    const text = jdWhatsAppText(jd);
    expect(text).toContain("*Location:* Goregaon East, Mumbai");
    expect(text).toContain("*Key Responsibilities*");
    expect(text).toContain("*Key Performance Indicators*");
    expect(text).toContain("• Lead conversion rate");
  });

  it("escapes anything the author typed into the email", () => {
    const nasty = normalizeJdContent({ ...jd, summary: '<script>alert("x")</script>' });
    const html = jdEmailHtml(nasty);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits a heading the role left blank rather than printing an empty one", () => {
    const noKpis = normalizeJdContent({ ...jd, kpis: "" });
    expect(jdWhatsAppText(noKpis)).not.toContain("Key Performance Indicators");
    expect(jdEmailHtml(noKpis)).not.toContain("Key Performance Indicators");
  });
});

describe("slugify", () => {
  it("turns a title into the key the row is addressed by", () => {
    expect(slugify("Senior Sales Manager / Sales Manager")).toBe("senior-sales-manager-sales-manager");
    expect(slugify("  Back Office, Admin & HR Executive (AI-First) ")).toBe(
      "back-office-admin-hr-executive-ai-first",
    );
  });

  it("gives nothing back for a title with no letters or numbers", () => {
    expect(slugify("—— ///")).toBe("");
  });
});
