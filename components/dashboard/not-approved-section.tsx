"use client";

import * as React from "react";
import { Plus, Minus } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import type { Route } from "next";
import type { NotApprovedAging, NotApprovedPerson } from "@/lib/types";

const RED = "var(--color-red-deep, #B91C1C)";

/**
 * Not Approved — declined tasks sent back to be redone, waiting to be
 * actioned. A collapsed-by-default section (the body is not mounted until
 * opened, like DoneAgingSection). Open body shows a
 * red-toned "days waiting" histogram (every band is overdue for sign-off) and
 * a person-wise list: admins see everyone, a non-admin sees only their own
 * row. Each person row drills into their declined tasks via a Popover (same
 * pattern as aging-heatmap), oldest-first, each linking to the task.
 */
export function NotApprovedSection({
  data,
  isAdmin,
  meId,
}: {
  data: NotApprovedAging;
  isAdmin: boolean;
  meId: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 max-md:mt-6">
      <div
        className="bg-surface-card rounded-section overflow-hidden"
        style={{
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="not-approved-body"
          className="w-full flex items-center justify-between gap-4 p-8 max-md:p-5 text-left transition-colors hover:bg-surface-subtle/40"
        >
          <div className="min-w-0">
            <h2 className="text-display-lg text-ink-strong">
              <span aria-hidden className="mr-2">↩️</span>Not Approved
            </h2>
            <p className="text-body-lg text-ink-subtle mt-1">
              Tasks sent back, waiting to be redone — oldest first.{" "}
              <span className="font-semibold text-ink-soft">
                {open ? "Click to hide." : "Click to view."}
              </span>
            </p>
          </div>
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-all"
            style={{
              background: open
                ? "var(--color-altus-red)"
                : "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: open ? "#fff" : "var(--color-altus-red)",
            }}
          >
            {open ? (
              <Minus size={22} strokeWidth={2.6} />
            ) : (
              <Plus size={22} strokeWidth={2.6} />
            )}
          </span>
        </button>

        {open && (
          <div
            id="not-approved-body"
            className="border-t border-hairline p-8 max-md:p-5"
          >
            <Body data={data} isAdmin={isAdmin} meId={meId} />
          </div>
        )}
      </div>
    </section>
  );
}

function Body({
  data,
  isAdmin,
  meId,
}: {
  data: NotApprovedAging;
  isAdmin: boolean;
  meId: string | null;
}) {
  const { total, byPerson, bands } = data;

  if (total === 0) {
    return (
      <p className="text-[14px] font-semibold text-ink-subtle">
        No tasks have been sent back — nothing to action.
      </p>
    );
  }

  // Admins see everyone; a non-admin sees only their own row.
  const people = isAdmin
    ? byPerson
    : byPerson.filter((p) => p.employeeId === meId);

  const maxBand = Math.max(...bands.map((b) => b.count), 1);

  return (
    <div className="flex flex-col gap-8">
      {/* ── Days-waiting histogram (all red — overdue for sign-off) ── */}
      <div>
        <p className="mb-3 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          Days waiting · {total} declined {total === 1 ? "task" : "tasks"}
        </p>
        <ul className="flex flex-col gap-2">
          {bands.map((b) => {
            const w = (b.count / maxBand) * 100;
            return (
              <li key={b.id} className="flex items-center gap-3">
                <span
                  className="w-[26%] shrink-0 truncate text-[13px] font-bold text-ink-strong"
                  title={b.label}
                >
                  {b.label}
                </span>
                <span
                  className="relative h-3 flex-1 overflow-hidden rounded-full"
                  style={{
                    background:
                      "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)",
                  }}
                >
                  <span
                    className="absolute inset-y-0 left-0 transition-all"
                    style={{ width: `${w}%`, background: RED }}
                  />
                </span>
                <span
                  className="w-10 shrink-0 text-right text-[13px] font-black tabular-nums"
                  style={{
                    color: b.count > 0 ? RED : "var(--color-ink-subtle)",
                  }}
                >
                  {b.count}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Person-wise list ── */}
      <div>
        <p className="mb-2.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          {isAdmin ? "By person · most waiting first" : "Your declined tasks"}
        </p>
        {people.length === 0 ? (
          <p className="text-[14px] font-semibold text-ink-subtle">
            Nothing sent back to you — you&apos;re all clear.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {people.map((p) => (
              <PersonRow key={p.employeeId} person={p} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PersonRow({ person }: { person: NotApprovedPerson }) {
  return (
    <li>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="not-approved-row flex w-full items-center gap-3 rounded-chip px-3 py-3 text-left transition-colors hover:bg-surface-subtle/50 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              border: "1px solid var(--color-hairline)",
              background: "var(--color-surface-card)",
              outlineColor: RED,
            }}
            aria-label={`${person.employeeName}: ${person.count} declined ${person.count === 1 ? "task" : "tasks"} — view list`}
          >
            <span
              className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink-strong"
              title={person.employeeName}
            >
              {person.employeeName}
            </span>
            <span
              className="shrink-0 rounded-pill px-2.5 py-1 text-[13px] font-black tabular-nums"
              style={{
                color: RED,
                background:
                  "color-mix(in srgb, var(--color-red-deep, #B91C1C) 12%, transparent)",
                border:
                  "1px solid color-mix(in srgb, var(--color-red-deep, #B91C1C) 28%, transparent)",
              }}
            >
              {person.count}
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="center"
            sideOffset={10}
            collisionPadding={12}
            className="z-[100] bg-surface-card border rounded-section overflow-hidden max-h-[var(--radix-popover-content-available-height)] flex flex-col"
            style={{
              borderColor: RED,
              borderWidth: 2,
              boxShadow:
                "0 24px 56px -16px rgba(15, 23, 42, 0.24), 0 8px 24px -8px rgba(15, 23, 42, 0.14)",
              width: "min(420px, calc(100vw - 24px))",
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            {/* Header — red band */}
            <div
              className="px-5 py-4 shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, #ef4444, var(--color-red-deep, #B91C1C))",
                color: "#ffffff",
              }}
            >
              <p
                className="font-black leading-tight"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                }}
              >
                {person.employeeName}
              </p>
              <p
                className="uppercase tracking-[0.12em] font-bold mt-1.5 opacity-95"
                style={{
                  fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                  fontSize: 13,
                }}
              >
                Sent back · {person.tasks.length}{" "}
                {person.tasks.length === 1 ? "task" : "tasks"}
              </p>
            </div>

            {/* Task list — oldest first, each links to the task */}
            <ul className="flex flex-col flex-1 min-h-0 p-2 overflow-y-auto bg-surface-card">
              {person.tasks.length === 0 && (
                <li
                  className="py-4 px-3 font-semibold"
                  style={{ fontSize: 16, color: "var(--color-ink-muted)" }}
                >
                  No tasks.
                </li>
              )}
              {person.tasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tasks/${t.id}` as Route}
                    className="not-approved-popover-row flex items-start justify-between gap-3 py-3 px-3 rounded-chip transition-colors hover:bg-surface-subtle/60"
                  >
                    <span
                      className="text-ink-strong font-bold min-w-0"
                      style={{
                        fontSize: 15.5,
                        lineHeight: 1.4,
                        overflowWrap: "anywhere",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {t.title}
                    </span>
                    <span
                      className="tabular-nums font-black shrink-0 rounded-pill px-2.5 py-1 mt-0.5"
                      style={{
                        fontFamily: "var(--font-display), system-ui, sans-serif",
                        fontSize: 15,
                        color: RED,
                        background:
                          "color-mix(in srgb, var(--color-red-deep, #B91C1C) 12%, transparent)",
                        border:
                          "1px solid color-mix(in srgb, var(--color-red-deep, #B91C1C) 28%, transparent)",
                      }}
                    >
                      {t.waitingDays}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Popover.Arrow style={{ fill: RED }} width={14} height={8} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </li>
  );
}
