package com.altuscorp.altus.feature.punch

import android.Manifest
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.feature.punch.components.HoldToPunchControl
import com.altuscorp.altus.feature.punch.components.PunchGateCard
import com.altuscorp.altus.feature.punch.components.StatusLedger
import com.altuscorp.altus.ui.designsystem.Stamp
import com.altuscorp.altus.ui.designsystem.grainOverlay
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.centered
import java.time.Instant
import kotlinx.coroutines.delay

/**
 * S3 PUNCH — the full-screen attendance modal (deep-on-paper, grain on).
 *
 * Layout, top to bottom: a `caption` "ATTENDANCE" header + close; the live
 * `numeral-hero` mono clock (the only perpetual motion in the app, isolated so
 * its per-second tick never recomposes the ledger, the hold control or the
 * grain surface — critique P1-6); the three-row status ledger (trust before the
 * tap); and the hold-to-punch control. A 409 arrives as a [PunchGateCard] that
 * slides in over the control (which slides down 12dp) and re-arms on clear.
 *
 * Success choreography: the control commit-morphs into the stamp, the punch
 * waveform lands, the Today row types the new time in, then a 700ms breath
 * auto-dismisses to an already-optimistic Today.
 *
 * Matches the NavHost contract:
 * `PunchScreen(onDismiss, onRoutePlan, onRouteDcc, onRouteGoals)`.
 */
@Composable
fun PunchScreen(
    onDismiss: () -> Unit,
    onRoutePlan: () -> Unit,
    onRouteDcc: () -> Unit,
    onRouteGoals: () -> Unit,
) {
    val viewModel: PunchViewModel = hiltViewModel()
    val state by viewModel.state.collectAsStateWithLifecycle()

    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()
    val context = LocalContext.current
    val activity = remember(context) { context.findPunchActivity() }

    val currentOnDismiss by rememberUpdatedState(onDismiss)

    // Re-probe trust + refresh + re-arm any gate every time the screen resumes
    // (returning from a gate's fix surface is the primary path back here).
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        viewModel.onIntent(PunchIntent.Resumed)
    }

    // Location permission → feed the result straight back into zone evaluation.
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        viewModel.onIntent(PunchIntent.LocationPermissionResult(granted))
    }

    // Success: waveform haptic, let the typed-in time land, then auto-dismiss.
    LaunchedSuccess(phase = state.phase) {
        haptics.punchSuccess()
        delay(SUCCESS_BREATH_MS)
        currentOnDismiss()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.deep)
            .grainOverlay()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .padding(horizontal = AltusDimens.screenGutter),
    ) {
        // ── Header ──────────────────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = AltusDimens.space4, bottom = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "ATTENDANCE",
                style = AltusType.caption,
                color = tokens.onDeepSecondary,
                modifier = Modifier.weight(1f),
            )
            CloseButton(onClick = onDismiss, contentColor = tokens.onDeep)
        }

        // ── Clock ───────────────────────────────────────────────────────────────
        Spacer(Modifier.weight(1f))
        LiveClock(
            color = tokens.onDeep,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = remember { DateFormat.date(Instant.now()) },
            style = AltusType.label.centered(),
            color = tokens.onDeepSecondary,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(AltusDimens.space8))

        // ── Ledger ──────────────────────────────────────────────────────────────
        StatusLedger(
            state = state,
            onAllowLocation = { permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) },
            onRetryLocation = { viewModel.onIntent(PunchIntent.RetryLocation) },
        )

        Spacer(Modifier.weight(1f))

        // ── Control + gate ────────────────────────────────────────────────────────
        PunchFooter(
            state = state,
            activity = activity,
            onIntent = viewModel::onIntent,
            onRoutePlan = onRoutePlan,
            onRouteDcc = onRouteDcc,
            onRouteGoals = onRouteGoals,
        )
        Spacer(Modifier.height(AltusDimens.space6))
    }
}

/** The bottom cluster: inline hint/error, the sliding gate, and the control. */
@Composable
private fun PunchFooter(
    state: PunchUiState,
    activity: FragmentActivity?,
    onIntent: (PunchIntent) -> Unit,
    onRoutePlan: () -> Unit,
    onRouteDcc: () -> Unit,
    onRouteGoals: () -> Unit,
) {
    val tokens = AltusTheme.tokens

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        // Gate card slides in above the control (Signature 5).
        PunchGateCard(
            gate = state.gate,
            onRoutePlan = onRoutePlan,
            onRouteDcc = onRouteDcc,
            onRouteGoals = onRouteGoals,
        )

        // Inline copy: an error takes priority; otherwise the calm re-arm hint.
        AnimatedVisibility(
            visible = state.error != null || (state.rearmed && state.gate == null),
            enter = fadeIn(AltusTheme.motion.tabFadeIn),
            exit = fadeOut(AltusTheme.motion.tabFadeOut),
        ) {
            val message = state.error ?: "Gate cleared — hold to punch."
            val tone = if (state.error != null) tokens.danger.color else tokens.onDeepSecondary
            Text(
                text = message,
                style = AltusType.label.centered(),
                color = tone,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
        }

        if (state.daySealed) {
            DaySealedPanel(inAt = state.checkedInAt, outAt = state.checkedOutAt)
        } else {
            // Control slides down 12dp while a gate is present (S3).
            val drop by animateDpAsState(
                targetValue = if (state.gate != null) AltusDimens.space3 else 0.dp,
                label = "PunchControlDrop",
            )
            HoldToPunchControl(
                kind = state.punchKind,
                enabled = state.holdEnabled,
                phase = state.phase,
                onHoldComplete = { onIntent(PunchIntent.HoldCompleted(activity)) },
                modifier = Modifier.padding(top = drop),
            )
        }
    }
}

/** Both punches recorded — a calm terminal state, no control to arm. */
@Composable
private fun DaySealedPanel(inAt: String?, outAt: String?) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.hero)
            .background(tokens.onDeepSecondary.copy(alpha = 0.12f))
            .padding(horizontal = AltusDimens.space5, vertical = AltusDimens.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space4),
    ) {
        Stamp(visible = true, size = 40.dp, contentDescription = "Day complete")
        Column {
            Text(
                text = "You're clear for today",
                style = AltusType.heading,
                color = tokens.onDeep,
            )
            Text(
                text = "In ${inAt ?: "—"} · Out ${outAt ?: "—"}",
                style = AltusType.monoData,
                color = tokens.onDeepSecondary,
            )
        }
    }
}

/**
 * The live seconds clock — its own isolated `State<String>` (critique P1-6), so
 * the per-second tick recomposes only this Text, never the whole screen. Aligns
 * to the wall-clock second boundary so digits flip on the beat.
 */
@Composable
private fun LiveClock(color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    val time by produceState(initialValue = DateFormat.clock(Instant.now())) {
        while (true) {
            value = DateFormat.clock(Instant.now())
            delay(1_000L - System.currentTimeMillis() % 1_000L)
        }
    }
    Text(
        text = time,
        style = AltusType.numeralHero.centered(),
        color = color,
        modifier = modifier,
        textAlign = TextAlign.Center,
        maxLines = 1,
    )
}

/** Runs the success choreography exactly once per entry into [PunchPhase.Success]. */
@Composable
private fun LaunchedSuccess(phase: PunchPhase, block: suspend () -> Unit) {
    val current by rememberUpdatedState(block)
    androidx.compose.runtime.LaunchedEffect(phase) {
        if (phase == PunchPhase.Success) current()
    }
}

/** The 40dp close affordance — press physics, ripple kept (it's a control). */
@Composable
private fun CloseButton(onClick: () -> Unit, contentColor: androidx.compose.ui.graphics.Color) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(tokens.onDeepSecondary.copy(alpha = 0.12f))
            .tapSettleClickable(withRipple = true, onClickLabel = "Close", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.Close,
            contentDescription = "Close",
            tint = contentColor,
            modifier = Modifier.size(20.dp),
        )
    }
}

/** Unwrap the Compose context chain to the biometric-hosting FragmentActivity. */
private tailrec fun Context.findPunchActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.findPunchActivity()
    else -> null
}

/** The success breath before auto-dismiss — long enough for the typed time. */
private const val SUCCESS_BREATH_MS = 700L
