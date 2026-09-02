package com.altuscorp.altus.feature.dcc

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.repository.DccRepository
import com.altuscorp.altus.data.sync.MutationRejection
import com.altuscorp.altus.domain.model.DccBoard
import com.altuscorp.altus.domain.model.DccItem
import com.altuscorp.altus.domain.model.DccParticipantKpi
import com.altuscorp.altus.domain.model.DccSection
import com.altuscorp.altus.domain.model.DccTrays
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.collections.immutable.toImmutableSet
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The DCC fill-board brain. Reads are cache-first — [DccRepository.board] paints
 * the last-decoded day instantly (null → skeletons) while [refresh] reconciles
 * against the server. Both commit paths are optimistic through the repo's
 * outbox: the cache patch flips the exact row AND delta-adjusts the stats on the
 * same emission, so the pinned compliance ring sweeps from the same frame the
 * control morphs. A refusal lands on [DccRepository.rejections] AFTER the board
 * has been reverted, so this ViewModel only has to fire the "uh-uh" + Retry.
 *
 * The screen owns the compliance ring and the 100%-seal moment: this ViewModel
 * emits [DccEvent.DayComplete] the instant today's board first crosses to 100%
 * (never on a cold load that was already complete — that moment has passed).
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class DccViewModel @Inject constructor(
    private val repository: DccRepository,
    savedState: androidx.lifecycle.SavedStateHandle,
) : ViewModel() {

    private data class LocalState(
        val selectedDay: String = DateFormat.todayKey(),
        val isRefreshing: Boolean = false,
        val loadError: String? = null,
        val expandedParticipants: Set<String> = emptySet(),
        val expandedTrays: Set<String> = emptySet(),
    )

    private val initialDay: String =
        savedState.get<String>("date")?.takeIf { DateFormat.parseDayKey(it) != null }
            ?: DateFormat.todayKey()

    private val local = MutableStateFlow(LocalState(selectedDay = initialDay))

    private val _events = Channel<DccEvent>(Channel.BUFFERED)
    val events: Flow<DccEvent> = _events.receiveAsFlow()

    /** Board flow re-subscribed whenever the selected day changes. */
    private val board: Flow<DccBoard?> =
        local
            .map { it.selectedDay }
            .distinctUntilChanged()
            .flatMapLatest { repository.board(it) }

    val uiState: StateFlow<DccUiState> =
        combine(board, local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = DccUiState(),
            )

    init {
        refresh(initialDay)
        observeRejections()
        observeSealMoment()
    }

    /** Per-KPI "syncing…" affordance — pending outbox rows for one item. */
    fun pending(itemId: String): Flow<Int> = repository.pendingMutations(itemId)

    fun onIntent(intent: DccIntent) {
        when (intent) {
            is DccIntent.SelectDay -> selectDay(intent.dayKey)
            DccIntent.Refresh -> refresh(local.value.selectedDay)
            DccIntent.DismissLoadError -> local.update { it.copy(loadError = null) }

            is DccIntent.CommitItem -> launchCommit {
                repository.commitEntry(local.value.selectedDay, intent.itemId, intent.status)
            }

            is DccIntent.SaveValue -> launchCommit {
                repository.commitEntry(
                    dayKey = local.value.selectedDay,
                    itemId = intent.itemId,
                    status = intent.status,
                    value = intent.value,
                    note = intent.note,
                )
            }

            is DccIntent.CommitParticipant -> launchCommit {
                repository.commitEntry(
                    dayKey = local.value.selectedDay,
                    itemId = intent.itemId,
                    status = intent.status,
                    subjectId = intent.subjectId,
                )
            }

            is DccIntent.BulkParticipants -> launchCommit {
                repository.commitParticipants(local.value.selectedDay, intent.itemId, intent.status)
            }

            is DccIntent.ToggleParticipant -> local.update { state ->
                state.copy(
                    expandedParticipants = state.expandedParticipants.toggle(intent.itemId),
                )
            }

            is DccIntent.ToggleTray -> local.update { state ->
                state.copy(expandedTrays = state.expandedTrays.toggle(intent.kind))
            }
        }
    }

    // ─── Effects ─────────────────────────────────────────────────────────────

    private fun launchCommit(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }

    private fun selectDay(dayKey: String) {
        if (dayKey == local.value.selectedDay) return
        local.update { it.copy(selectedDay = dayKey, loadError = null) }
        refresh(dayKey)
    }

    private fun refresh(dayKey: String) {
        viewModelScope.launch {
            local.update { it.copy(isRefreshing = true) }
            val result = repository.refresh(dayKey)
            local.update {
                it.copy(isRefreshing = false, loadError = messageFor(result))
            }
        }
    }

    private fun observeRejections() {
        viewModelScope.launch {
            repository.rejections.collect { rejection: MutationRejection ->
                _events.send(
                    DccEvent.Revert(
                        message = rejection.message.ifBlank { "Couldn't save — try again." },
                        isStaleConflict = rejection.isStaleConflict,
                    ),
                )
            }
        }
    }

    /** Fire once when today's board first crosses to 100%. */
    private fun observeSealMoment() {
        viewModelScope.launch {
            uiState
                .map { it.isToday && it.isComplete }
                .distinctUntilChanged()
                .drop(1) // skip the initial value — an already-complete cold load is not "the moment"
                .collect { complete -> if (complete) _events.send(DccEvent.DayComplete) }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(board: DccBoard?, local: LocalState): DccUiState {
        val chips = buildChips(local.selectedDay)

        if (board == null) {
            return if (local.loadError != null && !local.isRefreshing) {
                DccUiState(isLoading = false, loadError = local.loadError, chips = chips, isRefreshing = false)
            } else {
                DccUiState(isLoading = true, chips = chips, isRefreshing = local.isRefreshing)
            }
        }

        val sections = board.sections.map { it.toUi() }.toImmutableList()
        val participants = board.participants.map { it.toUi() }.toImmutableList()
        val trays = board.trays.toUi()
        val empty = sections.isEmpty() && participants.isEmpty() && trays.isEmpty()

        return DccUiState(
            isLoading = false,
            loadError = null,
            isRefreshing = local.isRefreshing,
            title = "Daily compliance",
            ownerName = board.ownerName,
            dateLabel = if (board.isToday) null else dayContext(board.date),
            isToday = board.isToday,
            chips = chips,
            due = board.stats.due,
            filled = board.stats.filled,
            pct = board.stats.pct,
            isComplete = board.stats.isComplete,
            sections = sections,
            participants = participants,
            trays = trays,
            expandedParticipantIds = local.expandedParticipants.toImmutableSet(),
            expandedTrayKinds = local.expandedTrays.toImmutableSet(),
            showEmpty = empty,
        )
    }

    // ─── Mappers ─────────────────────────────────────────────────────────────

    private fun DccItem.toUi(): DccKpiRowUi = DccKpiRowUi(
        id = id,
        title = title,
        meta = metaOf(code, frequency),
        commit = DccStatus.toCommit(status),
        committed = isFilled,
        value = value?.takeIf { it.isNotBlank() },
        note = note?.takeIf { it.isNotBlank() },
    )

    private fun DccSection.toUi(): DccSectionUi {
        val eyebrow = buildString {
            append(section)
            clientName?.takeIf { it.isNotBlank() }?.let { append(" · CLIENT: ").append(it) }
        }
        return DccSectionUi(
            key = key,
            title = eyebrow,
            count = "$filledCount/${items.size}",
            items = items.map { it.toUi() }.toImmutableList(),
        )
    }

    private fun DccParticipantKpi.toUi(): DccParticipantUi = DccParticipantUi(
        id = id,
        title = title,
        meta = metaOf(code, frequency),
        count = "$doneCount/$total",
        fraction = if (total > 0) (doneCount.toFloat() / total).coerceIn(0f, 1f) else 0f,
        subjects = subjects.map { subject ->
            DccParticipantSubjectUi(
                id = subject.id,
                name = subject.name,
                commit = DccStatus.toCommit(subject.status),
                done = subject.status != null,
            )
        }.toImmutableList(),
    )

    private fun DccTrays.toUi(): ImmutableList<DccTrayUi> {
        val out = mutableListOf<DccTrayUi>()
        fun add(kind: String, label: String, items: List<DccItem>) {
            if (items.isEmpty()) return
            out += DccTrayUi(
                kind = kind,
                label = label,
                count = "${items.count { it.isFilled }}/${items.size}",
                items = items.map { it.toUi() }.toImmutableList(),
            )
        }
        add("WEEKLY", "Weekly", weekly)
        add("MONTHLY", "Monthly", monthly)
        add("ADHOC", "Ad-hoc", adhoc)
        return out.toImmutableList()
    }

    private fun metaOf(code: String?, frequency: String?): String? {
        val parts = listOfNotNull(
            code?.takeIf { it.isNotBlank() },
            frequency?.takeIf { it.isNotBlank() },
        )
        return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
    }

    private fun buildChips(selectedDay: String): ImmutableList<DccDayChipUi> {
        val today = LocalDate.now()
        val todayKey = DateFormat.dayKey(today)
        return (WINDOW_DAYS - 1 downTo 0).map { back ->
            val date = today.minusDays(back.toLong())
            val key = DateFormat.dayKey(date)
            DccDayChipUi(
                dayKey = key,
                weekday = date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH),
                dayNum = date.dayOfMonth.toString(),
                isToday = key == todayKey,
                isSelected = key == selectedDay,
            )
        }.toImmutableList()
    }

    private fun dayContext(date: LocalDate): String = DAY_CONTEXT.format(date)

    private fun messageFor(result: com.altuscorp.altus.core.network.ApiResult<*>): String? =
        when (result) {
            is com.altuscorp.altus.core.network.ApiResult.Success -> null
            is com.altuscorp.altus.core.network.ApiResult.ReAuth ->
                "Your session has ended — sign in again to continue."
            is com.altuscorp.altus.core.network.ApiResult.Enrollment ->
                "Your account can't access daily compliance — contact your admin."
            is com.altuscorp.altus.core.network.ApiResult.Gate -> result.gate.message
            is com.altuscorp.altus.core.network.ApiResult.Failure -> when {
                result.isNetwork -> "You're offline — showing the last saved board."
                result.isRateLimited -> "Too many requests — give it a moment, then retry."
                else -> result.message ?: "Couldn't refresh — try again."
            }
        }

    private fun Set<String>.toggle(value: String): Set<String> =
        if (contains(value)) this - value else this + value

    private companion object {
        const val WINDOW_DAYS = 7
        val DAY_CONTEXT: DateTimeFormatter =
            DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
    }
}
