package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.di.ApplicationScope
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.local.dao.OutboxDao
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.local.entity.MutationKind
import com.altuscorp.altus.data.local.entity.OutboxEntity
import com.altuscorp.altus.data.remote.dto.DccDto
import com.altuscorp.altus.data.remote.dto.DccEntryRequestDto
import com.altuscorp.altus.data.remote.dto.DccItemDto
import com.altuscorp.altus.data.remote.dto.DccParticipantsRequestDto
import com.altuscorp.altus.data.supabase.SupabaseRealtime
import com.altuscorp.altus.data.sync.MutationRejection
import com.altuscorp.altus.data.sync.SyncEvents
import com.altuscorp.altus.data.sync.SyncScheduler
import com.altuscorp.altus.domain.model.DccBoard
import com.altuscorp.altus.domain.model.toDomain
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * The S5 fill board: cache-first read per day + the two optimistic outbox
 * commits that feed the compliance ring. Every commit patches the day's
 * snapshot in place (item state AND stats — the pinned ring sweeps from the
 * same emission that flips the row), enqueues, and requests a sync. A
 * permanent refusal surfaces on [rejections] AFTER the day's board has been
 * re-fetched here, so the exact control has already reverted when the screen
 * fires the "uh-uh" + Retry snackbar. The board never blocks.
 */
interface DccRepository {

    /** Live decoded board for one `yyyy-MM-dd` day; null on a cold cache. */
    fun board(dayKey: String = DateFormat.todayKey()): Flow<DccBoard?>

    /** Fetch one day from the network, upsert its snapshot. */
    suspend fun refresh(dayKey: String = DateFormat.todayKey()): ApiResult<DccBoard>

    /**
     * Fill (or clear — all-null status/value/note) ONE KPI slot, optimistically.
     * [subjectId] targets one participant's row on a participant-list KPI.
     */
    suspend fun commitEntry(
        dayKey: String,
        itemId: String,
        status: String?,
        value: String? = null,
        note: String? = null,
        subjectId: String? = null,
    )

    /** The roster wave: set (or clear with null) every participant at once. */
    suspend fun commitParticipants(dayKey: String, itemId: String, status: String?)

    /** Per-KPI "syncing…" affordance — pending outbox rows for this item. */
    fun pendingMutations(itemId: String): Flow<Int>

    /** DCC-kind rejections; the board is already reverted when these arrive. */
    val rejections: Flow<MutationRejection>
}

class DccRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
    private val outboxDao: OutboxDao,
    private val syncScheduler: SyncScheduler,
    private val syncEvents: SyncEvents,
    private val realtime: SupabaseRealtime,
    @ApplicationScope private val appScope: CoroutineScope,
) : DccRepository {

    init {
        revertOnRejections()
        observeRealtimeDeltas()
    }

    override fun board(dayKey: String): Flow<DccBoard?> =
        cache.observe(CacheKeys.dcc(dayKey), DccDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(dayKey: String): ApiResult<DccBoard> {
        val result = safeApiCall { api.dcc(date = dayKey) }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.dcc(dayKey), DccDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override suspend fun commitEntry(
        dayKey: String,
        itemId: String,
        status: String?,
        value: String?,
        note: String?,
        subjectId: String?,
    ) {
        val body = DccEntryRequestDto(
            itemId = itemId,
            date = dayKey,
            status = status,
            value = value,
            note = note,
            subjectId = subjectId,
        )
        cache.mutate(CacheKeys.dcc(dayKey), DccDto.serializer()) { it.applyEntry(body) }
        outboxDao.insert(OutboxEntity.dccEntry(body))
        syncScheduler.requestSync()
    }

    override suspend fun commitParticipants(dayKey: String, itemId: String, status: String?) {
        val body = DccParticipantsRequestDto(itemId = itemId, date = dayKey, status = status)
        cache.mutate(CacheKeys.dcc(dayKey), DccDto.serializer()) { it.applyParticipants(body) }
        outboxDao.insert(OutboxEntity.dccParticipants(body))
        syncScheduler.requestSync()
    }

    override fun pendingMutations(itemId: String): Flow<Int> =
        outboxDao.observePendingCountFor(itemId)

    override val rejections: Flow<MutationRejection> =
        syncEvents.rejections.filter { it.kind.isDccKind }

    /** Revert = silent re-fetch of the rejected mutation's day (P1-5 contract). */
    private fun revertOnRejections() {
        appScope.launch {
            syncEvents.rejections
                .filter { it.kind.isDccKind }
                .collect { rejection ->
                    val dayKey = rejection.dayKey ?: DateFormat.todayKey()
                    Timber.d("Reverting DCC %s on %s after rejection", rejection.targetId, dayKey)
                    refresh(dayKey)
                }
        }
    }

    /**
     * Today's entry deltas (a manager filling on the web sweeps this phone's
     * ring live). Silent-empty until the `dcc_entries` RLS SELECT policy ships
     * ([SupabaseRealtime] gates it) — REST polling stays the truth.
     */
    private fun observeRealtimeDeltas() {
        appScope.launch {
            realtime.dccChanges()
                .catch { Timber.w(it, "DCC realtime stream failed — polling remains truth") }
                .collect { refresh(DateFormat.todayKey()) }
        }
    }
}

private val MutationKind.isDccKind: Boolean
    get() = this == MutationKind.DCC_ENTRY || this == MutationKind.DCC_PARTICIPANTS

/**
 * Optimistic single-slot patch. Section/tray items flip in place; the daily
 * stats are DELTA-adjusted from the sections (the server's `due` counts the
 * daily due-set) so the pinned ring sweeps by exactly what changed — the
 * server baseline it rode in on stays authoritative.
 */
private fun DccDto.applyEntry(body: DccEntryRequestDto): DccDto {
    if (body.subjectId != null) {
        return copy(
            participants = participants.map { kpi ->
                if (kpi.id != body.itemId) {
                    kpi
                } else {
                    val subjects = kpi.subjects.map { subject ->
                        if (subject.id == body.subjectId) subject.copy(status = body.status) else subject
                    }
                    kpi.copy(subjects = subjects, doneCount = subjects.count { it.status != null })
                }
            },
        )
    }

    fun patch(items: List<DccItemDto>): List<DccItemDto> = items.map { item ->
        if (item.id == body.itemId) {
            item.copy(status = body.status, value = body.value, note = body.note)
        } else {
            item
        }
    }

    val oldFilled = sections.sumOf { section -> section.items.count { it.status != null } }
    val patchedSections = sections.map { it.copy(items = patch(it.items)) }
    val newFilled = patchedSections.sumOf { section -> section.items.count { it.status != null } }
    val filled = (stats.filled + (newFilled - oldFilled)).coerceAtLeast(0)
    val patchedStats = stats.copy(
        filled = filled,
        pct = if (stats.due > 0) (filled * 100 / stats.due).coerceIn(0, 100) else stats.pct,
    )

    return copy(
        sections = patchedSections,
        trays = trays.copy(
            weekly = patch(trays.weekly),
            monthly = patch(trays.monthly),
            adhoc = patch(trays.adhoc),
        ),
        stats = patchedStats,
    )
}

/** Optimistic roster wave: every subject takes the same status at once. */
private fun DccDto.applyParticipants(body: DccParticipantsRequestDto): DccDto = copy(
    participants = participants.map { kpi ->
        if (kpi.id != body.itemId) {
            kpi
        } else {
            val subjects = kpi.subjects.map { it.copy(status = body.status) }
            kpi.copy(subjects = subjects, doneCount = subjects.count { it.status != null })
        }
    },
)
