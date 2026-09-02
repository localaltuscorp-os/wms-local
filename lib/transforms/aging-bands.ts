export interface AgingBand { id: string; label: string }

/** Signed early/late bands for DONE tasks. signedDays = dueDay - completedDay.
 *  Positive = finished early (good); negative = finished late (bad). */
export const DONE_AGING_BANDS: AgingBand[] = [
  { id: "e7",     label: "+7 or more early" },
  { id: "e4_6",   label: "+4 to +6 early" },
  { id: "e2_3",   label: "+2 to +3 early" },
  { id: "e1",     label: "+1 early" },
  { id: "d0",     label: "On the day" },
  { id: "l1",     label: "1 late" },
  { id: "l2_3",   label: "2–3 late" },
  { id: "l4_5",   label: "4–5 late" },
  { id: "l6_7",   label: "6–7 late" },
  { id: "l8_10",  label: "8–10 late" },
  { id: "l11_15", label: "11–15 late" },
  { id: "l16",    label: "16+ late" },
];

export function bucketSignedDays(s: number): string {
  if (s >= 7) return "e7";
  if (s >= 4) return "e4_6";
  if (s >= 2) return "e2_3";
  if (s === 1) return "e1";
  if (s === 0) return "d0";
  if (s === -1) return "l1";
  if (s >= -3) return "l2_3";
  if (s >= -5) return "l4_5";
  if (s >= -7) return "l6_7";
  if (s >= -10) return "l8_10";
  if (s >= -15) return "l11_15";
  return "l16";
}

/** Positive-only "days waiting for resolution" bands for declined tasks. */
export const WAITING_AGING_BANDS: AgingBand[] = [
  { id: "w0",     label: "Today" },
  { id: "w1",     label: "1 day" },
  { id: "w2_3",   label: "2–3 days" },
  { id: "w4_7",   label: "4–7 days" },
  { id: "w8_14",  label: "8–14 days" },
  { id: "w15_30", label: "15–30 days" },
  { id: "w30",    label: "30+ days" },
];

export function bucketWaitingDays(d: number): string {
  if (d <= 0) return "w0";
  if (d === 1) return "w1";
  if (d <= 3) return "w2_3";
  if (d <= 7) return "w4_7";
  if (d <= 14) return "w8_14";
  if (d <= 30) return "w15_30";
  return "w30";
}
