export interface AttendanceSchedule { lateAfter: string; earlyBefore: string; fullDayMinutes: number; halfDayMinutes: number; }
export interface ScheduleOverride { lateAfter?: string|null; earlyBefore?: string|null; fullDayHours?: number|null; halfDayHours?: number|null; }
export function resolveSchedule(o: ScheduleOverride, def: AttendanceSchedule): AttendanceSchedule {
  return {
    lateAfter: o.lateAfter ?? def.lateAfter,
    earlyBefore: o.earlyBefore ?? def.earlyBefore,
    fullDayMinutes: (o.fullDayHours != null ? o.fullDayHours : def.fullDayMinutes/60) * 60,
    halfDayMinutes: (o.halfDayHours != null ? o.halfDayHours : def.halfDayMinutes/60) * 60,
  };
}
