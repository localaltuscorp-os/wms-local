package com.altuscorp.altus.ui.designsystem

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList

/**
 * THE DAY RING MODEL (Part 2): an @Immutable render of the server's 409 gate
 * machine, clockwise — Plan → Clock in → Tasks due today → DCC → Clock out.
 *
 * DayRepository assembles exactly one of these from /dashboard + /attendance +
 * /dcc; the SAME state object draws the 96dp Today hero, the 28dp Day Strip
 * mini-ring, and the punch stamp — a single source of truth for what the day
 * still wants.
 */

/** The five gates, in clockwise ring order. */
enum class DaySegmentKind(val title: String) {
    Plan("Plan"),
    ClockIn("Clock in"),
    TasksDue("Tasks"),
    Dcc("DCC"),
    ClockOut("Clock out"),
}

/**
 * Per-segment render state (Part 2): pending = hairline track ·
 * in-progress = primary partial sweep · done = solid primary ·
 * blocked-gate = warn track.
 */
enum class DaySegmentState { Pending, InProgress, Done, Blocked }

@Immutable
data class DayRingSegment(
    val kind: DaySegmentKind,
    val state: DaySegmentState,
    /** 0..1 proportional fill for counted segments (DCC 3/11, tasks 2/6). */
    val fraction: Float = 0f,
    /** Mono counter for strip/gate copy ("2/5", "3/11"); null when binary. */
    val counter: String? = null,
) {
    /** What the ring actually sweeps: Done is always full, Pending empty. */
    val sweepFraction: Float
        get() = when (state) {
            DaySegmentState.Done -> 1f
            DaySegmentState.Pending -> 0f
            else -> fraction.coerceIn(0f, 1f)
        }

    val isDone: Boolean get() = state == DaySegmentState.Done
}

@Immutable
data class DayRingState(
    val plan: DayRingSegment,
    val clockIn: DayRingSegment,
    val tasks: DayRingSegment,
    val dcc: DayRingSegment,
    val clockOut: DayRingSegment,
    /**
     * Single next-blocker line for the Day Strip, assembled by DayRepository
     * ("Plan 2/5 · then clock in", "DCC 3/11 → Fill").
     */
    val nextStepCopy: String = "",
    /** `altus://` route the FIX chevron opens; null when nothing blocks. */
    val fixRoute: String? = null,
    /**
     * True once today's Day Seal has been shown (persisted by the caller) —
     * the seal fires ONCE PER DAY, EVER.
     */
    val sealShownToday: Boolean = false,
) {
    /** Clockwise draw order. */
    val segments: ImmutableList<DayRingSegment>
        get() = persistentListOf(plan, clockIn, tasks, dcc, clockOut)

    /** All five gates closed — the whole ring strokes success. */
    val isComplete: Boolean get() = segments.all { it.isDone }

    /** Any gate currently blocking (renders its segment in warn). */
    val hasBlockedGate: Boolean get() = segments.any { it.state == DaySegmentState.Blocked }

    /** The single next thing the day wants; null when the day is sealed. */
    val nextBlocker: DayRingSegment? get() = segments.firstOrNull { !it.isDone }

    /** 0–100 across the five equal segments — the hero's mono readout. */
    val percent: Int
        get() = (segments.sumOf { it.sweepFraction.toDouble() } / segments.size * 100)
            .toInt()
            .coerceIn(0, 100)

    /** The seal should play now: complete, and not yet shown today. */
    val sealPending: Boolean get() = isComplete && !sealShownToday

    companion object {
        /** All-pending state — cold cache, skeletons, previews. */
        val Empty: DayRingState = DayRingState(
            plan = DayRingSegment(DaySegmentKind.Plan, DaySegmentState.Pending),
            clockIn = DayRingSegment(DaySegmentKind.ClockIn, DaySegmentState.Pending),
            tasks = DayRingSegment(DaySegmentKind.TasksDue, DaySegmentState.Pending),
            dcc = DayRingSegment(DaySegmentKind.Dcc, DaySegmentState.Pending),
            clockOut = DayRingSegment(DaySegmentKind.ClockOut, DaySegmentState.Pending),
        )

        /** Build from an ordered list (must contain the five kinds once each). */
        fun fromSegments(
            segments: List<DayRingSegment>,
            nextStepCopy: String = "",
            fixRoute: String? = null,
            sealShownToday: Boolean = false,
        ): DayRingState {
            val byKind = segments.associateBy { it.kind }
            fun of(kind: DaySegmentKind) =
                byKind[kind] ?: DayRingSegment(kind, DaySegmentState.Pending)
            return DayRingState(
                plan = of(DaySegmentKind.Plan),
                clockIn = of(DaySegmentKind.ClockIn),
                tasks = of(DaySegmentKind.TasksDue),
                dcc = of(DaySegmentKind.Dcc),
                clockOut = of(DaySegmentKind.ClockOut),
                nextStepCopy = nextStepCopy,
                fixRoute = fixRoute,
                sealShownToday = sealShownToday,
            )
        }
    }
}
