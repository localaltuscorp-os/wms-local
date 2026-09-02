package com.altuscorp.altus.core.network

import kotlinx.serialization.Serializable

/**
 * The typed 409 gate machine. Every WMS gate the backend can raise arrives as
 * `{ ok: false, error: <human copy>, needsPlan|needsDcc|needsGoals: true }`
 * (verified against app/api/mobile/attendance/punch/route.ts). [safeApiCall]
 * parses the body and surfaces [ApiResult.Gate] so the punch screen renders a
 * sliding GateCard with one route button — gates are cards, never errors.
 *
 * Non-gate 409s (optimistic-lock `stale`, double-punch) parse to null here and
 * fall through to [ApiResult.Failure] with `errorCode`.
 */

/** Which gate is blocking, and where the FIX chevron routes. */
enum class GateKind(val route: String) {
    /** Clock-in blocked until the day is planned (S4). */
    NeedsPlan("altus://plan"),

    /** Clock-out blocked until today's DCC is filled (S5). */
    NeedsDcc("altus://dcc"),

    /** Manager Monday goal-set gate (S8 GoalsFill). */
    NeedsGoals("altus://goals-fill"),
}

/**
 * A parsed 409 gate: kind + the server's human copy + optional live counters
 * ("Plan your day · 2 of 5"). Counters are null when the body doesn't carry
 * them (today's punch route sends copy only; the /plan meter fills them in).
 */
data class GateError(
    val kind: GateKind,
    /** Server copy, e.g. "Fill today's DCC before you clock out." */
    val message: String,
    /** Progress numerator, when the body carries counters. */
    val filled: Int? = null,
    /** Progress denominator, when the body carries counters. */
    val required: Int? = null,
) {
    /** How many steps remain, when counters are present. */
    val remaining: Int? get() = if (filled != null && required != null) (required - filled).coerceAtLeast(0) else null

    /** The `altus://` destination the gate's single route button opens. */
    val route: String get() = kind.route

    companion object {
        /** Null when the body is not a recognised gate (e.g. `stale`). */
        fun from(body: MobileErrorBody?): GateError? {
            body ?: return null
            val kind = when {
                body.needsPlan -> GateKind.NeedsPlan
                body.needsDcc -> GateKind.NeedsDcc
                body.needsGoals -> GateKind.NeedsGoals
                else -> return null
            }
            return GateError(
                kind = kind,
                message = body.error ?: body.message ?: "",
                filled = body.filled,
                required = body.required,
            )
        }
    }
}

/**
 * The superset error body every `/api/mobile/...` route emits on non-2xx:
 * `{ error }` (auth/validation), `{ error, message }` (task cores), and the
 * gate flags + optional counters on 409. Fully defaulted so any subset parses.
 */
@Serializable
data class MobileErrorBody(
    val ok: Boolean = false,
    /** Machine-ish code OR human copy depending on the route. */
    val error: String? = null,
    /** Secondary human message (task status/comment cores). */
    val message: String? = null,
    val needsDcc: Boolean = false,
    val needsPlan: Boolean = false,
    val needsGoals: Boolean = false,
    /** Optional live counters (new endpoints may attach them). */
    val filled: Int? = null,
    val required: Int? = null,
) {
    companion object {
        /** Lenient parse of a raw error body; null on blank/malformed JSON. */
        fun parse(raw: String?): MobileErrorBody? {
            if (raw.isNullOrBlank()) return null
            return runCatching { ApiJson.decodeFromString(serializer(), raw) }.getOrNull()
        }
    }
}
