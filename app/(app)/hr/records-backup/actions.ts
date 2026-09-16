"use server";

import { requireUser } from "@/lib/auth/current";
import { canExportHrRecords } from "@/lib/hr/records-export/access";
import { disconnectDrive, getDriveStatus, saveDriveSchedule } from "@/lib/hr/records-export/settings";
import type { DriveStatus } from "@/lib/hr/records-export/status";

type Result = { ok: true; status: DriveStatus } | { ok: false; error: string };

const FORBIDDEN = "Only HR admins can change the Drive backup.";

async function allowed(): Promise<boolean> {
  return canExportHrRecords(await requireUser());
}

export async function updateDriveScheduleAction(input: {
  enabled: boolean;
  intervalMonths: number;
  dayOfMonth: number;
}): Promise<Result> {
  if (!(await allowed())) return { ok: false, error: FORBIDDEN };
  try {
    await saveDriveSchedule(input);
    return { ok: true, status: await getDriveStatus() };
  } catch {
    return { ok: false, error: "Couldn't save the schedule. Try again." };
  }
}

export async function disconnectDriveAction(): Promise<Result> {
  if (!(await allowed())) return { ok: false, error: FORBIDDEN };
  try {
    await disconnectDrive();
    return { ok: true, status: await getDriveStatus() };
  } catch {
    return { ok: false, error: "Couldn't disconnect Google Drive. Try again." };
  }
}

export async function refreshDriveStatusAction(): Promise<Result> {
  if (!(await allowed())) return { ok: false, error: FORBIDDEN };
  try {
    return { ok: true, status: await getDriveStatus() };
  } catch {
    return { ok: false, error: "Couldn't load the Drive backup status." };
  }
}
