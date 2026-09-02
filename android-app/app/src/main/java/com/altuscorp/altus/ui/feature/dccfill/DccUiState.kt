package com.altuscorp.altus.feature.dcc

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.ui.designsystem.CommitValue
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.persistentSetOf

/**
 * S5 — DCC FILL BOARD, the flagship loop. One @Immutable UiState reduced from
 * the cache-first [com.altuscorp.altus.data.repository.DccRepository] board plus
 * the ViewModel's local view state (selected day, expansion sets, refresh /
 * error flags). Every field is render-ready so the composable stays dumb:
 * strings are pre-formatted, counters are pre-built mono copy, and the tri-state
 * commit value is already mapped off the server's status vocabulary.
 */
@Immutable
data class DccUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    /** Cold-cache load failure copy; only surfaced while still cold. */
    val loadError: String? = null,
    val isRefreshing: Boolean = false,
    val title: String = "Daily compliance",
    val ownerName: String = "",
    /** Context line for a non-today board ("Sat 5 Jul"); null on today. */
    val dateLabel: String? = null,
    val isToday: Boolean = true,
    val chips: ImmutableList<DccDayChipUi> = persistentListOf(),
    // Pinned compliance ring inputs.
    val due: Int = 0,
    val filled: Int = 0,
    val pct: Int = 0,
    val isComplete: Boolean = false,
    val sections: ImmutableList<DccSectionUi> = persistentListOf(),
    val participants: ImmutableList<DccParticipantUi> = persistentListOf(),
    val trays: ImmutableList<DccTrayUi> = persistentListOf(),
    val expandedParticipantIds: ImmutableSet<String> = persistentSetOf(),
    val expandedTrayKinds: ImmutableSet<String> = persistentSetOf(),
    /** No KPIs at all for the day — the calm "nothing due" state. */
    val showEmpty: Boolean = false,
) {
    /** 0..1 for the compliance ring sweep; server guards divide-by-zero. */
    val fraction: Float get() = if (due > 0) (filled.toFloat() / due).coerceIn(0f, 1f) else if (isComplete) 1f else 0f

    /** Editing is only allowed on today's board (past days are read-only). */
    val editable: Boolean get() = isToday
}

/** One 7-day selector chip: weekday + day number, today / selected flags. */
@Immutable
data class DccDayChipUi(
    val dayKey: String,
    val weekday: String,
    val dayNum: String,
    val isToday: Boolean,
    val isSelected: Boolean,
)

/** A simple daily-section KPI row. */
@Immutable
data class DccKpiRowUi(
    val id: String,
    val title: String,
    /** Pre-built "code · frequency" meta, or null. */
    val meta: String?,
    /** Tri-state value mapped off the server status ("Done"→Done, filled-not-done→Na). */
    val commit: CommitValue?,
    val committed: Boolean,
    /** A committed numeric value, shown inline in mono when present. */
    val value: String?,
    val note: String?,
)

/** Sticky-header section of daily KPIs. */
@Immutable
data class DccSectionUi(
    val key: String,
    /** UPPERCASE eyebrow ("SECTION B · CLIENT: ACME"). */
    val title: String,
    /** Mono "2/4". */
    val count: String,
    val items: ImmutableList<DccKpiRowUi>,
)

/** One participant inside a roster-KPI. */
@Immutable
data class DccParticipantSubjectUi(
    val id: String,
    val name: String,
    val commit: CommitValue?,
    val done: Boolean,
)

/** A participant-roster KPI card (collapsed → unfolds to per-person rows). */
@Immutable
data class DccParticipantUi(
    val id: String,
    val title: String,
    val meta: String?,
    /** Mono "9/14". */
    val count: String,
    val fraction: Float,
    val subjects: ImmutableList<DccParticipantSubjectUi>,
)

/** A weekly / monthly / ad-hoc tray (sunken bed, expands to KPI rows). */
@Immutable
data class DccTrayUi(
    /** Stable kind key: "WEEKLY" | "MONTHLY" | "ADHOC". */
    val kind: String,
    /** UPPERCASE eyebrow with due hint ("WEEKLY · due Fri"). */
    val label: String,
    /** Mono "1/3". */
    val count: String,
    val items: ImmutableList<DccKpiRowUi>,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface DccIntent {
    data class SelectDay(val dayKey: String) : DccIntent
    data object Refresh : DccIntent
    data object DismissLoadError : DccIntent

    /** Simple-KPI tri-state commit; [status] null clears the entry. */
    data class CommitItem(val itemId: String, val status: String?) : DccIntent

    /** Numeric / note sheet save. */
    data class SaveValue(
        val itemId: String,
        val status: String,
        val value: String?,
        val note: String?,
    ) : DccIntent

    data class ToggleParticipant(val itemId: String) : DccIntent
    data class ToggleTray(val kind: String) : DccIntent

    /** One participant's Done/NA toggle; [status] null clears. */
    data class CommitParticipant(
        val itemId: String,
        val subjectId: String,
        val status: String?,
    ) : DccIntent

    /** The roster wave: set every participant at once ([status] null clears). */
    data class BulkParticipants(val itemId: String, val status: String?) : DccIntent
}

/** One-shot effects the screen turns into haptics / snackbars. */
sealed interface DccEvent {
    /**
     * A committed mutation was refused; the board has ALREADY reverted (repo
     * contract) — the screen fires the "uh-uh" and a Retry snackbar. A stale
     * conflict additionally shakes.
     */
    data class Revert(val message: String, val isStaleConflict: Boolean) : DccEvent

    /** Today's board just crossed to 100% — the pinned ring seals (heavy click). */
    data object DayComplete : DccEvent
}

/** Server status vocabulary the two commit paths speak. */
object DccStatus {
    const val DONE = "Done"
    const val NA = "NA"

    fun toCommit(status: String?): CommitValue? = when (status) {
        null -> null
        DONE -> CommitValue.Done
        else -> CommitValue.Na
    }

    fun fromCommit(value: CommitValue): String = when (value) {
        CommitValue.Done -> DONE
        CommitValue.Na -> NA
    }
}
