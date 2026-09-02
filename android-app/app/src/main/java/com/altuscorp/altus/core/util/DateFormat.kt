package com.altuscorp.altus.core.util

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/**
 * Date/time formatting for the app's mono numerals (JetBrains Mono, tabular).
 * Every hard timestamp the product shows funnels through here so the
 * fingerprint stays consistent: 24h "18:42" times, "12 Jun" dates, ISO
 * `yyyy-MM-dd` day keys for the DCC board, and relative phrases for the inbox
 * and task timeline.
 *
 * All output is Locale.ENGLISH — the ledger reads the same on every phone.
 */
object DateFormat {

    private val TIME: DateTimeFormatter =
        DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH)
    private val CLOCK: DateTimeFormatter =
        DateTimeFormatter.ofPattern("HH:mm:ss", Locale.ENGLISH)
    private val DAY_MONTH: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
    private val DAY_MONTH_YEAR: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)
    private val WEEKDAY_DAY_MONTH: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH)
    private val DAY_KEY: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

    /** "18:42" — punch times, timeline stamps. */
    fun time(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): String =
        TIME.format(instant.atZone(zone))

    /** "18:42:07" — the punch screen's live seconds clock. */
    fun clock(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): String =
        CLOCK.format(instant.atZone(zone))

    /** "12 Jun" — compact date for meta rows. */
    fun date(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): String =
        DAY_MONTH.format(instant.atZone(zone))

    /** "12 Jun 2026" — dates outside the current year. */
    fun dateWithYear(instant: Instant, zone: ZoneId = ZoneId.systemDefault()): String =
        DAY_MONTH_YEAR.format(instant.atZone(zone))

    /** Compact date that only spends the year when it differs from today's. */
    fun dateSmart(
        instant: Instant,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        val date = instant.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        return if (date.year == today.year) DAY_MONTH.format(date) else DAY_MONTH_YEAR.format(date)
    }

    /** ISO `yyyy-MM-dd` — the server's DCC date key (`/dcc?date=`). */
    fun dayKey(date: LocalDate): String = DAY_KEY.format(date)

    /** Today's ISO day key in [zone]. */
    fun todayKey(zone: ZoneId = ZoneId.systemDefault()): String =
        dayKey(LocalDate.now(zone))

    /** Parses an ISO `yyyy-MM-dd` key; null on malformed input. */
    fun parseDayKey(key: String): LocalDate? = try {
        LocalDate.parse(key, DAY_KEY)
    } catch (_: DateTimeParseException) {
        null
    }

    /** "Today" / "Yesterday" / "Mon, 30 Jun" — inbox day-group headers. */
    fun dayHeader(
        date: LocalDate,
        today: LocalDate = LocalDate.now(),
    ): String = when (date) {
        today -> "Today"
        today.minusDays(1) -> "Yesterday"
        else -> WEEKDAY_DAY_MONTH.format(date)
    }

    /**
     * Relative phrase for timeline/inbox rows: "Just now", "4m ago", "3h ago",
     * then Yesterday/compact date once it is older than today.
     */
    fun relative(
        instant: Instant,
        now: Instant = Instant.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): String {
        val elapsed = Duration.between(instant, now)
        if (elapsed.isNegative) return time(instant, zone)
        val date = instant.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        return when {
            elapsed.toMinutes() < 1 -> "Just now"
            elapsed.toMinutes() < 60 -> "${elapsed.toMinutes()}m ago"
            date == today -> "${elapsed.toHours()}h ago"
            date == today.minusDays(1) -> "Yesterday"
            else -> dateSmart(instant, now, zone)
        }
    }

    /** "In 9:14 · Out —" style mono value: a time or the em-dash placeholder. */
    fun timeOrDash(instant: Instant?, zone: ZoneId = ZoneId.systemDefault()): String =
        instant?.let { time(it, zone) } ?: "—"

    /** "7h 32m" — durations for attendance summaries. Sub-minute → "0m". */
    fun duration(duration: Duration): String {
        val minutes = duration.toMinutes().coerceAtLeast(0)
        val hours = minutes / 60
        val rest = minutes % 60
        return if (hours > 0) "${hours}h ${rest}m" else "${rest}m"
    }
}
