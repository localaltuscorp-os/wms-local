package com.altuscorp.altus.feature.tasks.detail

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.domain.model.TaskDetail

/**
 * S7 Task Detail — one immutable state, one sealed intent, one sealed effect
 * (Part 6 contract).
 *
 * The [detail] snapshot is cache-first: `null` means a cold cache, which the
 * screen paints as a skeleton in the exact resolved geometry (Signature 8) —
 * unless the cold load already failed ([loadFailed]) or the task is gone
 * ([notFound]), which get designed states, not endless shimmer.
 */
@Immutable
data class TaskDetailUiState(
    /** Live decoded snapshot; null until the cache warms. */
    val detail: TaskDetail? = null,
    /** A network reconcile is in flight (cheap top-bar affordance only). */
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → designed retry state. */
    val loadFailed: Boolean = false,
    /** 403/404 — reassigned away or deleted; the repo dropped the snapshot. */
    val notFound: Boolean = false,
    /** Pending outbox rows for THIS task — the honest "Syncing…" affordance. */
    val pendingMutations: Int = 0,
    /** Docked composer draft. */
    val composerText: String = "",
    /** Non-primary transition awaiting its note in the status sheet, or null. */
    val statusSheetFor: String? = null,
) {
    /** Skeleton only while the cold cache still has a chance of resolving. */
    val showSkeleton: Boolean get() = detail == null && !loadFailed && !notFound

    val canSend: Boolean get() = composerText.isNotBlank() && detail?.canComment == true
}

/** Everything the screen can ask for. */
sealed interface TaskDetailIntent {
    /** Pull the server truth again (retry state / manual refresh). */
    data object Refresh : TaskDetailIntent

    /**
     * Commit a status transition optimistically. [note] rides the outbox body;
     * the pill morphs before the network is even asked (Signature 2).
     */
    data class CommitStatus(val status: String, val note: String? = null) : TaskDetailIntent

    /** A ghost transition chip was tapped — open the note-and-save sheet. */
    data class OpenStatusSheet(val status: String) : TaskDetailIntent

    data object DismissStatusSheet : TaskDetailIntent

    data class ComposerChanged(val text: String) : TaskDetailIntent

    /** Optimistic send: the comment lands in the timeline at 60% opacity. */
    data object SendComment : TaskDetailIntent
}

/**
 * One-shot effects (never state): the optimistic-lock conflict shake and the
 * plain rejection snackbar. By the time either arrives, [TaskDetailViewModel]'s
 * repository has ALREADY reverted the cache — the screen only narrates
 * (haptic + shake + copy), it never re-writes data (P1-5 ordering contract).
 */
sealed interface TaskDetailEffect {
    /**
     * 409 `stale` — the task changed under us. Pill shakes 4dp twice, "uh-uh"
     * double-tick, snackbar "Task changed elsewhere — refreshed". Never a
     * modal apology.
     */
    data object ConflictShake : TaskDetailEffect

    /** Any other permanent refusal — "uh-uh" + the server's copy. */
    data class MutationRejected(val message: String) : TaskDetailEffect
}
