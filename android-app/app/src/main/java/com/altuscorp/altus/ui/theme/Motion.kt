package com.altuscorp.altus.ui.theme

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Immutable

/**
 * Named motion tokens (Part 1.5). Springs for what a finger touches; curves for
 * what the system moves. Everything stays under a 300ms budget. Any tap
 * mid-animation retargets the same Animatable — never queue. Under
 * reduced-motion, callers should crossfade instead of using these.
 *
 * Design notation spring(x, y) maps to spring(dampingRatio = x, stiffness = y).
 */

// Easing curves (M3 emphasized set + stock).
val EmphasizedDecelerate: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1.0f)
val EmphasizedAccelerate: Easing = CubicBezierEasing(0.3f, 0.0f, 0.8f, 0.15f)
val AltusFastOutSlowIn: Easing = FastOutSlowInEasing
val AltusLinear: Easing = LinearEasing

/**
 * The full motion token set. Held in an [Immutable] data class so a single
 * shared value (e.g. [commitMorphFloat]) drives every mutation in the app —
 * "learn once, feel everywhere".
 */
@Immutable
data class AltusMotion(
    // tap-settle: press 1 -> 0.97 ; release settles back.
    val tapPress: SpringSpec<Float> = spring(dampingRatio = 0.7f, stiffness = 900f),
    val tapRelease: SpringSpec<Float> = spring(dampingRatio = 0.5f, stiffness = 400f),

    // commit-morph: THE mutation grammar (Fill->tri-state, punch->stamp, send->sent).
    val commitMorphFloat: SpringSpec<Float> = spring(dampingRatio = 0.7f, stiffness = 700f),

    // sheet-rise.
    val sheetRiseFloat: SpringSpec<Float> = spring(dampingRatio = 0.85f, stiffness = 380f),

    // stamp: punch success, segment completion (scale spring + 120ms fade).
    val stampFloat: SpringSpec<Float> = spring(dampingRatio = 0.55f, stiffness = 300f),
    val stampFade: TweenSpec<Float> = tween(durationMillis = 120, easing = AltusFastOutSlowIn),

    // roster-unfold: participant cards / trays (animateContentSize).
    val rosterUnfoldFloat: SpringSpec<Float> = spring(dampingRatio = 0.9f, stiffness = 420f),

    // push-forward: stack pushes.
    val pushForwardEnter: TweenSpec<Float> = tween(durationMillis = 260, easing = EmphasizedDecelerate),
    val pushForwardExit: TweenSpec<Float> = tween(durationMillis = 200, easing = EmphasizedAccelerate),

    // tab-cross: tab swaps.
    val tabFadeIn: TweenSpec<Float> = tween(durationMillis = 220, easing = AltusFastOutSlowIn),
    val tabFadeOut: TweenSpec<Float> = tween(durationMillis = 150, easing = AltusFastOutSlowIn),

    // ring-sweep: Day Ring / all progress. Never animates backwards on refresh.
    val ringSweep: TweenSpec<Float> = tween(durationMillis = 450, easing = AltusFastOutSlowIn),

    // seal: the once-per-day zest flash decay.
    val sealCrossfade: TweenSpec<Float> = tween(durationMillis = 250, easing = AltusFastOutSlowIn),
    val sealDecay: TweenSpec<Float> = tween(durationMillis = 650, easing = AltusFastOutSlowIn),

    // shimmer: skeletons only.
    val shimmer: TweenSpec<Float> = tween(durationMillis = 1100, easing = AltusLinear),
) {
    companion object {
        val Default = AltusMotion()

        /** Reduced-motion fallback: crossfade everything, no spring physics. */
        val Reduced = AltusMotion(
            tapPress = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessHigh),
            tapRelease = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessHigh),
            commitMorphFloat = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium),
        )
    }
}

/** Untyped alias for specs applied to non-Float animatables (e.g. Dp, Color). */
@Suppress("UNCHECKED_CAST")
fun <T> AnimationSpec<Float>.asSpecFor(): AnimationSpec<T> = this as AnimationSpec<T>
