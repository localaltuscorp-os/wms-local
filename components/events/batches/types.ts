import type { EventStatus } from "@/db/enums";

/** Batch/section type option for the schedule form's picker. */
export interface BatchTypeOption {
  id: string;
  name: string;
  defaultCategoryId: string | null;
}

/** Event category option (colour legend) for the schedule form's picker. */
export interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

/** A batch schedule row, denormalised for display + editing. */
export interface BatchScheduleRow {
  id: string;
  batchTypeId: string;
  batchTypeName: string | null;
  name: string | null;
  startDate: string;
  endDate: string;
  startMin: number | null;
  endMin: number | null;
  daysOfWeek: number[] | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  status: EventStatus;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  /** How many locked calendar_events this schedule currently projects. */
  blockCount: number;
}
