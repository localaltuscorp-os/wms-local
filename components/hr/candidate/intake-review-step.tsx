"use client";

import * as React from "react";
import Image from "next/image";
import { Download, Loader2, Mail, MapPin, Phone, User, Calendar, PencilLine } from "lucide-react";
import type { IntakeSection } from "@/lib/hr/candidate/intake-schema";
import { resumeHeader, resumeGroups } from "@/lib/hr/candidate/resume-model";
import { fireToast } from "@/lib/toast";

const ALTUS_RED = "#E10600";
const INK = "#18181b";
const DISPLAY_FONT = { fontFamily: "var(--font-display), system-ui, sans-serif" } as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

export function IntakeReviewStep({
  values,
  instances,
  onEdit,
}: {
  sections: IntakeSection[];
  values: Record<string, string>;
  instances: Record<string, string[]>;
  onEdit: (i: number) => void;
}) {
  const header = resumeHeader(values);
  const groups = resumeGroups(values, instances);
  const [busy, setBusy] = React.useState(false);

  const contact: { icon: React.ReactNode; text: string }[] = [];
  if (header.mobile) contact.push({ icon: <Phone size={13} strokeWidth={2.4} />, text: header.mobile });
  if (header.email) contact.push({ icon: <Mail size={13} strokeWidth={2.4} />, text: header.email });
  if (header.location) contact.push({ icon: <MapPin size={13} strokeWidth={2.4} />, text: header.location });

  const bio: { icon: React.ReactNode; text: string }[] = [];
  if (header.dob) bio.push({ icon: <Calendar size={13} strokeWidth={2.4} />, text: `DOB ${header.dob}` });
  if (header.age) bio.push({ icon: <User size={13} strokeWidth={2.4} />, text: `${header.age} yrs` });

  const subtitle = [header.position, header.department].filter(Boolean).join("  ·  ");

  async function exportPdf() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hr/candidate-resume/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values, instances }),
      });
      if (!res.ok) throw new Error(`PDF generation failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${header.name} — Candidate Interview Form.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      fireToast({
        message: err instanceof Error ? err.message : "Could not generate the PDF. Please try again.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* HEADER BAND */}
      <section className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div
          className="h-1.5 w-full"
          style={{ background: `linear-gradient(90deg, ${ALTUS_RED}, ${ALTUS_RED}b3)` }}
        />
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          {/* Identity tile — INITIALS, always. The candidate photograph upload
              was removed from the form (Sir, 2026-08-20), so there is no image
              to show; this is the fallback that was already here. */}
          <div
            className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-hairline bg-neutral-50 shadow-sm"
            style={{ width: 112, height: 112 }}
          >
            {
              <div
                className="grid h-full w-full place-items-center"
                style={{ color: ALTUS_RED }}
              >
                {initialsOf(header.name) !== "?" ? (
                  <span style={{ ...DISPLAY_FONT, fontWeight: 900, fontSize: 34, letterSpacing: "-0.02em" }}>
                    {initialsOf(header.name)}
                  </span>
                ) : (
                  <User size={44} strokeWidth={1.6} />
                )}
              </div>
            }
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <h2
              className="break-words leading-tight"
              style={{ ...DISPLAY_FONT, fontWeight: 900, fontSize: 32, letterSpacing: "-0.025em", color: INK }}
            >
              {header.name}
            </h2>
            {subtitle && (
              <p
                className="mt-1.5 text-[14px] font-bold uppercase tracking-wide"
                style={{ color: ALTUS_RED }}
              >
                {subtitle}
              </p>
            )}

            {(contact.length > 0 || bio.length > 0) && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-muted">
                {contact.map((c, i) => (
                  <span key={`c${i}`} className="inline-flex min-w-0 items-center gap-1.5">
                    <span style={{ color: ALTUS_RED }}>{c.icon}</span>
                    <span className="truncate">{c.text}</span>
                  </span>
                ))}
              </div>
            )}
            {bio.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-subtle">
                {bio.map((b, i) => (
                  <span key={`b${i}`} className="inline-flex items-center gap-1.5">
                    <span style={{ color: ALTUS_RED }}>{b.icon}</span>
                    {b.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* BODY */}
      <div className="mt-6 space-y-5">
        {groups.map((g) => (
          <section
            key={g.title}
            className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <header className="border-b border-hairline px-6 py-4">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: ALTUS_RED }}
              >
                Section
              </p>
              <h3
                className="mt-0.5 text-ink-strong"
                style={{ ...DISPLAY_FONT, fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}
              >
                {g.title}
              </h3>
            </header>

            <div className="px-6 py-5">
              {g.rows && g.rows.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-8 gap-y-5 max-sm:grid-cols-1">
                  {g.rows.map((r, j) => (
                    <div key={j} className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                        {r.label}
                      </dt>
                      <dd className="mt-1 break-words text-[15px] leading-snug text-ink-strong">
                        {r.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {g.items && g.items.length > 0 && (
                <div className="space-y-4">
                  {g.items.map((entry, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-hairline bg-neutral-50/60 px-5 py-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: ALTUS_RED }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                          Entry {idx + 1}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 max-sm:grid-cols-1">
                        {entry.map((r, j) => (
                          <div key={j} className="min-w-0">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                              {r.label}
                            </dt>
                            <dd className="mt-1 break-words text-[15px] leading-snug text-ink-strong">
                              {r.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={exportPdf}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: INK }}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Download size={16} strokeWidth={2.4} /> Export as PDF
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => onEdit(0)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold text-ink-muted transition-colors hover:text-altus-red"
        >
          <PencilLine size={14} /> Edit form
        </button>
      </div>
    </div>
  );
}
