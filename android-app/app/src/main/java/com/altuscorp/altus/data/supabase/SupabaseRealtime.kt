package com.altuscorp.altus.data.supabase

import com.altuscorp.altus.core.util.DateFormat
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import timber.log.Timber

/**
 * The tables the app may subscribe to, with their RLS reality spelled out —
 * the P0-1 leak finding is a *coverage contract*, not a footnote:
 *
 * - `tasks` currently carries `using (true)` SELECT RLS: a direct subscription
 *   streams EVERY task in the company, bypassing the `/api/mobile/tasks`
 *   doer-scope. Until a per-user policy mirrors the TypeScript scope,
 *   repositories MUST NOT ship a tasks subscription to production — poll
 *   `/api/mobile` + refetch-on-resume instead.
 * - `attendance_logs` / `dcc_entries` have NO SELECT policy yet: a
 *   subscription is silent-empty (safe but useless) until policies land.
 *
 * Repositories therefore treat every flow here as a *delta hint* layered over
 * REST truth, gated per-table behind [rlsConfirmed]. Flip a table's flag only
 * after its scoped SELECT policy is verified in a migration.
 */
enum class AltusTable(
    val tableName: String,
    /** True only once a per-user RLS SELECT policy is live for this table. */
    val rlsConfirmed: Boolean,
) {
    TASKS("tasks", rlsConfirmed = false),
    ATTENDANCE("attendance_logs", rlsConfirmed = false),
    DCC_ENTRIES("dcc_entries", rlsConfirmed = false),
}

/**
 * Direct Supabase Realtime subscriptions (hybrid [C]: live READS only; every
 * write and initial load stays on `/api/mobile`). Each collection opens its
 * own channel and tears it down on cancellation, so a screen leaving simply
 * unsubscribes. Events are raw [PostgresAction] deltas; repositories reconcile
 * them into the Room cache (never render a socket payload directly — REST
 * remains truth).
 */
@Singleton
class SupabaseRealtime @Inject constructor(
    private val supabase: SupabaseClient,
    private val authBridge: RealtimeAuthBridge,
) {

    private val channelSeq = AtomicLong(0)

    /** Socket status for the offline/live affordance. */
    val status: StateFlow<Realtime.Status>
        get() = supabase.realtime.status

    /**
     * Live row-change deltas for [table], optionally server-filtered by one
     * equality (`filterColumn = filterValue`). The flow subscribes lazily on
     * first collection and removes its channel when the collector leaves.
     *
     * Emits nothing (silent-empty) when RLS denies — never an error — which is
     * exactly why callers must not treat this as their only data source.
     */
    fun changes(
        table: AltusTable,
        filterColumn: String? = null,
        filterValue: String? = null,
    ): Flow<PostgresAction> = flow {
        if (!table.rlsConfirmed) {
            Timber.w(
                "Realtime subscription to %s requested before its RLS SELECT policy is confirmed — " +
                    "emitting nothing. Poll /api/mobile instead (P0-1).",
                table.tableName,
            )
            return@flow
        }
        authBridge.ensureStarted()
        authBridge.pushFreshToken()
        val channel = supabase.channel("altus-${table.tableName}-${channelSeq.incrementAndGet()}")
        val deltas = channel.postgresChangeFlow<PostgresAction>(schema = SCHEMA) {
            this.table = table.tableName
            if (filterColumn != null && filterValue != null) {
                filter(filterColumn, FilterOperator.EQ, filterValue)
            }
        }
        try {
            channel.subscribe(false)
            emitAll(deltas)
        } finally {
            withContext(NonCancellable) {
                runCatching { supabase.realtime.removeChannel(channel) }
                    .onFailure { Timber.w(it, "Failed to remove realtime channel %s", channel.topic) }
            }
        }
    }

    /** Task deltas. BLOCKED behind the tasks RLS re-scope (see [AltusTable.TASKS]). */
    fun taskChanges(): Flow<PostgresAction> = changes(AltusTable.TASKS)

    /** The signed-in employee's attendance-log deltas (punch mirror). */
    fun attendanceChanges(employeeId: String): Flow<PostgresAction> =
        changes(AltusTable.ATTENDANCE, filterColumn = "employee_id", filterValue = employeeId)

    /** DCC entry deltas for one board day (defaults to today). */
    fun dccChanges(dayKey: String = DateFormat.todayKey()): Flow<PostgresAction> =
        changes(AltusTable.DCC_ENTRIES, filterColumn = "date", filterValue = dayKey)

    /**
     * Resume hook: after Doze/backgrounding the socket is assumed dead —
     * re-auth it and let channels rejoin; the caller refetches REST truth in
     * parallel (dead-socket-on-resume is the NORMAL case, per the punch list).
     */
    suspend fun onAppResumed() {
        authBridge.ensureStarted()
        authBridge.pushFreshToken()
        runCatching { supabase.realtime.connect() }
            .onFailure { Timber.w(it, "Realtime reconnect on resume failed") }
    }
}

private const val SCHEMA = "public"
