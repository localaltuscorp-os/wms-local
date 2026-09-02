package com.altuscorp.altus.feature.gate

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.repository.DccRepository
import com.altuscorp.altus.data.repository.PlanRepository
import com.altuscorp.altus.data.sync.MutationRejection
import com.altuscorp.altus.domain.model.DayPlan
import com.altuscorp.altus.domain.model.DccBoard
import com.altuscorp.altus.domain.model.DccItem
import com.altuscorp.altus.domain.model.DccParticipantKpi
import com.altuscorp.altus.domain.model.DccSection
import com.altuscorp.altus.domain.model.DccTrays
import com.altuscorp.altus.domain.model.PlannerGoal
import com.altuscorp.altus.feature.dcc.DccKpiRowUi
import com.altuscorp.altus.feature.dcc.DccParticipantSubjectUi
import com.altuscorp.altus.feature.dcc.DccParticipantUi
import com.altuscorp.altus.feature.dcc.DccSectionUi
import com.altuscorp.altus.feature.dcc.DccStatus
import com.altuscorp.altus.feature.dcc.DccTrayUi
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.persistentSetOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.collections.immutable.toImmutableSet
import kotlinx.collections.immutable.toPersistentSet
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Simple kill-switch mirroring the web layout's `DCC_GATE_OFF` / gate-skip: when
 * false the whole daily wall is disabled and the screen enters straight through.
 * (A build-time constant keeps this load-neutral — no extra network read.)
 */
const val DAILY_GATE_ENABLED: Boolean = true

/**
 * THE UNIFIED DAILY GATE brain — the mobile rendition of the web layout's gate
 * chain (`app/(app)/layout.tsx`: `needsDailyPlan` → DCC `dccGateTarget`). It
 * COMPOSES the two existing repositories rather than owning any fetch logic:
 * [PlanRepository] feeds the "plan your day" half (clears `needsDailyPlan` +
 * `needsGoalActuals`) and [DccRepository] feeds the "daily compliance" half
 * (clears `dccGateTarget`). One @Immutable [DailyGateUiState] is reduced from
 * both cache-first flows plus local view state, so a single scroll can present
 * both halves and a single "I'm done — enter" that only unlocks when BOTH are
 * satisfied.
 *
 * FAIL-OPEN is the law (matching every `.catch(() => false)` in the web chain):
 *   • the [DAILY_GATE_ENABLED] kill-switch off → [DailyGateUiState.bypass].
 *   • a sub-gate whose data can't load on a cold cache is treated as SATISFIED
 *     (`planColdFailed` / `dccColdFailed`) — a DB/network hiccup never traps.
 *   • both halves cold-failed → [DailyGateUiState.bypass] (nothing to show,
 *     never lock the user out).
 *
 * Every commit is optimistic through the same outboxes the full Plan/DCC boards
 * use, so filling here advances the exact same cached state and the enter action
 * unlocks on the same frame the last slot flips.
 */
@HiltViewModel
class DailyGateViewModel @Inject constructor(
    private val planRepository: PlanRepository,
    private val dccRepository: DccRepository,
) : ViewModel() {

    /** The gate is a one-shot morning surface — pin it to today for its lifetime. */
    private val today: String = DateFormat.todayKey()

    private data class LocalState(
        val planLoadError: String? = null,
        val dccLoadError: String? = null,
        val draftTitle: String = "",
        val addingPersonal: Boolean = false,
        val pendingKeys: ImmutableSet<String> = persistentSetOf(),
        val actuals: ActualsDraft? = null,
        val expandedParticipants: Set<String> = emptySet(),
        val expandedTrays: Set<String> = emptySet(),
        val message: String? = null,
    )

    private val local = MutableStateFlow(LocalState())

    private val _effects = Channel<GateEffect>(Channel.BUFFERED)
    val effects: Flow<GateEffect> = _effects.receiveAsFlow()

    val uiState: StateFlow<DailyGateUiState> =
        combine(planRepository.plan(), dccRepository.board(today), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = DailyGateUiState(),
            )

    /** Per-KPI "syncing…" affordance — pending outbox rows for one DCC item. */
    fun pending(itemId: String): Flow<Int> = dccRepository.pendingMutations(itemId)

    init {
        refreshPlan()
        refreshDcc()
        observeDccRejections()
    }

    fun onIntent(intent: GateIntent) {
        when (intent) {
            GateIntent.RetryPlan -> refreshPlan()
            GateIntent.RetryDcc -> refreshDcc()
            GateIntent.MessageShown -> local.update { it.copy(message = null) }

            // ── Plan half ──────────────────────────────────────────────────────
            is GateIntent.DraftTitleChanged -> local.update { it.copy(draftTitle = intent.value) }
            GateIntent.AddPersonal -> addPersonal()
            is GateIntent.PullTask -> mutate(PendingKeys.task(intent.taskId)) { planRepository.pullTask(intent.taskId) }
            is GateIntent.PullGoal -> mutate(PendingKeys.goal(intent.goalId)) { planRepository.pullGoal(intent.goalId) }

            is GateIntent.OpenActuals -> openActuals(intent.goal)
            GateIntent.DismissActuals -> local.update { it.copy(actuals = null) }
            is GateIntent.ActualPctChanged -> local.update { s ->
                val draft = s.actuals ?: return@update s
                s.copy(actuals = draft.copy(pct = snapToDetent(intent.pct)))
            }
            is GateIntent.ActualNoteChanged -> local.update { s ->
                val draft = s.actuals ?: return@update s
                s.copy(actuals = draft.copy(note = intent.note))
            }
            GateIntent.SubmitActual -> submitActual()

            // ── DCC half ───────────────────────────────────────────────────────
            is GateIntent.CommitItem -> commitEntry(intent.itemId, intent.status)
            is GateIntent.CommitParticipant ->
                commitEntry(intent.itemId, intent.status, subjectId = intent.subjectId)
            is GateIntent.BulkParticipants ->
                viewModelScope.launch { dccRepository.commitParticipants(today, intent.itemId, intent.status) }
            is GateIntent.ToggleParticipant -> local.update { it.copy(expandedParticipants = it.expandedParticipants.toggle(intent.itemId)) }
            is GateIntent.ToggleTray -> local.update { it.copy(expandedTrays = it.expandedTrays.toggle(intent.kind)) }
        }
    }

    // ── Refreshers (fail-open on cold cache) ─────────────────────────────────

    private fun refreshPlan() {
        viewModelScope.launch {
            local.update { it.copy(planLoadError = null) }
            when (val result = planRepository.refresh()) {
                is ApiResult.Success -> Unit // the cache flow repaints
                else -> local.update { it.copy(planLoadError = messageFor(result)) }
            }
        }
    }

    private fun refreshDcc() {
        viewModelScope.launch {
            local.update { it.copy(dccLoadError = null) }
            when (val result = dccRepository.refresh(today)) {
                is ApiResult.Success -> Unit
                else -> local.update { it.copy(dccLoadError = messageFor(result)) }
            }
        }
    }

    // ── Plan commits (online-only, optimistic at the fingertip) ──────────────

    private fun addPersonal() {
        val title = local.value.draftTitle.trim()
        if (title.isEmpty() || local.value.addingPersonal) return
        local.update { it.copy(addingPersonal = true) }
        viewModelScope.launch {
            val result = planRepository.addPersonalItem(title)
            local.update { it.copy(addingPersonal = false) }
            if (result is ApiResult.Success) {
                local.update { it.copy(draftTitle = "") }
            } else {
                reject(result)
            }
        }
    }

    private fun mutate(key: String, call: suspend () -> ApiResult<*>) {
        if (key in local.value.pendingKeys) return
        local.update { it.copy(pendingKeys = it.pendingKeys.toPersistentSet().add(key)) }
        viewModelScope.launch {
            val result = call()
            local.update { it.copy(pendingKeys = it.pendingKeys.toPersistentSet().remove(key)) }
            if (result !is ApiResult.Success) reject(result)
        }
    }

    private fun openActuals(goal: PlannerGoal) {
        local.update {
            it.copy(
                actuals = ActualsDraft(
                    goal = goal,
                    pct = snapToDetent(goal.pctDone),
                    note = goal.todayNote.orEmpty(),
                ),
            )
        }
    }

    private fun submitActual() {
        val draft = local.value.actuals
        if (draft == null || draft.submitting) return
        local.update { it.copy(actuals = draft.copy(submitting = true)) }
        viewModelScope.launch {
            val result = planRepository.logGoalActual(
                goalId = draft.goal.id,
                pctDone = draft.pct,
                note = draft.note.trim().ifEmpty { null },
            )
            if (result is ApiResult.Success) {
                local.update { it.copy(actuals = null) }
                _effects.send(GateEffect.ActualsSaved)
            } else {
                local.update { s -> s.copy(actuals = s.actuals?.copy(submitting = false)) }
                reject(result)
            }
        }
    }

    // ── DCC commits (optimistic through the outbox) ──────────────────────────

    private fun commitEntry(itemId: String, status: String?, subjectId: String? = null) {
        viewModelScope.launch { dccRepository.commitEntry(today, itemId, status, subjectId = subjectId) }
    }

    private fun observeDccRejections() {
        viewModelScope.launch {
            dccRepository.rejections.collect { rejection: MutationRejection ->
                local.update { it.copy(message = rejection.message.ifBlank { "Couldn't save — try again." }) }
                _effects.send(GateEffect.Reject)
            }
        }
    }

    private fun reject(result: ApiResult<*>) {
        local.update { it.copy(message = messageFor(result)) }
        viewModelScope.launch { _effects.send(GateEffect.Reject) }
    }

    // ── Reducer ───────────────────────────────────────────────────────────────

    private fun reduce(plan: DayPlan?, board: DccBoard?, local: LocalState): DailyGateUiState {
        val planColdFailed = plan == null && local.planLoadError != null
        val dccColdFailed = board == null && local.dccLoadError != null
        val isLoading =
            plan == null && board == null && local.planLoadError == null && local.dccLoadError == null

        // FAIL-OPEN: a half we can't determine is treated as satisfied.
        // The gate needs the day PLANNED (>= min commitments) + DCC filled — it
        // does NOT force logging progress on every weekly goal (that friction
        // belongs to clock-in, not the entry wall). Goal actuals stay loggable
        // but never block entering the app.
        val planSatisfied = planColdFailed || (plan != null && plan.satisfied)
        val dccSatisfied = dccColdFailed ||
            (board != null && (board.stats.due == 0 || board.stats.filled >= board.stats.due))

        val bypass = !DAILY_GATE_ENABLED || (planColdFailed && dccColdFailed)

        val sections = board?.sections?.map { it.toUi() }?.toImmutableList() ?: persistentListOf()
        val participants = board?.participants?.map { it.toUi() }?.toImmutableList() ?: persistentListOf()
        val trays = board?.trays?.toUi() ?: persistentListOf()
        val dccShowEmpty = board != null && sections.isEmpty() && participants.isEmpty() && trays.isEmpty()

        return DailyGateUiState(
            isLoading = isLoading,
            bypass = bypass,
            planSatisfied = planSatisfied,
            dccSatisfied = dccSatisfied,
            plan = plan,
            planColdFailed = planColdFailed,
            dccColdFailed = dccColdFailed,
            planLoadError = local.planLoadError,
            dccLoadError = local.dccLoadError,
            ownerName = board?.ownerName.orEmpty(),
            dccDue = board?.stats?.due ?: 0,
            dccFilled = board?.stats?.filled ?: 0,
            dccPct = board?.stats?.pct ?: 0,
            dccComplete = board?.stats?.isComplete ?: false,
            sections = sections,
            participants = participants,
            trays = trays,
            dccShowEmpty = dccShowEmpty,
            expandedParticipantIds = local.expandedParticipants.toImmutableSet(),
            expandedTrayKinds = local.expandedTrays.toImmutableSet(),
            draftTitle = local.draftTitle,
            addingPersonal = local.addingPersonal,
            pendingKeys = local.pendingKeys,
            actuals = local.actuals,
            message = local.message,
        )
    }

    // ── DCC domain → render-ready UI (mirrors DccViewModel's private mappers) ─

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

    private fun metaOf(code: String?, frequency: String?): String? =
        listOfNotNull(code?.takeIf { it.isNotBlank() }, frequency?.takeIf { it.isNotBlank() })
            .takeIf { it.isNotEmpty() }?.joinToString(" · ")

    private fun Set<String>.toggle(value: String): Set<String> =
        if (contains(value)) this - value else this + value

    private fun messageFor(result: ApiResult<*>): String = when (result) {
        is ApiResult.ReAuth -> "Your session ended — sign in again to continue."
        is ApiResult.Enrollment -> "Your account can't open the daily gate right now."
        is ApiResult.Gate -> result.gate.message
        is ApiResult.Failure -> when {
            result.isNetwork -> "You're offline — showing the last saved state."
            result.isRateLimited -> "Too many requests — give it a moment, then retry."
            else -> result.message ?: "Couldn't load — try again."
        }
        is ApiResult.Success -> "Couldn't load — try again."
    }
}

/** 5% detents — the goal-actuals slider snaps, matching the Plan board (S4). */
private fun snapToDetent(pct: Int): Int = (((pct + 2) / 5) * 5).coerceIn(0, 100)

/** Stable pending-mutation keys shared by ViewModel and the pull chips. */
internal object PendingKeys {
    fun task(taskId: String): String = "task-$taskId"
    fun goal(goalId: String): String = "goal-$goalId"
}
