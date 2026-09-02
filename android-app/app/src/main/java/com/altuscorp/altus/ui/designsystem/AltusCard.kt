package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.ambientShadow

/**
 * The core surface card.
 *
 * Elevation-by-hairline (§1.4): a 1dp border does the separation; the
 * `ambient` shadow is a whisper underneath (light mode only). Pressable cards
 * never shadow-jump — they scale via `tap-settle`, with the ripple suppressed
 * (ripple is kept on list rows, not cards). Pass [onClick] = null for a
 * static, inert card.
 *
 * @param accentKeyline optional 3dp left module keyline (module cards only).
 */
@Composable
fun AltusCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = AltusShapeTokens.card,
    containerColor: Color = AltusTheme.tokens.surface,
    contentColor: Color = MaterialTheme.colorScheme.onSurface,
    showBorder: Boolean = true,
    showShadow: Boolean = true,
    accentKeyline: Color? = null,
    padding: Dp = AltusDimens.cardPadding,
    enabled: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = AltusTheme.tokens

    val pressModifier = if (onClick != null) {
        Modifier.tapSettleClickable(enabled = enabled, withRipple = false, onClick = onClick)
    } else {
        Modifier
    }

    val keylineModifier = if (accentKeyline != null) {
        Modifier.drawWithContent {
            drawContent()
            val w = AltusDimens.moduleKeyline.toPx()
            drawRoundRect(
                color = accentKeyline,
                size = Size(w, size.height),
                cornerRadius = CornerRadius(w / 2f, w / 2f),
            )
        }
    } else {
        Modifier
    }

    Column(
        modifier = modifier
            .then(pressModifier)
            .then(if (showShadow) Modifier.ambientShadow(shape) else Modifier)
            .clip(shape)
            .background(containerColor)
            .then(
                if (showBorder) Modifier.border(AltusDimens.hairline, tokens.hairline, shape)
                else Modifier,
            )
            .then(keylineModifier)
            .padding(padding),
    ) {
        CompositionLocalProvider(LocalContentColor provides contentColor) {
            content()
        }
    }
}

/**
 * The deep hero card (§1.1 `deep` ★): 24dp radius, near-black-green fill,
 * grain on, no border — light mode's one premium anchor. Used by the Day Ring
 * hero bed, the punch hero and the profile identity card. Content color
 * defaults to `onDeep`.
 */
@Composable
fun AltusDeepCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = AltusShapeTokens.hero,
    padding: Dp = AltusDimens.cardPadding,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = AltusTheme.tokens

    val pressModifier = if (onClick != null) {
        Modifier.tapSettleClickable(withRipple = false, onClick = onClick)
    } else {
        Modifier
    }

    Column(
        modifier = modifier
            .then(pressModifier)
            .ambientShadow(shape)
            .clip(shape)
            .background(tokens.deep)
            .grainOverlay()
            .padding(padding),
    ) {
        CompositionLocalProvider(LocalContentColor provides tokens.onDeep) {
            content()
        }
    }
}
