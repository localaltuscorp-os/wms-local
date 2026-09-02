package com.altuscorp.altus.core.util

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * The due-date rule, mirrored from `lib/tasks/effective-due.ts`:
 * `due_at` is immutable; edits land in `revised_target_date`; everything the
 * UI says about "due" derives from `COALESCE(revised_target_date, due_at)`.
 *
 * [DuePhase] drives styling (danger keyline for OVERDUE, warn for TODAY/SOON)
 * and [duePhrase] produces the human copy on task cards
 * ("Due today" / "Overdue 3d" / "Due Mon" / "Due 8 Jul").
 */
object EffectiveDue {

    /** Styling class of a due date. Ordered by urgency, most urgent last. */
    enum class DuePhase { NONE, LATER, SOON, TODAY, OVERDUE }

    /** How many days ahead still counts as "due soon" (warn tone). */
    const val SOON_WINDOW_DAYS: Long = 2

    private val WEEKDAY: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH)
    private val DAY_MONTH: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
    private val DAY_MONTH_YEAR: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)

    /** `COALESCE(revised_target_date, due_at)` — the only due date the UI may judge by. */
    fun effectiveDue(dueAt: Instant?, revisedTargetDate: Instant?): Instant? =
        revisedTargetDate ?: dueAt

    /** Phase of an effective due instant relative to [now] in [zone]. */
    fun duePhase(
        effective: Instant?,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): DuePhase {
        if (effective == null) return DuePhase.NONE
        val dueDate = effective.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        return when {
            dueDate.isBefore(today) -> DuePhase.OVERDUE
            dueDate.isEqual(today) -> DuePhase.TODAY
            !dueDate.isAfter(today.plusDays(SOON_WINDOW_DAYS)) -> DuePhase.SOON
            else -> DuePhase.LATER
        }
    }

    /**
     * Human due copy for task cards and the meta ledger:
     * - overdue → "Overdue 3d" (danger)
     * - today → "Due today" (warn)
     * - tomorrow → "Due tomorrow"
     * - within the next 6 days → "Due Mon"
     * - same year → "Due 8 Jul", else "Due 8 Jul 2027"
     * - no due date → ""
     */
    fun duePhrase(
        effective: Instant?,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        if (effective == null) return ""
        val dueDate = effective.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        val daysBetween = ChronoUnit.DAYS.between(today, dueDate)
        return when {
            daysBetween < 0 -> "Overdue ${-daysBetween}d"
            daysBetween == 0L -> "Due today"
            daysBetween == 1L -> "Due tomorrow"
            daysBetween < 7 -> "Due ${WEEKDAY.format(dueDate)}"
            dueDate.year == today.year -> "Due ${DAY_MONTH.format(dueDate)}"
            else -> "Due ${DAY_MONTH_YEAR.format(dueDate)}"
        }
    }

    /** True when the effective due date has slipped past today. */
    fun isOverdue(
        effective: Instant?,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): Boolean = duePhase(effective, now, zone) == DuePhase.OVERDUE

    /** Whole days overdue (0 when not overdue / no due date). */
    fun overdueDays(
        effective: Instant?,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): Long {
        if (effective == null) return 0
        val dueDate: LocalDate = effective.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        val days = ChronoUnit.DAYS.between(dueDate, today)
        return if (days > 0) days else 0
    }
}
