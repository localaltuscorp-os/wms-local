/**
 * Barrel for the auto-block reconcilers (design §6). Batch schedules project
 * locked calendar_events keyed on `source_ref_id`; everything else imports from
 * here. (Holiday auto-block was removed — holidays are managed in HR.)
 */
export { reconcileBatchEvents } from "./reconcile-batch";
