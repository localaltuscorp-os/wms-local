/**
 * PMS Layer 2 — the PURE employee-twin projection rule (mig 0095). Modelled on
 * task-metrics-rule.ts: imports nothing but event types (no db), so it's
 * unit-testable in isolation and the consumer in employee-twin.ts is a thin
 * wrapper that just applies the delta.
 *
 * It maps each of the five employee-domain events to a counter delta keyed by
 * employeeId. NON-employee aggregates (incl. "task") return null — task activity
 * is read from task_metrics_daily at score time, never duplicated here.
 */
import {
  ATTENDANCE_AGGREGATE,
  GOAL_AGGREGATE,
  DCC_AGGREGATE,
  TRAINING_AGGREGATE,
  FEEDBACK_AGGREGATE,
  AttendanceEventTypes,
  GoalEventTypes,
  DccEventTypes,
  TrainingEventTypes,
  FeedbackEventTypes,
  type StoredEvent,
  type AttendancePunchedV1,
  type GoalProgressLoggedV1,
  type DccEntryFilledV1,
  type TrainingTestAttemptedV1,
  type FeedbackReceivedV1,
} from "@/lib/events/types";

/** Every raw counter the twin (and the daily history) carries. Integer counters
 *  and numeric sums; the numeric sums are applied as decimal increments. */
export interface TwinDelta {
  employeeId: string;
  presenceDays: number;
  lateCount: number;
  punctualDays: number;
  goalEffSumWeighted: number;
  goalWeightSum: number;
  goalsCompleted: number;
  goalsFilledOnTime: number;
  goalProgressEvents: number;
  dccDueCount: number;
  dccDoneCount: number;
  testsPassed: number;
  testsAttempted: number;
  materialsWatched: number;
  feedbackCount: number;
  feedbackRatingSum: number;
}

/** All counters zeroed — every rule starts from this and bumps only what it
 *  touches, so a column is never accidentally moved. */
function zero(employeeId: string): TwinDelta {
  return {
    employeeId,
    presenceDays: 0,
    lateCount: 0,
    punctualDays: 0,
    goalEffSumWeighted: 0,
    goalWeightSum: 0,
    goalsCompleted: 0,
    goalsFilledOnTime: 0,
    goalProgressEvents: 0,
    dccDueCount: 0,
    dccDoneCount: 0,
    testsPassed: 0,
    testsAttempted: 0,
    materialsWatched: 0,
    feedbackCount: 0,
    feedbackRatingSum: 0,
  };
}

/** Which counters, if any, an employee-domain event moves. Returns null for
 *  events that don't affect the twin (or carry no employee). Pure. */
export function employeeTwinDelta(event: StoredEvent): TwinDelta | null {
  switch (event.aggregateType) {
    case ATTENDANCE_AGGREGATE: {
      if (event.eventType !== AttendanceEventTypes.Punched) return null;
      const p = event.payload as unknown as AttendancePunchedV1;
      if (!p.employeeId) return null;
      // Presence is counted on the IN punch only (one per day per kind).
      if (p.kind !== "in") return null;
      const d = zero(p.employeeId);
      d.presenceDays = 1;
      d.lateCount = p.late ? 1 : 0;
      d.punctualDays = p.late === false ? 1 : 0; // null (ungradable) → neither
      return d;
    }
    case GOAL_AGGREGATE: {
      if (event.eventType !== GoalEventTypes.ProgressLogged) return null;
      const p = event.payload as unknown as GoalProgressLoggedV1;
      if (!p.employeeId) return null;
      const pct = p.pctDone ?? 0;
      const weight = p.weight ?? 0;
      const d = zero(p.employeeId);
      d.goalEffSumWeighted = pct * weight;
      d.goalWeightSum = weight;
      d.goalsCompleted = pct >= 100 ? 1 : 0;
      d.goalsFilledOnTime = p.filledOnTime ? 1 : 0;
      d.goalProgressEvents = 1;
      return d;
    }
    case DCC_AGGREGATE: {
      if (event.eventType !== DccEventTypes.EntryFilled) return null;
      const p = event.payload as unknown as DccEntryFilledV1;
      if (!p.employeeId) return null;
      const d = zero(p.employeeId);
      d.dccDueCount = 1;
      d.dccDoneCount = p.status === "Done" ? 1 : 0;
      return d;
    }
    case TRAINING_AGGREGATE: {
      if (event.eventType !== TrainingEventTypes.TestAttempted) {
        if (event.eventType === TrainingEventTypes.MaterialWatched) {
          const p = event.payload as unknown as { employeeId?: string };
          if (!p.employeeId) return null;
          const d = zero(p.employeeId);
          d.materialsWatched = 1;
          return d;
        }
        return null;
      }
      const p = event.payload as unknown as TrainingTestAttemptedV1;
      if (!p.employeeId) return null;
      const d = zero(p.employeeId);
      d.testsAttempted = 1;
      d.testsPassed = p.passed ? 1 : 0;
      return d;
    }
    case FEEDBACK_AGGREGATE: {
      if (event.eventType !== FeedbackEventTypes.Received) return null;
      const p = event.payload as unknown as FeedbackReceivedV1;
      if (!p.employeeId) return null; // free-text / client feedback — no employee
      const d = zero(p.employeeId);
      d.feedbackCount = 1;
      d.feedbackRatingSum = p.rating ?? 0;
      return d;
    }
    default:
      return null; // task / command / any foreign aggregate
  }
}
