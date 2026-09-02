import { FileSpreadsheet, FileText, Sheet } from "lucide-react";

/**
 * Admin payroll export links for a month — CSV + PDF (both from the on-screen
 * salary sheet, deduped + ex-staff excluded) plus the existing Excel. Plain
 * anchors so the browser downloads directly; no client JS.
 */
export function SalaryExportButtons({ month }: { month: string | null }) {
  if (!month) return null;
  const q = `?month=${month}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Btn href={`/salary/export.pdf${q}`} accent="#be123c" Icon={FileText} label="PDF" />
      <Btn href={`/salary/export.csv${q}`} accent="#A80400" Icon={FileSpreadsheet} label="CSV" />
      <Btn href={`/salary/export.xlsx${q}`} accent="#1d4ed8" Icon={Sheet} label="Excel" />
    </div>
  );
}

function Btn({ href, accent, Icon, label }: { href: string; accent: string; Icon: typeof FileText; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-bold text-ink-strong transition hover:-translate-y-px"
      style={{ background: "var(--color-surface-card)", boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 35%, var(--color-hairline))` }}
    >
      <Icon size={15} strokeWidth={2.3} style={{ color: accent }} /> {label}
    </a>
  );
}
