/**
 * AI Insights + Smart Alerts panels for the Attendance Workforce Intelligence
 * dashboard. Self-contained; the org dashboard can mount either directly:
 *
 *   import { AiInsightsPanel, SmartAlertsPanel } from "@/components/attendance/insights/ai";
 *
 * `SmartAlertsPanel` takes pre-computed `SmartAlert[]` (from `computeSmartAlerts`,
 * pure — call it in the RSC alongside `loadOrgAttendanceAnalytics`).
 * `AiInsightsPanel` fetches on demand via the `generateAttendanceInsights`
 * server action (or accepts `initialInsights` for an instant server render).
 */
export { AiInsightsPanel } from "./ai-insights-panel";
export { SmartAlertsPanel } from "./smart-alerts-panel";
