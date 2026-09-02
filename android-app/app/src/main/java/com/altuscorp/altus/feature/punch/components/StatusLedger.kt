package com.altuscorp.altus.feature.punch.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.feature.punch.PunchPhase
import com.altuscorp.altus.feature.punch.PunchUiState
import com.altuscorp.altus.feature.punch.ZoneStatus
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material3.Text
import kotlinx.coroutines.delay

/**
 * S3 STATUS LEDGER — trust shown BEFORE the tap (A's rule). Three 48dp hairline
 * rows on the `deep` bed with mono values:
 *
 *  - **Zone** — the honest client-side statement of the *fix* (permission /
 *    services / acquiring / accuracy). The server owns the geofence verdict, so
 *    the ledger never claims "inside" — only "fix ready · ±34m".
 *  - **Device** — "This device · Pixel 8", the anti-proxy identity.
 *  - **Today** — "In 09:14 · Out —". On a successful punch the just-stamped slot
 *    **types its new time in character-by-character** (Signature 4's typed-in
 *    time), driven off [PunchUiState.stampedKind] / [PunchUiState.stampedTime].
 *
 * All colours resolve through the theme against the deep surface — no hex.
 */
@Composable
fun StatusLedger(
    state: PunchUiState,
    onAllowLocation: () -> Unit,
    onRetryLocation: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val onDeep = tokens.onDeep
    val onDeepSecondary = tokens.onDeepSecondary
    val hairline = onDeepSecondary.copy(alpha = 0.22f)

    Column(modifier = modifier.fillMaxWidth()) {
        // ── Zone ──────────────────────────────────────────────────────────────
        val zone = resolveZone(state)
        LedgerRow(
            label = "Zone",
            labelColor = onDeepSecondary,
            hairlineColor = hairline,
            leadingDot = zone.dot,
            showDivider = true,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = zone.value,
                    style = AltusType.monoData,
                    color = zone.valueColor(onDeep, tokens.success.color, tokens.danger.color),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (zone.action != null) {
                    Spacer(Modifier.width(AltusDimens.space3))
                    LedgerAction(
                        label = zone.action,
                        contentColor = onDeep,
                        onClick = if (zone.actionIsAllow) onAllowLocation else onRetryLocation,
                    )
                }
            }
        }

        // ── Device ────────────────────────────────────────────────────────────
        LedgerRow(
            label = "Device",
            labelColor = onDeepSecondary,
            hairlineColor = hairline,
            leadingDot = null,
            showDivider = true,
        ) {
            val label = state.deviceLabel.ifBlank { "This device" }
            Text(
                text = if (state.deviceLabel.isBlank()) label else "This device · $label",
                style = AltusType.monoData,
                color = onDeep,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // ── Today ─────────────────────────────────────────────────────────────
        val success = state.phase == PunchPhase.Success
        val inTyped = success && state.stampedKind == "in"
        val outTyped = success && state.stampedKind == "out"
        val inValue = if (inTyped) state.stampedTime else state.checkedInAt
        val outValue = if (outTyped) state.stampedTime else state.checkedOutAt
        LedgerRow(
            label = "Today",
            labelColor = onDeepSecondary,
            hairlineColor = hairline,
            leadingDot = null,
            showDivider = false,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                PunchSlot(caption = "In", value = inValue, animate = inTyped, onDeep = onDeep, meta = onDeepSecondary)
                Text("·", style = AltusType.monoData, color = onDeepSecondary)
                PunchSlot(caption = "Out", value = outValue, animate = outTyped, onDeep = onDeep, meta = onDeepSecondary)
            }
        }
    }
}

/** One "In 09:14" slot; types [value] in at 90ms/char when [animate] is set. */
@Composable
private fun PunchSlot(
    caption: String,
    value: String?,
    animate: Boolean,
    onDeep: Color,
    meta: Color,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = caption,
            style = AltusType.label,
            color = meta,
        )
        Spacer(Modifier.width(AltusDimens.space2))
        TypedTime(target = value, animate = animate, color = onDeep, dashColor = meta)
    }
}

/**
 * The Typed-In Time (Signature 4). When [animate] is set the ledger reveals the
 * new stamp one character at a time (90ms cadence); otherwise it paints the
 * value whole. A null value is the mono em-dash placeholder.
 */
@Composable
private fun TypedTime(
    target: String?,
    animate: Boolean,
    color: Color,
    dashColor: Color,
) {
    if (target.isNullOrEmpty()) {
        Text("—", style = AltusType.monoData, color = dashColor, maxLines = 1)
        return
    }
    if (!animate) {
        Text(target, style = AltusType.monoData, color = color, maxLines = 1)
        return
    }
    var revealed by remember(target) { mutableIntStateOf(0) }
    LaunchedRevealEffect(target) { revealed = it }
    Text(
        text = target.take(revealed),
        style = AltusType.monoData,
        color = color,
        maxLines = 1,
    )
}

/** Drives the character reveal in a stable, cancellation-safe effect. */
@Composable
private fun LaunchedRevealEffect(target: String, onCount: (Int) -> Unit) {
    androidx.compose.runtime.LaunchedEffect(target) {
        onCount(0)
        for (i in 1..target.length) {
            onCount(i)
            delay(TYPE_CADENCE_MS)
        }
    }
}

/** A 48dp hairline ledger row: label left, mono value right, optional lead dot. */
@Composable
private fun LedgerRow(
    label: String,
    labelColor: Color,
    hairlineColor: Color,
    leadingDot: Color?,
    showDivider: Boolean,
    value: @Composable () -> Unit,
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = AltusDimens.touchMin)
                .padding(vertical = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (leadingDot != null) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(leadingDot),
                )
                Spacer(Modifier.width(AltusDimens.space3))
            }
            Text(
                text = label,
                style = AltusType.label,
                color = labelColor,
            )
            Spacer(Modifier.width(AltusDimens.space4))
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                value()
            }
        }
        if (showDivider) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(AltusDimens.hairline)
                    .background(hairlineColor),
            )
        }
    }
}

/** A quiet inline action ("Allow" / "Retry") on the deep bed. */
@Composable
private fun LedgerAction(
    label: String,
    contentColor: Color,
    onClick: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    Text(
        text = label,
        style = AltusType.label,
        color = contentColor,
        modifier = Modifier
            .clip(com.altuscorp.altus.ui.theme.AltusShapeTokens.pill)
            .background(tokens.onDeepSecondary.copy(alpha = 0.14f))
            .tapSettleClickable(withRipple = true, onClick = onClick)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

/** The resolved Zone-row presentation, derived from trust state. */
private data class ZoneReadout(
    val value: String,
    val tone: Tone,
    val dot: Color?,
    val action: String?,
    val actionIsAllow: Boolean,
) {
    enum class Tone { Neutral, Good, Bad }

    fun valueColor(neutral: Color, good: Color, bad: Color): Color = when (tone) {
        Tone.Neutral -> neutral
        Tone.Good -> good
        Tone.Bad -> bad
    }
}

@Composable
private fun resolveZone(state: PunchUiState): ZoneReadout {
    val tokens = AltusTheme.tokens
    if (!state.geofenceEnabled) {
        return ZoneReadout("Location not required", ZoneReadout.Tone.Neutral, null, null, false)
    }
    return when (val zone = state.zone) {
        ZoneStatus.Checking ->
            ZoneReadout("Checking location…", ZoneReadout.Tone.Neutral, null, null, false)

        ZoneStatus.PermissionNeeded ->
            ZoneReadout("Permission needed", ZoneReadout.Tone.Bad, tokens.danger.color, "Allow", true)

        ZoneStatus.LocationOff ->
            ZoneReadout("Location is off", ZoneReadout.Tone.Bad, tokens.danger.color, "Retry", false)

        ZoneStatus.Acquiring ->
            ZoneReadout("Locating…", ZoneReadout.Tone.Neutral, null, null, false)

        ZoneStatus.NoFix ->
            ZoneReadout("No GPS fix", ZoneReadout.Tone.Bad, tokens.danger.color, "Retry", false)

        is ZoneStatus.Locked ->
            ZoneReadout("Fix ready · ±${zone.accuracyM}m", ZoneReadout.Tone.Good, tokens.success.color, null, false)
    }
}

/** 90ms per character — the typed-in-time cadence (Signature 4). */
private const val TYPE_CADENCE_MS = 90L
