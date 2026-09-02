package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.di.ApplicationScope
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.core.util.DeviceId
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.prefs.AltusPreferences
import com.altuscorp.altus.data.remote.dto.AttendanceDto
import com.altuscorp.altus.data.remote.dto.DashboardDto
import com.altuscorp.altus.data.remote.dto.PunchLocationDto
import com.altuscorp.altus.data.remote.dto.PunchRequestDto
import com.altuscorp.altus.data.supabase.SupabaseRealtime
import com.altuscorp.altus.domain.model.AttendanceState
import com.altuscorp.altus.domain.model.PunchResult
import com.altuscorp.altus.domain.model.toDomain
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Punch state + 14-day history (S3, Attendance History) and THE punch itself.
 *
 * The punch is ONLINE-ONLY — deliberately not an outbox [MutationKind]
 * (critique P1-2): it is geofenced, biometric, anti-proxy and
 * server-timestamped, so replaying it later from somewhere else would either
 * falsify the time or open the proxy hole the biometric system closes. A 409
 * WMS gate surfaces as [ApiResult.Gate] straight from [safeApiCall] — the
 * punch screen renders it as a sliding GateCard, never an error.
 */
interface AttendanceRepository {

    /** Live decoded punch ledger; null on a true cold cache. */
    fun attendance(): Flow<AttendanceState?>

    /** Fetch from the network, upsert the snapshot, return the fresh state. */
    suspend fun refresh(): ApiResult<AttendanceState>

    /**
     * `POST /attendance/punch` — [kind] is `"in"` or `"out"`. Device identity
     * rides automatically. On success the attendance + dashboard snapshots are
     * patched immediately (Today is optimistic before the reconcile fetch
     * lands), then both refresh from the network in the background.
     */
    suspend fun punch(
        kind: String,
        location: PunchLocationDto?,
        note: String? = null,
    ): ApiResult<PunchResult>
}

class AttendanceRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
    private val deviceId: DeviceId,
    private val preferences: AltusPreferences,
    private val realtime: SupabaseRealtime,
    @ApplicationScope private val appScope: CoroutineScope,
) : AttendanceRepository {

    init {
        observeRealtimeDeltas()
    }

    override fun attendance(): Flow<AttendanceState?> =
        cache.observe(CacheKeys.ATTENDANCE, AttendanceDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<AttendanceState> {
        val result = safeApiCall { api.attendance() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.ATTENDANCE, AttendanceDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override suspend fun punch(
        kind: String,
        location: PunchLocationDto?,
        note: String?,
    ): ApiResult<PunchResult> {
        val body = PunchRequestDto(
            kind = kind,
            deviceId = deviceId.id,
            deviceLabel = deviceId.label,
            platform = deviceId.platform,
            location = location,
            note = note,
        )
        val result = safeApiCall { api.punch(body) }
        if (result is ApiResult.Success) {
            // The server stamped the punch; show its local time NOW (the
            // typed-in-time moment) and reconcile with real truth right after.
            val time = DateFormat.time(Instant.now())
            cache.mutate(CacheKeys.ATTENDANCE, AttendanceDto.serializer()) { it.applyPunch(kind, time) }
            cache.mutate(CacheKeys.DASHBOARD, DashboardDto.serializer()) { it.applyPunch(kind, time) }
            appScope.launch {
                refresh()
                val dashboard = safeApiCall { api.dashboard() }
                if (dashboard is ApiResult.Success) {
                    cache.write(CacheKeys.DASHBOARD, DashboardDto.serializer(), dashboard.data)
                }
            }
        }
        return result.map { it.toDomain() }
    }

    /**
     * Realtime punch-mirror deltas for the signed-in employee. Gated behind
     * the table's RLS confirmation inside [SupabaseRealtime] — until the
     * SELECT policy ships this collector simply completes (P0-1), and REST
     * polling stays the truth.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun observeRealtimeDeltas() {
        appScope.launch {
            preferences.cachedIdentity
                .filterNotNull()
                .map { it.employeeId }
                .distinctUntilChanged()
                .flatMapLatest { employeeId -> realtime.attendanceChanges(employeeId) }
                .catch { Timber.w(it, "Attendance realtime stream failed — polling remains truth") }
                .collect { refresh() }
        }
    }
}

/** Patch today's punch time in place; "in" never overwrites an existing in. */
private fun AttendanceDto.applyPunch(kind: String, time: String): AttendanceDto = copy(
    today = if (kind == "in") {
        today.copy(checkedIn = today.checkedIn ?: time)
    } else {
        today.copy(checkedOut = time)
    },
)

private fun DashboardDto.applyPunch(kind: String, time: String): DashboardDto = copy(
    attendance = if (kind == "in") {
        attendance.copy(checkedIn = attendance.checkedIn ?: time)
    } else {
        attendance.copy(checkedOut = time)
    },
)
