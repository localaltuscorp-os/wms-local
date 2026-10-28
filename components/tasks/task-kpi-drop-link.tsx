"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@/db/enums";
import { setTaskStatus } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { scheduleReconcile } from "@/lib/client/reconcile";

interface DragPayload {
  id?: unknown;
  updatedAt?: unknown;
}

/** A normal KPI filter link which additionally accepts a task-row drag. */
export function TaskKpiDropLink({
  href,
  status,
  label,
  active,
  children,
  style,
}: {
  href: Route;
  status: TaskStatus | null;
  label: string;
  active: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  async function onDrop(e: React.DragEvent<HTMLAnchorElement>) {
    if (!status || saving) return;
    e.preventDefault();
    let payload: DragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/x-altus-task"));
    } catch {
      return;
    }
    if (typeof payload.id !== "string" || typeof payload.updatedAt !== "string") return;

    setSaving(true);
    const result = await setTaskStatus(payload.id, status, payload.updatedAt);
    setSaving(false);
    if (!result.ok) {
      fireToast({ message: result.message ?? "You can't move this task to that status." });
      if (result.error === "stale") router.refresh();
      return;
    }
    fireToast({ message: `Task moved to ${label}` });
    scheduleReconcile(() => router.refresh());
  }

  return (
    <Link
      href={href}
      aria-pressed={active}
      aria-label={`${active ? "Remove" : "Add"} ${label.toLowerCase()} filter`}
      className="wg-rise block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
      style={style}
      onDragOver={(e) => {
        if (status) e.preventDefault();
      }}
      onDrop={(e) => void onDrop(e)}
    >
      {children}
    </Link>
  );
}
