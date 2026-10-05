/** Default probation date for employees without an explicit end date. */
export function defaultProbationEnd(
  joinedAt: Date | string | null | undefined,
  explicitEnd: string | Date | null | undefined,
): string | null {
  if (explicitEnd) {
    return typeof explicitEnd === "string" ? explicitEnd.slice(0, 10) : explicitEnd.toISOString().slice(0, 10);
  }
  if (!joinedAt) return null;
  const start = typeof joinedAt === "string" ? new Date(`${joinedAt.slice(0, 10)}T00:00:00Z`) : joinedAt;
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 180);
  return end.toISOString().slice(0, 10);
}

export function probationEndAfterDays(joinedAt: Date | string | null | undefined, days: 90 | 180): string | null {
  if (!joinedAt) return null;
  const start = typeof joinedAt === "string" ? new Date(`${joinedAt.slice(0, 10)}T00:00:00Z`) : joinedAt;
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString().slice(0, 10);
}
