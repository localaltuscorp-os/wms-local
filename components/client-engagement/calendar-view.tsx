"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight, Info } from "lucide-react";
import {
  accountLabel,
  callTypeLabel,
  CE_CALL_TYPES,
  CE_DAY_END_MIN,
  CE_DAY_START_MIN,
  CE_DAYS,
} from "@/lib/client-engagement/constants";
import {
  addDays,
  dayCodeOf,
  formatDuration,
  freeGaps,
  parseHm,
  runsOn,
  slotMinutes,
  toClock,
} from "@/lib/client-engagement/schedule";
import { hhStatusMeta, isInactiveAccount } from "@/lib/client-engagement/status";
import type { MemberCapacity } from "@/lib/client-engagement/grids";
import type { CeAccountRow, CeEngagementRow, CeMemberRow, HhOverlayCall } from "@/lib/queries/client-engagement";
import { EngagementDialog } from "./engagement-dialog";
import { BTN_NEUTRAL, BTN_PRIMARY, CARD, CARD_SHADOW, DISPLAY, Select, TONE_VAR, Toolbar } from "./ui";

/**
 * THE CLIENT ENGAGEMENT CALENDAR — one person's week, 10 AM to 8 PM and nothing
 * outside it.
 *
 * Built for one question: "does this person have room?" Only BOOKED time gets
 * a box (free zones were drawn at first and removed on 2026-09-18 as noise);
 * each day header says how much of the day is free, and clicking empty space
 * schedules into it. Calls with an inactive / on-hold client stay
 * visible (hatched, faded) so their slot is not mistaken for someone else's, but
 * they do not count as busy.
 *
 * The person's Hand-holding calls are overlaid read-only (dashed grey), so the
 * picture includes work that module already gave them.
 */

const PX_PER_MIN = 1.2;
const GRID_H = (CE_DAY_END_MIN - CE_DAY_START_MIN) * PX_PER_MIN;
const MIN_BLOCK_H = 18;
const HOURS = Array.from({ length: (CE_DAY_END_MIN - CE_DAY_START_MIN) / 60 + 1 }, (_, i) => CE_DAY_START_MIN + i * 60);

const CALL_TONE: Record<string, string> = { hh: "blue", tool: "teal", checkin: "green", reference: "indigo" };

const top = (min: number) => (Math.max(CE_DAY_START_MIN, min) - CE_DAY_START_MIN) * PX_PER_MIN;

interface Block {
  key: string;
  start: number;
  end: number;
  kind: "ce" | "hh";
  engagement?: CeEngagementRow;
  account?: CeAccountRow;
  hh?: HhOverlayCall;
  inactive: boolean;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for blocks that overlap (only the HH overlay can). */
function layout(blocks: Omit<Block, "lane" | "lanes">[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Block[] = [];
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1));
    for (const b of cluster) out.push({ ...b, lanes });
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...b, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

export function CalendarView({
  members,
  memberId,
  monday,
  today,
  accounts,
  engagements,
  allEngagements,
  hhOverlay,
  capacity,
  canViewAny,
  canEdit,
  canManage,
}: {
  members: CeMemberRow[];
  memberId: string;
  monday: string;
  today: string;
  accounts: CeAccountRow[];
  /** This person's calls. */
  engagements: CeEngagementRow[];
  /** Everyone's, for the team bandwidth strip (admins). */
  allEngagements: CeEngagementRow[];
  hhOverlay: HhOverlayCall[];
  capacity: MemberCapacity[];
  canViewAny: boolean;
  /** May the viewer schedule for this person? */
  canEdit: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<{ engagement: CeEngagementRow | null; preset?: { dayOfWeek: string; startMin: number; endMin: number } } | null>(null);

  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a] as const)), [accounts]);
  const member = members.find((m) => m.id === memberId);
  const cap = capacity.find((c) => c.memberId === memberId);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const go = (params: { member?: string; week?: string }) => {
    const sp = new URLSearchParams();
    sp.set("member", params.member ?? memberId);
    sp.set("week", params.week ?? monday);
    router.push(`/operations/client-engagement/calendar?${sp.toString()}`);
  };

  // Blocks per day.
  const perDay = dates.map((date) => {
    const raw: Omit<Block, "lane" | "lanes">[] = [];
    for (const e of engagements) {
      if (!runsOn(e, date)) continue;
      const account = accountById.get(e.accountId);
      raw.push({
        key: e.id,
        start: parseHm(e.startTime)!,
        end: parseHm(e.endTime)!,
        kind: "ce",
        engagement: e,
        account,
        inactive: account ? isInactiveAccount(account) : false,
      });
    }
    const untimed: HhOverlayCall[] = [];
    for (const h of hhOverlay) {
      const within =
        h.dayOfWeek === dayCodeOf(date) && !(h.startDate && date < h.startDate) && !(h.endDate && date > h.endDate);
      if (!within) continue;
      const s = parseHm(h.startTime);
      const en = parseHm(h.endTime);
      if (s === null || en === null) {
        untimed.push(h);
        continue;
      }
      raw.push({ key: `hh-${h.id}`, start: s, end: en, kind: "hh", hh: h, inactive: false });
    }
    const blocks = layout(raw);
    const busy = blocks.filter((b) => !b.inactive).map((b) => ({ start: b.start, end: b.end }));
    const gaps = freeGaps(busy);
    const booked = blocks.filter((b) => b.kind === "ce" && !b.inactive).reduce((s, b) => s + (b.end - b.start), 0);
    const hhMinutes = blocks.filter((b) => b.kind === "hh").reduce((s, b) => s + (b.end - b.start), 0) + untimed.reduce((s, h) => s + h.durationMin, 0);
    const calls = blocks.filter((b) => b.kind === "ce" && !b.inactive).length;
    return { date, blocks, gaps, untimed, booked, hhMinutes, calls, free: gaps.reduce((s, g) => s + (g.end - g.start), 0) };
  });

  const weekBooked = perDay.reduce((s, d) => s + d.booked, 0);
  const weekFree = perDay.reduce((s, d) => s + d.free, 0);
  const weekCalls = perDay.reduce((s, d) => s + d.calls, 0);
  const weekHh = perDay.reduce((s, d) => s + d.hhMinutes, 0);
  const hasUntimed = perDay.some((d) => d.untimed.length);
  const sunday = addDays(monday, 6);
  const fmtDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <Toolbar>
        {canViewAny ? (
          <Select value={memberId} onChange={(v) => go({ member: v })} ariaLabel="Employee" className="w-[190px] shrink-0">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="shrink-0 text-[13px] font-bold text-ink-strong">{member?.name}</span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={`${BTN_NEUTRAL} !px-2`} onClick={() => go({ week: addDays(monday, -7) })} aria-label="Previous week">
            <ChevronLeft size={15} strokeWidth={2.4} />
          </button>
          <button type="button" className={BTN_NEUTRAL} onClick={() => go({ week: today })}>
            This week
          </button>
          <button type="button" className={`${BTN_NEUTRAL} !px-2`} onClick={() => go({ week: addDays(monday, 7) })} aria-label="Next week">
            <ChevronRight size={15} strokeWidth={2.4} />
          </button>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[13.5px] font-extrabold text-ink-strong" style={DISPLAY}>
          {fmtDate(monday)} – {fmtDate(sunday)}
        </span>
        <span className="min-w-0 flex-1" />
        {canEdit ? (
          <button type="button" className={BTN_PRIMARY} onClick={() => setDialog({ engagement: null })}>
            <CalendarPlus size={14} strokeWidth={2.6} /> Schedule call
          </button>
        ) : null}
      </Toolbar>

      {/* Bandwidth — the reason this calendar exists. */}
      <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        <Stat label="Booked this week" value={formatDuration(weekBooked)} sub={`${weekCalls} call${weekCalls === 1 ? "" : "s"}`} />
        <Stat label="Free this week" value={formatDuration(weekFree)} sub="of 70h (10 AM – 8 PM × 7)" tone="green" />
        {cap ? (
          <Stat
            label="Active accounts"
            value={`${cap.active} / ${cap.limit || "∞"}`}
            sub={cap.tone === "red" ? "Over capacity" : cap.tone === "amber" ? "Near capacity" : "Has room"}
            tone={cap.tone}
          />
        ) : null}
        <Stat label="Hand-holding calls" value={formatDuration(weekHh)} sub={member?.employeeId ? "from Hand-holding, read-only" : "no login linked"} />
      </div>

      <div className={`${CARD} scroll-x-only`} style={CARD_SHADOW}>
        <div className="min-w-[740px]">
          {/* Headers */}
          <div className="grid border-b border-hairline" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
            <div />
            {perDay.map((d, i) => {
              const isToday = d.date === today;
              const freeTone = d.free >= 360 ? "green" : d.free >= 120 ? "amber" : "red";
              return (
                <div key={d.date} className="border-l border-hairline px-2 py-2 text-center" style={isToday ? { background: "var(--color-altus-red-wash)" } : undefined}>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">{CE_DAYS[i]!.short}</div>
                  <div className="text-[15px] font-extrabold leading-tight text-ink-strong" style={DISPLAY}>
                    {fmtDate(d.date)}
                  </div>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    <span className="whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums" style={{ color: TONE_VAR[freeTone].ink, background: `color-mix(in srgb, ${TONE_VAR[freeTone].fill} 45%, transparent)` }}>
                      {formatDuration(d.free)} free
                    </span>
                    {d.booked ? (
                      <span className="whitespace-nowrap rounded-full bg-surface-soft px-1.5 py-px text-[10.5px] font-bold tabular-nums text-ink-muted">
                        {d.calls} · {formatDuration(d.booked)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hand-holding calls with no clock — listed, never dropped. */}
          {hasUntimed ? (
            <div className="grid border-b border-hairline bg-surface-soft" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
              <div className="flex items-center justify-center px-1 text-center text-[9.5px] font-bold uppercase leading-tight text-ink-subtle">HH no time</div>
              {perDay.map((d) => (
                <div key={d.date} className="border-l border-hairline px-1.5 py-1">
                  {d.untimed.map((h) => (
                    <div key={h.id} className="truncate rounded border border-dashed border-hairline-strong bg-surface-card px-1.5 py-0.5 text-[10.5px] text-ink-muted" title={`Hand-holding: ${h.entryName} · ${h.durationMin} min (no time set)`}>
                      {h.entryName} · {h.durationMin}m
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {/* The grid */}
          <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
            <div className="relative" style={{ height: GRID_H }}>
              {HOURS.map((h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] font-bold tabular-nums text-ink-subtle" style={{ top: top(h) }}>
                  {h === CE_DAY_END_MIN ? "" : toClock(h)}
                </div>
              ))}
            </div>
            {perDay.map((d) => (
              <div
                key={d.date}
                className={`relative border-l border-hairline ${canEdit ? "cursor-pointer" : ""}`}
                style={{ height: GRID_H, background: d.date === today ? "color-mix(in srgb, var(--color-altus-red-wash) 55%, transparent)" : undefined }}
                title={canEdit ? "Click an empty spot to schedule a call there" : undefined}
                // Empty space is free time, and it is NOT drawn (asked 2026-09-18:
                // only booked time gets a box). Clicking it still schedules there,
                // snapped to the quarter hour. Blocks stop propagation of their own
                // clicks, so this fires only on empty space.
                onClick={
                  canEdit
                    ? (ev) => {
                        const rect = ev.currentTarget.getBoundingClientRect();
                        const raw = CE_DAY_START_MIN + (ev.clientY - rect.top) / PX_PER_MIN;
                        const start = Math.min(CE_DAY_END_MIN - 15, Math.max(CE_DAY_START_MIN, Math.floor(raw / 15) * 15));
                        const gap = d.gaps.find((g) => start >= g.start && start < g.end);
                        if (!gap) return;
                        setDialog({ engagement: null, preset: { dayOfWeek: dayCodeOf(d.date), startMin: start, endMin: Math.min(gap.end, start + 30) } });
                      }
                    : undefined
                }
              >
                {HOURS.slice(1, -1).map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-hairline" style={{ top: top(h) }} />
                ))}
                {HOURS.slice(0, -1).map((h) => (
                  <div key={`h${h}`} className="absolute inset-x-0 border-t border-dashed" style={{ top: top(h + 30), borderColor: "rgba(60,44,40,0.045)" }} />
                ))}

                {/* Calls */}
                {d.blocks.map((b) => {
                  const h = Math.max(MIN_BLOCK_H, (b.end - b.start) * PX_PER_MIN - 2);
                  const width = `calc((100% - 8px) / ${b.lanes})`;
                  const left = `calc(4px + (100% - 8px) / ${b.lanes} * ${b.lane})`;
                  if (b.kind === "hh") {
                    return (
                      <div
                        key={b.key}
                        className="absolute overflow-hidden rounded-md border border-dashed px-1.5 py-0.5"
                        style={{ top: top(b.start) + 1, height: h, width, left, borderColor: "var(--color-slate-deep)", background: "repeating-linear-gradient(135deg, var(--color-slate-bg), var(--color-slate-bg) 6px, var(--color-surface-card) 6px, var(--color-surface-card) 12px)" }}
                        title={`Hand-holding: ${b.hh!.entryName} · ${toClock(b.start)} – ${toClock(b.end)} (read-only)`}
                      >
                        <div className="truncate text-[10.5px] font-bold text-ink-soft">HH · {b.hh!.entryName}</div>
                      </div>
                    );
                  }
                  const e = b.engagement!;
                  const tone = CALL_TONE[e.callType] ?? "slate";
                  const status = hhStatusMeta(b.account?.hhStatus);
                  const label = b.account ? accountLabel(b.account.fullName, b.account.batchCode) : "Removed account";
                  const compact = h < 34;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); setDialog({ engagement: e }); }}
                      disabled={!canEdit}
                      className="absolute overflow-hidden rounded-md px-1.5 text-left transition-shadow hover:shadow-md disabled:cursor-default"
                      style={{
                        top: top(b.start) + 1,
                        height: h,
                        width,
                        left,
                        paddingTop: compact ? 1 : 3,
                        color: `var(--color-${tone}-deep)`,
                        background: b.inactive
                          ? `repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-${tone}-pale) 80%, var(--color-surface-card)), color-mix(in srgb, var(--color-${tone}-pale) 80%, var(--color-surface-card)) 5px, var(--color-surface-card) 5px, var(--color-surface-card) 10px)`
                          : `var(--color-${tone}-pale)`,
                        border: `1px solid var(--color-${tone}-edge)`,
                        borderLeft: `4px solid ${status.bg ?? `var(--color-${tone}-deep)`}`,
                        opacity: b.inactive ? 0.7 : 1,
                      }}
                      title={`${label} · ${callTypeLabel(e.callType)} · ${toClock(b.start)} – ${toClock(b.end)} (${formatDuration(b.end - b.start)})${b.inactive ? " · INACTIVE" : ""}${status.bg ? ` · ${status.label}` : ""}`}
                    >
                      <div className="flex items-start gap-1">
                        <span className={`min-w-0 flex-1 text-[11px] font-extrabold leading-tight ${h >= 52 ? "line-clamp-2 break-words" : "truncate"}`}>{label}</span>
                        {b.inactive ? (
                          <span className="shrink-0 rounded bg-surface-card px-1 text-[9px] font-black uppercase tracking-wide text-ink-muted">Inactive</span>
                        ) : null}
                      </div>
                      {!compact ? (
                        <div className="truncate text-[10px] font-semibold tabular-nums opacity-85">
                          {toClock(b.start)}–{toClock(b.end)} · {callTypeLabel(e.callType, true)}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] font-semibold text-ink-muted">
        {CE_CALL_TYPES.map((t) => (
          <span key={t.code} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded" style={{ background: `var(--color-${CALL_TONE[t.code]}-pale)`, border: `1px solid var(--color-${CALL_TONE[t.code]}-edge)` }} />
            {t.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded opacity-70" style={{ background: "repeating-linear-gradient(135deg, var(--color-blue-pale), var(--color-blue-pale) 3px, #fff 3px, #fff 6px)", border: "1px solid var(--color-blue-edge)" }} />
          Inactive / on-hold client
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded border border-dashed" style={{ borderColor: "var(--color-slate-deep)" }} />
          Hand-holding (read-only)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Info size={12} strokeWidth={2.4} /> The left edge carries the client&apos;s status colour
        </span>
      </div>

      {canViewAny ? (
        <TeamBandwidth
          members={members}
          memberId={memberId}
          dates={dates}
          engagements={allEngagements}
          accountById={accountById}
          onPick={(id) => go({ member: id })}
        />
      ) : null}

      {dialog ? (
        <EngagementDialog
          engagement={dialog.engagement}
          preset={dialog.preset ? { ...dialog.preset, memberId } : { memberId }}
          members={canManage ? members : members.filter((m) => m.id === memberId)}
          accounts={accounts}
          lockedMemberId={canManage ? null : memberId}
          canManage={canManage}
          today={today}
          weekStart={monday}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "green" | "amber" | "red" }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card px-3 py-2.5" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</div>
      <div className="mt-0.5 text-[20px] font-extrabold leading-tight tabular-nums" style={{ ...DISPLAY, color: tone ? TONE_VAR[tone].ink : "var(--color-ink-strong)" }}>
        {value}
      </div>
      <div className="text-[11px] font-medium text-ink-subtle">{sub}</div>
    </div>
  );
}

/**
 * Everyone's booked time per day, side by side — the admin's "who has room this
 * week" before opening anyone's calendar. Click a row to open that person.
 */
function TeamBandwidth({
  members,
  memberId,
  dates,
  engagements,
  accountById,
  onPick,
}: {
  members: CeMemberRow[];
  memberId: string;
  dates: string[];
  engagements: CeEngagementRow[];
  accountById: Map<string, CeAccountRow>;
  onPick: (id: string) => void;
}) {
  const DAY_MIN = CE_DAY_END_MIN - CE_DAY_START_MIN;
  return (
    <section className={`${CARD} mt-4 scroll-x-only`} style={CARD_SHADOW}>
      <header className="flex flex-wrap items-baseline gap-2 border-b border-hairline px-4 py-2.5">
        <h2 className="text-[15px] font-extrabold text-ink-strong" style={DISPLAY}>
          Team bandwidth
        </h2>
        <span className="text-[12px] text-ink-muted">Booked time per day, this week. Click a row to open that calendar.</span>
      </header>
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            <th className="px-4 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Employee</th>
            {dates.map((d, i) => (
              <th key={d} className="px-2 py-2 text-center text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                {CE_DAYS[i]!.short}
              </th>
            ))}
            <th className="px-4 py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Week</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const mine = engagements.filter((e) => e.teamMemberId === m.id && !isInactiveAccount(accountById.get(e.accountId) ?? { lifecycleStatus: "active", hhStatus: "standard" }));
            const perDay = dates.map((d) => mine.filter((e) => runsOn(e, d)).reduce((s, e) => s + slotMinutes(e), 0));
            const week = perDay.reduce((s, x) => s + x, 0);
            const selected = m.id === memberId;
            return (
              <tr
                key={m.id}
                onClick={() => onPick(m.id)}
                className="cursor-pointer border-b border-hairline last:border-0 hover:bg-surface-soft"
                style={selected ? { background: "color-mix(in srgb, var(--color-altus-red) 5%, transparent)" } : undefined}
              >
                <td className="px-4 py-2 text-[13px] font-bold text-ink-strong">{m.name}</td>
                {perDay.map((min, i) => {
                  const share = min / DAY_MIN;
                  return (
                    <td key={dates[i]} className="px-1.5 py-1.5">
                      <div
                        className="rounded-md px-1 py-1 text-center text-[11px] font-bold tabular-nums"
                        style={{
                          background: min ? `color-mix(in srgb, var(--color-altus-red) ${Math.round(8 + share * 50)}%, var(--color-surface-card))` : "var(--color-surface-soft)",
                          color: share > 0.6 ? "var(--color-altus-red-deep)" : "var(--color-ink-muted)",
                        }}
                      >
                        {min ? formatDuration(min) : "—"}
                      </div>
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right text-[13px] font-extrabold tabular-nums text-ink-strong">{formatDuration(week)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
