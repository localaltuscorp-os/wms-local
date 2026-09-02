export function rollingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  const out: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    out[i] = Math.round(avg * 10) / 10;
  }
  return out;
}
