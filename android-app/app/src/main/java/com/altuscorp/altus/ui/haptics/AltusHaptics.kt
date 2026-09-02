package com.altuscorp.altus.ui.haptics

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import android.view.View

/**
 * The Altus haptic vocabulary (§1.6). One instance per window, provided via
 * [LocalHaptics].
 *
 * | Moment                                        | Signal                                  |
 * |-----------------------------------------------|-----------------------------------------|
 * | Commit (KPI, status, plan item)               | [commitTick] — EFFECT_TICK              |
 * | Sheet snap, swipe threshold, refresh armed    | [clockTick] — CLOCK_TICK                |
 * | Hold-progress thirds (33/66%)                 | [holdTick] — escalating CLOCK_TICKs     |
 * | Punch success                                 | [punchSuccess] — waveform [0,30,80,45]  |
 * | Day Seal (100% + eligible to clock out)       | [daySeal] — EFFECT_HEAVY_CLICK          |
 * | Long-press select / drag pickup               | [longPress] — LONG_PRESS                |
 * | 409 gate arrival, optimistic revert           | [gateUhUh] — double tick 120ms apart    |
 *
 * Rules: at most one commit-class vibration per [THROTTLE_MS]; never on
 * scroll (caller's responsibility). Signature moments (punch, seal, hold
 * thirds, uh-uh) bypass the throttle — they are already rationed by design.
 *
 * API 26–28 fallback: predefined effects don't exist before 29, so tick-class
 * signals fall back to `createOneShot(10, DEFAULT_AMPLITUDE)`.
 */
class AltusHaptics(private val view: View) {

    private val vibrator: Vibrator? = resolveVibrator(view.context)
    private var lastTickAt = 0L

    /** Commit: KPI fill, status change, plan item added. Throttled. */
    fun commitTick() {
        if (throttled()) return
        predefinedOrFallback(EFFECT_TICK_COMPAT, fallbackMillis = 10)
    }

    /** Sheet snap, swipe threshold crossed, pull-to-refresh armed. */
    fun clockTick() {
        view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }

    /** Hold-to-punch progress thirds (fire at 33% and 66%). Unthrottled by design. */
    fun holdTick() {
        view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }

    /** Punch success — the stamp signature waveform. */
    fun punchSuccess() {
        vibrate(VibrationEffect.createWaveform(longArrayOf(0, 30, 80, 45), -1))
    }

    /** Day Seal: all five gates closed. Once per day, ever. */
    fun daySeal() {
        predefinedOrFallback(EFFECT_HEAVY_CLICK_COMPAT, fallbackMillis = 30)
    }

    /** Long-press select / drag pickup. */
    fun longPress() {
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    }

    /** 409 gate arrival or optimistic revert — the "uh-uh" double tick, 120ms apart. */
    fun gateUhUh() {
        vibrate(VibrationEffect.createWaveform(longArrayOf(0, 15, 105, 15), -1))
    }

    // -----------------------------------------------------------------------

    private fun throttled(): Boolean {
        val now = SystemClock.uptimeMillis()
        if (now - lastTickAt < THROTTLE_MS) return true
        lastTickAt = now
        return false
    }

    private fun predefinedOrFallback(effectId: Int, fallbackMillis: Long) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vibrate(VibrationEffect.createPredefined(effectId))
        } else {
            vibrate(VibrationEffect.createOneShot(fallbackMillis, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }

    private fun vibrate(effect: VibrationEffect) {
        vibrator?.takeIf { it.hasVibrator() }?.vibrate(effect)
    }

    private fun resolveVibrator(context: Context): Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                ?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    private companion object {
        /** ≤1 commit-class vibration per 350ms (§1.6). */
        const val THROTTLE_MS = 350L

        // VibrationEffect.EFFECT_* constants exist from API 29; referenced by
        // value so the class loads on minSdk 26.
        const val EFFECT_TICK_COMPAT = 2        // VibrationEffect.EFFECT_TICK
        const val EFFECT_HEAVY_CLICK_COMPAT = 5 // VibrationEffect.EFFECT_HEAVY_CLICK
    }
}
