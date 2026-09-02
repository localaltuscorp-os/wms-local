package com.altuscorp.altus.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.altuscorp.altus.core.network.ApiJson
import com.altuscorp.altus.data.remote.dto.CommentRequestDto
import com.altuscorp.altus.data.remote.dto.DccEntryRequestDto
import com.altuscorp.altus.data.remote.dto.DccParticipantsRequestDto
import com.altuscorp.altus.data.remote.dto.StatusChangeRequestDto

/**
 * Which `/api/mobile` write a pending outbox row replays.
 *
 * DELIBERATELY ABSENT: the attendance punch. Punch is geofenced, biometric,
 * anti-proxy and server-timestamped — replaying it minutes later from a
 * different place would either falsify the punch time or open the proxy hole
 * the whole biometric system exists to close (critique P1-2). Punch is
 * ONLINE-ONLY and never enters this table. Task creation is also online-only
 * (it needs the fresh task id back); only the four idempotent-ish daily-loop
 * mutations replay.
 */
enum class MutationKind {
    /** POST /dcc/entry — one KPI slot (tri-state commit / numeric sheet). */
    DCC_ENTRY,

    /** POST /dcc/participants — the roster wave (All Done / All NA / Clear). */
    DCC_PARTICIPANTS,

    /** POST /tasks/{id}/status — optimistic-locked via `expectedUpdatedAt`. */
    TASK_STATUS,

    /** POST /tasks/{id}/comment — the S7 composer. */
    TASK_COMMENT,
}

/**
 * One queued mutation. Repositories apply the change to the Room cache first
 * (the UI commits instantly with the commit-morph), insert a row here, then
 * ask [com.altuscorp.altus.data.sync.SyncScheduler] to flush.
 * [com.altuscorp.altus.data.sync.OutboxWorker] replays rows FIFO with backoff;
 * permanent rejections surface on
 * [com.altuscorp.altus.data.sync.SyncEvents.rejections] so the exact control
 * can revert with the "uh-uh" double-tick.
 *
 * Build rows through the [OutboxEntity] factory functions — they own the
 * payload encoding so the worker's decode can never disagree with the writer.
 */
@Entity(
    tableName = "outbox",
    indices = [Index("kind"), Index("targetId")],
)
data class OutboxEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    /** Which endpoint replays this row. */
    val kind: MutationKind,
    /** Task id (TASK_*) or DCC item id (DCC_*) — the control to revert on failure. */
    val targetId: String,
    /** The full request DTO, [ApiJson]-encoded. */
    val payloadJson: String,
    /** DCC board day (`yyyy-MM-dd`) the mutation belongs to, for cache reconciliation. */
    val dayKey: String? = null,
    /** The optimistic-lock token carried by TASK_STATUS (mirrors the payload). */
    val expectedUpdatedAt: String? = null,
    /** Enqueue wall-clock, epoch millis. */
    val createdAtEpochMs: Long = System.currentTimeMillis(),
    /** Replay attempts so far; the worker dead-letters after its cap. */
    val attemptCount: Int = 0,
    /** Last replay error (debug surface only). */
    val lastError: String? = null,
) {
    companion object {

        /** Queue a single-KPI DCC commit (or clear). */
        fun dccEntry(body: DccEntryRequestDto): OutboxEntity = OutboxEntity(
            kind = MutationKind.DCC_ENTRY,
            targetId = body.itemId,
            payloadJson = ApiJson.encodeToString(DccEntryRequestDto.serializer(), body),
            dayKey = body.date,
        )

        /** Queue a bulk participant-roster set/clear. */
        fun dccParticipants(body: DccParticipantsRequestDto): OutboxEntity = OutboxEntity(
            kind = MutationKind.DCC_PARTICIPANTS,
            targetId = body.itemId,
            payloadJson = ApiJson.encodeToString(DccParticipantsRequestDto.serializer(), body),
            dayKey = body.date,
        )

        /** Queue a task status transition (carries its optimistic-lock token). */
        fun taskStatus(taskId: String, body: StatusChangeRequestDto): OutboxEntity = OutboxEntity(
            kind = MutationKind.TASK_STATUS,
            targetId = taskId,
            payloadJson = ApiJson.encodeToString(StatusChangeRequestDto.serializer(), body),
            expectedUpdatedAt = body.expectedUpdatedAt,
        )

        /** Queue a task comment. */
        fun taskComment(taskId: String, body: CommentRequestDto): OutboxEntity = OutboxEntity(
            kind = MutationKind.TASK_COMMENT,
            targetId = taskId,
            payloadJson = ApiJson.encodeToString(CommentRequestDto.serializer(), body),
        )
    }
}
