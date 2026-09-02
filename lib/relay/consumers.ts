/**
 * Phase B — the consumer registry. Every projection / command consumer the
 * relay drives is listed here. Each has its own independent cursor, so adding a
 * new consumer (or a new engine's projection) is a one-line registration — it
 * begins at seq 0 and catches up from the full history on its next run (Law 4).
 */
import type { Consumer } from "./relay";
import { taskMetricsConsumer } from "@/lib/projections/task-metrics";
import { employeeTwinConsumer } from "@/lib/projections/employee-twin";
import { employeeScoreDailyConsumer } from "@/lib/projections/employee-score-daily";
import { commandDispatcherConsumer } from "@/lib/commands/dispatcher";

export const CONSUMERS: Consumer[] = [
  // Pure projection — no external effects, runs by default.
  taskMetricsConsumer,
  // PMS Layer 2 (mig 0095) — pure employee-intelligence projections. Each starts
  // at seq 0 and replays the full history on its next relay run (Law 4).
  employeeTwinConsumer,
  employeeScoreDailyConsumer,
  // Command channel — gated by COMMANDS_VIA_LEDGER (no-op until enabled, Law 8).
  commandDispatcherConsumer,
];
