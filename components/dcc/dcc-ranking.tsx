"use client";

import { Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface RankRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  pct: number;
  streak: number;
  score: number;
  done: number;
  due: number;
}

const MEDAL = ["#E6B400", "#9AA3AD", "#C77B3B"]; // gold / silver / bronze

export function DccRanking({ rows }: { rows: RankRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded-2xl border border-hairline-strong bg-white px-6 py-12 text-center text-[16px] font-bold text-ink-muted">No DCC activity yet.</p>;
  }
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="flex flex-col gap-6">
      {/* Podium */}
      <div className="grid grid-cols-3 gap-3 max-md:gap-2">
        {top.map((r, i) => (
          <div key={r.id} className="flex flex-col items-center rounded-2xl border bg-white px-3 py-5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.05)]" style={{ borderColor: `color-mix(in srgb, ${MEDAL[i]} 55%, var(--color-hairline-strong))`, order: i === 0 ? 2 : i === 1 ? 1 : 3, transform: i === 0 ? "scale(1.04)" : undefined }}>
            <span className="grid h-7 w-7 place-items-center rounded-full text-[14px] font-extrabold text-white" style={{ background: MEDAL[i] }}>{i + 1}</span>
            <div className="mt-2.5"><Avatar name={r.name} avatarUrl={r.avatarUrl} size={i === 0 ? 64 : 52} /></div>
            <p className="mt-2 truncate w-full text-[15px] font-bold text-ink-strong">{r.name}</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui" }}>{r.score}</p>
            <p className="mt-1 flex items-center gap-2 text-[12.5px] font-semibold text-ink-subtle">{r.pct}% <Flame size={12} style={{ color: "var(--color-altus-red)" }} />{r.streak}</p>
          </div>
        ))}
      </div>

      {/* Rest */}
      {rest.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {rest.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? "" : "border-t border-hairline"}`}>
              <span className="w-7 text-center text-[16px] font-extrabold text-ink-subtle tabular-nums">{i + 4}</span>
              <Avatar name={r.name} avatarUrl={r.avatarUrl} size={38} />
              <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink-strong">{r.name}</span>
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-subtle"><Flame size={13} style={{ color: r.streak > 0 ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }} />{r.streak}</span>
              <span className="w-14 text-right text-[14px] font-bold tabular-nums" style={{ color: r.pct >= 80 ? "var(--color-green-deep)" : r.pct >= 60 ? "var(--color-amber,#f59e0b)" : "var(--color-altus-red-deep)" }}>{r.pct}%</span>
              <span className="w-12 text-right text-[18px] font-extrabold text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui" }}>{r.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
