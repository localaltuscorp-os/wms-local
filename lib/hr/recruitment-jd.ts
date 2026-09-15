/**
 * RECRUITMENT JDs — what a job description holds, and how it is sent
 * (account holder, 2026-09-15).
 *
 * The job descriptions recruiters send candidates, one per position in the
 * Candidate Interview Form's list. Not the internal JD Bank
 * (/operations/job-description), which lists a seat's recurring duties.
 *
 * Every position keeps TWO versions: the MASTER (the original, changed only
 * deliberately) and the RECRUITER copy (edited freely, sent to candidates; null
 * means "same as the master"). WhatsApp goes out as a click-to-chat link — the
 * recruiter's own WhatsApp opens with the JD typed in — and email through the
 * company mailer.
 *
 * Pure and client-safe: the editor, the send panel and the server actions all
 * read these, so a preview is exactly what gets sent.
 */

export const COMPANY_NAME = "Altus Corp";

export const JD_FIELDS = [
  { key: "title", label: "Job Title", kind: "line", placeholder: "e.g. Operations Executive" },
  { key: "department", label: "Department", kind: "line", placeholder: "e.g. Operations" },
  { key: "location", label: "Location", kind: "line", placeholder: "e.g. Mumbai (Andheri East)" },
  { key: "employmentType", label: "Employment Type", kind: "line", placeholder: "e.g. Full-time / Internship" },
  { key: "experience", label: "Experience", kind: "line", placeholder: "e.g. 1–3 years" },
  { key: "qualification", label: "Qualification", kind: "line", placeholder: "e.g. Any graduate" },
  { key: "salary", label: "Salary / Stipend", kind: "line", placeholder: "e.g. As per industry standards" },
  { key: "summary", label: "About the Role", kind: "text", placeholder: "A short paragraph about the role" },
  { key: "responsibilities", label: "Key Responsibilities", kind: "list", placeholder: "One responsibility per line" },
  { key: "requirements", label: "Requirements", kind: "list", placeholder: "One requirement per line" },
  { key: "skills", label: "Skills", kind: "list", placeholder: "One skill per line" },
  { key: "benefits", label: "What We Offer", kind: "list", placeholder: "One point per line" },
  { key: "howToApply", label: "How to Apply", kind: "text", placeholder: "e.g. Reply to this message with your CV" },
] as const;

export type JdFieldKey = (typeof JD_FIELDS)[number]["key"];
export type JdContent = Record<JdFieldKey, string>;

const FIELD_MAX = 8000;

export function emptyJdContent(title = ""): JdContent {
  const c = Object.fromEntries(JD_FIELDS.map((f) => [f.key, ""])) as JdContent;
  c.title = title;
  return c;
}

/** Anything (a jsonb value, a form) → a well-formed JD. Unknown keys are dropped. */
export function normalizeJdContent(raw: unknown, fallbackTitle = ""): JdContent {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = emptyJdContent();
  for (const f of JD_FIELDS) {
    const v = src[f.key];
    out[f.key] = typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, FIELD_MAX) : "";
  }
  if (!out.title.trim()) out.title = fallbackTitle;
  return out;
}

/** Nothing written beyond (at most) a title. */
export function isJdBlank(c: JdContent | null | undefined): boolean {
  if (!c) return true;
  return JD_FIELDS.every((f) => f.key === "title" || !c[f.key].trim());
}

export function sameJdContent(a: JdContent | null | undefined, b: JdContent | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return JD_FIELDS.every((f) => a[f.key].trim() === b[f.key].trim());
}

/** What recruiters send: their copy, else the master. */
export function effectiveRecruiterJd(master: JdContent | null, recruiter: JdContent | null): JdContent | null {
  return recruiter ?? master;
}

/** A list field's lines, with any bullet or number the author typed removed. */
export function listItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*·▪➤>]|\d+[.)])\s*/u, "").trim())
    .filter(Boolean);
}

function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/* ── WhatsApp ───────────────────────────────────────────────────────────── */

/** Beyond this the link may be cut by some phones and browsers — warn the recruiter. */
export const WHATSAPP_SOFT_LIMIT = 3500;

/** The JD as a WhatsApp message (*bold* headings, • bullets). */
export function jdWhatsAppText(c: JdContent, opts: { recipientName?: string | null; company?: string } = {}): string {
  const company = opts.company ?? COMPANY_NAME;
  const first = firstName(opts.recipientName);
  const parts: string[] = [];
  parts.push(`${first ? `Hi ${first},` : "Hello,"}\n\nPlease find the job description for *${c.title.trim() || "this role"}* at ${company}.`);

  const facts = JD_FIELDS.filter((f) => f.kind === "line" && f.key !== "title" && c[f.key].trim()).map(
    (f) => `*${f.label}:* ${c[f.key].trim()}`,
  );
  if (facts.length) parts.push(facts.join("\n"));

  for (const f of JD_FIELDS) {
    if (f.kind === "line" || !c[f.key].trim()) continue;
    const body = f.kind === "list" ? listItems(c[f.key]).map((i) => `• ${i}`).join("\n") : c[f.key].trim();
    parts.push(`*${f.label}*\n${body}`);
  }
  parts.push(`Regards,\n${company}`);
  return parts.join("\n\n");
}

/**
 * A phone number as WhatsApp wants it — digits with the country code. A 10-digit
 * number is taken as Indian. Null when it can't be a phone number.
 */
export function normalizeWhatsAppPhone(input: string | null | undefined): string | null {
  let d = (input ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = `91${d.slice(1)}`;
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/**
 * The click-to-chat link. With a number it opens that chat; without one,
 * WhatsApp asks which contact to send it to — "any person we desire".
 */
export function whatsAppLink(phone: string | null, text: string): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}

/* ── Email ──────────────────────────────────────────────────────────────── */

export function isValidEmail(v: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v ?? "").trim());
}

export function jdEmailSubject(c: JdContent, company = COMPANY_NAME): string {
  return `Job Description — ${c.title.trim() || "Open Position"} | ${company}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

const BRAND = "#E10600";

/** The JD as an on-brand email body. Everything the recruiter typed is escaped. */
export function jdEmailHtml(
  c: JdContent,
  opts: { recipientName?: string | null; note?: string | null; company?: string } = {},
): string {
  const company = opts.company ?? COMPANY_NAME;
  const first = firstName(opts.recipientName);
  const para = (t: string) =>
    t
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">${esc(p).replace(/\n/g, "<br />")}</p>`)
      .join("");

  const facts = JD_FIELDS.filter((f) => f.kind === "line" && f.key !== "title" && c[f.key].trim())
    .map(
      (f) =>
        `<tr><td style="padding:5px 14px 5px 0;color:#666;font-size:13px;white-space:nowrap;vertical-align:top">${esc(f.label)}</td><td style="padding:5px 0;font-size:13.5px;font-weight:600">${esc(c[f.key].trim())}</td></tr>`,
    )
    .join("");

  const sections = JD_FIELDS.filter((f) => f.kind !== "line" && c[f.key].trim())
    .map((f) => {
      const body =
        f.kind === "list"
          ? `<ul style="margin:0 0 4px;padding-left:20px">${listItems(c[f.key])
              .map((i) => `<li style="font-size:14px;line-height:1.55;margin:0 0 4px">${esc(i)}</li>`)
              .join("")}</ul>`
          : para(c[f.key]);
      return `<h2 style="font-size:15px;font-weight:800;margin:20px 0 8px;color:#1a1a1a">${esc(f.label)}</h2>${body}`;
    })
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">${esc(company)} · Job Description</div>
      <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">${esc(c.title.trim() || "Open Position")}</h1>
    </div>
    <p style="font-size:14px;margin:0 0 12px">${first ? `Hi ${esc(first)},` : "Hello,"}</p>
    ${opts.note?.trim() ? para(opts.note) : `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">Please find the job description for this role at ${esc(company)} below.</p>`}
    ${facts ? `<table style="border-collapse:collapse;margin:8px 0 4px">${facts}</table>` : ""}
    ${sections}
    <p style="font-size:14px;margin:22px 0 0">Regards,<br />${esc(company)}</p>
  </div>`;
}
