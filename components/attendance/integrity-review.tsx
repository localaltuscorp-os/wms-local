import { AlertTriangle, MapPinOff, ShieldAlert, Repeat, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { AnomalyPunch } from "@/lib/attendance/integrity-review";

/** Human label + tone for an anomaly flag code. */
function flagMeta(flag: string): { label: string; Icon: typeof AlertTriangle; tone: string } {
  if (flag === "mock_location") return { label: "Mocked GPS", Icon: MapPinOff, tone: "var(--color-red-deep, #b91c1c)" };
  if (flag.startsWith("integrity_")) return { label: `Integrity: ${flag.slice(10)}`, Icon: ShieldAlert, tone: "var(--color-amber-deep, #b45309)" };
  if (flag.startsWith("nonce_")) return { label: `Replay: ${flag.slice(6)}`, Icon: Repeat, tone: "var(--color-amber-deep, #b45309)" };
  return { label: flag, Icon: AlertTriangle, tone: "var(--color-ink-muted, #6b7280)" };
}

function timeIST(d: Date): string {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/**
 * Attendance-integrity anomaly review (server component). Lists the punches the
 * device-health checks flagged during the report/enforce window — mocked GPS,
 * failed integrity, replay/nonce anomalies — so admins can act.
 */
export function IntegrityReview({ anomalies }: { anomalies: AnomalyPunch[] }) {
  if (anomalies.length === 0) {
    return (
      <div className="grid place-items-center rounded-2xl border border-hairline bg-white px-6 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-2xl" style={{ background: "var(--color-green-bg, #e9f7ef)", color: "var(--color-green-deep, #15803d)" }}>
          <ShieldCheck size={22} />
        </span>
        <p className="mt-3 text-[14px] font-bold text-ink-strong">No flagged punches</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Nothing tripped the device-health checks in the last two weeks. Flags appear once the updated app sends attestation and the mode is <span className="font-mono">report</span> or <span className="font-mono">enforce</span>.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {anomalies.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--color-red-bg, #fdecec)", color: "var(--color-red-deep, #b91c1c)" }}>
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-bold text-ink-strong">{a.employeeName}</div>
            <div className="truncate text-[12.5px] text-ink-muted">
              {a.kind === "in" ? "Clock-in" : "Clock-out"} · {formatDate(a.logDate)} {timeIST(a.loggedAt)}
              {a.deviceLabel ? ` · ${a.deviceLabel}` : ""}
              {a.integrityVerdict ? ` · integrity ${a.integrityVerdict}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {a.anomalyFlags.map((f) => {
              const m = flagMeta(f);
              return (
                <span key={f} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "color-mix(in srgb, " + m.tone + " 12%, white)", color: m.tone }}>
                  <m.Icon size={12} /> {m.label}
                </span>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
