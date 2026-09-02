// Rolling horizon: first day of the month, 18 months ahead of `today`.
export function rollingHorizon(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(y, m - 1 + 18, 1));
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
