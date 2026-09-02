package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.di.ApplicationScope
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.dao.OutboxDao
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.local.entity.MutationKind
import com.altuscorp.altus.data.local.entity.OutboxEntity
import com.altuscorp.altus.data.prefs.AltusPreferences
import com.altuscorp.altus.data.remote.dto.CommentRequestDto
import com.altuscorp.altus.data.remote.dto.CreateTaskRequestDto
import com.altuscorp.altus.data.remote.dto.StatusChangeRequestDto
import com.altuscorp.altus.data.remote.dto.TaskDetailResponseDto
import com.altuscorp.altus.data.remote.dto.TaskFormDto
import com.altuscorp.altus.data.remote.dto.TaskListResponseDto
import com.altuscorp.altus.data.remote.dto.TimelineEventDto
import com.altuscorp.altus.data.supabase.SupabaseRealtime
import com.altuscorp.altus.data.sync.MutationRejection
import com.altuscorp.altus.data.sync.SyncEvents
import com.altuscorp.altus.data.sync.SyncScheduler
import com.altuscorp.altus.domain.model.TaskBoard
import com.altuscorp.altus.domain.model.TaskDetail
import com.altuscorp.altus.domain.model.TaskFormOptions
import com.altuscorp.altus.domain.model.toDomain
import java.time.Instant
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
 * A validated New Task form (S6) ready to POST. Task creation is ONLINE-ONLY —
 * the screen needs the fresh task id back, so it never rides the outbox.
 */
data class NewTaskDraft(
    val title: String,
    val doerId: String,
    val initiatorId: String? = null,
    val priority: String,
    /** The chosen due instant (ISO on the wire). */
    val dueAt: Instant,
    val subject: String? = null,
    val description: String? = null,
)

/**
 * Task list / detail / create + the two optimistic outbox mutations (status
 * with its `expectedUpdatedAt` lock token, comments). The commit grammar:
 * patch the cache first (the pill morphs instantly), enqueue, requestSync;
 * a permanent server refusal comes back on [rejections] and the caches are
 * silently re-fetched — the exact control reverts, the screen fires the
 * "uh-uh" + snackbar (shake + silent refresh for the `stale` conflict).
 */
interface TaskRepository {

    /** Live decoded task list + server statusDisplay; null on cold cache. */
    fun board(): Flow<TaskBoard?>

    suspend fun refreshBoard(): ApiResult<TaskBoard>

    /** Live decoded detail snapshot for one task; null until first fetch. */
    fun detail(taskId: String): Flow<TaskDetail?>

    suspend fun refreshDetail(taskId: String): ApiResult<TaskDetail>

    /**
     * Optimistic status transition. [expectedUpdatedAt] is the lock token the
     * client last saw ([TaskDetail.updatedAt] / [Task.updatedAt]); a mismatch
     * dead-letters as a `stale` rejection.
     */
    suspend fun changeStatus(
        taskId: String,
        newStatus: String,
        expectedUpdatedAt: Instant,
        note: String? = null,
    )

    /** Optimistic comment — appears in the timeline immediately (60% → solid). */
    suspend fun addComment(taskId: String, body: String)

    /** ONLINE-ONLY create; returns the new task id. */
    suspend fun createTask(draft: NewTaskDraft): ApiResult<String>

    /** New-task pick-lists (cached so the form opens instantly). */
    fun formOptions(): Flow<TaskFormOptions?>

    suspend fun refreshFormOptions(): ApiResult<TaskFormOptions>

    /** Per-task "syncing…" affordance — pending outbox rows for this task. */
    fun pendingMutations(taskId: String): Flow<Int>

    /**
     * Task-kind rejections only. By the time a screen receives one, the cache
     * has already been reverted here — the collector just fires haptics/copy.
     */
    val rejections: Flow<MutationRejection>
}

class TaskRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
    private val outboxDao: OutboxDao,
    private val syncScheduler: SyncScheduler,
    private val syncEvents: SyncEvents,
    private val preferences: AltusPreferences,
    private val realtime: SupabaseRealtime,
    @ApplicationScope private val appScope: CoroutineScope,
) : TaskRepository {

    init {
        revertOnRejections()
        observeRealtimeDeltas()
    }

    override fun board(): Flow<TaskBoard?> =
        cache.observe(CacheKeys.TASK_LIST, TaskListResponseDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refreshBoard(): ApiResult<TaskBoard> {
        val result = safeApiCall { api.tasks() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.TASK_LIST, TaskListResponseDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override fun detail(taskId: String): Flow<TaskDetail?> =
        cache.observe(CacheKeys.taskDetail(taskId), TaskDetailResponseDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refreshDetail(taskId: String): ApiResult<TaskDetail> {
        val result = safeApiCall { api.taskDetail(taskId) }
        when {
            result is ApiResult.Success ->
                cache.write(CacheKeys.taskDetail(taskId), TaskDetailResponseDto.serializer(), result.data)

            // Reassigned away / deleted: drop the stale snapshot so a deep link
            // to a task the user can no longer see doesn't paint a ghost.
            result is ApiResult.Failure && (result.httpCode == 403 || result.httpCode == 404) ->
                cache.delete(CacheKeys.taskDetail(taskId))
        }
        return result.map { it.toDomain() }
    }

    override suspend fun changeStatus(
        taskId: String,
        newStatus: String,
        expectedUpdatedAt: Instant,
        note: String?,
    ) {
        val actorName = preferences.currentIdentity()?.name
        cache.mutate(CacheKeys.TASK_LIST, TaskListResponseDto.serializer()) {
            it.applyStatus(taskId, newStatus)
        }
        cache.mutate(CacheKeys.taskDetail(taskId), TaskDetailResponseDto.serializer()) {
            it.applyStatus(newStatus, note, actorName)
        }
        outboxDao.insert(
            OutboxEntity.taskStatus(
                taskId = taskId,
                body = StatusChangeRequestDto(
                    status = newStatus,
                    expectedUpdatedAt = expectedUpdatedAt.toString(),
                    note = note,
                ),
            ),
        )
        syncScheduler.requestSync()
    }

    override suspend fun addComment(taskId: String, body: String) {
        val actorName = preferences.currentIdentity()?.name
        cache.mutate(CacheKeys.taskDetail(taskId), TaskDetailResponseDto.serializer()) {
            it.applyComment(body, actorName)
        }
        outboxDao.insert(OutboxEntity.taskComment(taskId, CommentRequestDto(body = body)))
        syncScheduler.requestSync()
    }

    override suspend fun createTask(draft: NewTaskDraft): ApiResult<String> {
        val result = safeApiCall {
            api.createTask(
                CreateTaskRequestDto(
                    title = draft.title,
                    doerId = draft.doerId,
                    initiatorId = draft.initiatorId,
                    priority = draft.priority,
                    dueAt = draft.dueAt.toString(),
                    subject = draft.subject,
                    description = draft.description,
                ),
            )
        }
        return when (result) {
            is ApiResult.Success -> {
                val id = result.data.id
                appScope.launch { refreshBoard() }
                if (id != null) {
                    ApiResult.Success(id)
                } else {
                    ApiResult.Failure(message = "The task was created but couldn't be opened — pull to refresh.")
                }
            }

            is ApiResult.ReAuth -> result
            is ApiResult.Enrollment -> result
            is ApiResult.Gate -> result
            is ApiResult.Failure -> result
        }
    }

    override fun formOptions(): Flow<TaskFormOptions?> =
        cache.observe(CacheKeys.TASK_FORM, TaskFormDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refreshFormOptions(): ApiResult<TaskFormOptions> {
        val result = safeApiCall { api.taskForm() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.TASK_FORM, TaskFormDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override fun pendingMutations(taskId: String): Flow<Int> =
        outboxDao.observePendingCountFor(taskId)

    override val rejections: Flow<MutationRejection> =
        syncEvents.rejections.filter { it.kind.isTaskKind }

    /**
     * The revert half of the P1-5 ordering contract: the WORKER dead-letters
     * and emits; THIS collector restores server truth in the cache; the screen
     * (collecting [rejections]) only narrates. One writer, one narrator.
     */
    private fun revertOnRejections() {
        appScope.launch {
            syncEvents.rejections
                .filter { it.kind.isTaskKind }
                .collect { rejection ->
                    Timber.d("Reverting task %s after %s rejection", rejection.targetId, rejection.kind)
                    // Only refetch the detail when a snapshot exists — a cold
                    // detail cache needs no revert.
                    refreshBoard()
                    val hasDetail =
                        cache.read(CacheKeys.taskDetail(rejection.targetId), TaskDetailResponseDto.serializer()) != null
                    if (hasDetail) refreshDetail(rejection.targetId)
                }
        }
    }

    /**
     * Realtime deltas — DISABLED until the tasks RLS SELECT policy is scoped
     * per-user ([SupabaseRealtime] gates it; the current `using(true)` policy
     * would stream every task in the company — P0-1). Poll + refetch-on-resume
     * carry the live feel until then.
     */
    private fun observeRealtimeDeltas() {
        appScope.launch {
            realtime.taskChanges()
                .catch { Timber.w(it, "Task realtime stream failed — polling remains truth") }
                .collect { refreshBoard() }
        }
    }
}

private val MutationKind.isTaskKind: Boolean
    get() = this == MutationKind.TASK_STATUS || this == MutationKind.TASK_COMMENT

/** Patch one row's status in place; the server refresh restores everything else. */
private fun TaskListResponseDto.applyStatus(taskId: String, status: String): TaskListResponseDto =
    copy(tasks = tasks.map { if (it.id == taskId) it.copy(status = status) else it })

/** Patch the detail status + append an optimistic timeline node. */
private fun TaskDetailResponseDto.applyStatus(
    status: String,
    note: String?,
    actorName: String?,
): TaskDetailResponseDto = copy(
    task = task.copy(status = status),
    timeline = timeline + TimelineEventDto(
        id = "local-status-${System.currentTimeMillis()}",
        actorName = actorName,
        eventType = "status_changed",
        note = note,
        fromValue = task.status,
        toValue = status,
        createdAt = Instant.now().toString(),
    ),
)

/** Append an optimistic comment node (the composer's 60%-opacity send). */
private fun TaskDetailResponseDto.applyComment(
    body: String,
    actorName: String?,
): TaskDetailResponseDto = copy(
    timeline = timeline + TimelineEventDto(
        id = "local-comment-${System.currentTimeMillis()}",
        actorName = actorName,
        eventType = "comment",
        note = body,
        createdAt = Instant.now().toString(),
    ),
)
