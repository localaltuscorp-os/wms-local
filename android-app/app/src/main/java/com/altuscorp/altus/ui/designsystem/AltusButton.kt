package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The app's two button voices.
 *
 * [AltusPrimaryButton] — 56dp filled evergreen pill; when [loading] the label
 * `commit-morph`s to an inline spinner while the button HOLDS ITS WIDTH
 * (Continue → spinner, S1). `tap-settle` press physics, ripple kept (it is a
 * control, not a card).
 *
 * [AltusGhostButton] — 52dp hairline-outlined pill for secondary actions
 * ("Fill now →", "Contact your admin", ghost transition chips).
 */
@Composable
fun AltusPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
    height: Dp = AltusDimens.actionPrimary,
    fillMaxWidth: Boolean = true,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val density = LocalDensity.current

    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val interactive = enabled && !loading

    val container = when {
        !enabled -> tokens.ink300
        pressed -> tokens.primaryPressed
        else -> scheme.primary
    }
    val onContainer = scheme.onPrimary

    // Width preservation for the commit-morph: remember the resolved width and
    // pin it while the spinner is shown.
    var measuredWidthPx by remember { mutableIntStateOf(0) }
    val widthModifier = when {
        fillMaxWidth -> Modifier.fillMaxWidth()
        loading && measuredWidthPx > 0 -> Modifier.width(with(density) { measuredWidthPx.toDp() })
        else -> Modifier
    }

    Box(
        modifier = modifier
            .tapSettle(interactionSource, enabled = interactive)
            .then(widthModifier)
            .height(height)
            .onSizeChanged { if (!loading) measuredWidthPx = it.width }
            .clip(AltusShapeTokens.pill)
            .background(container)
            .clickable(
                enabled = interactive,
                interactionSource = interactionSource,
                indication = ripple(),
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = AltusDimens.space6),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = loading,
            transitionSpec = {
                fadeIn(tween(150)) togetherWith fadeOut(tween(100))
            },
            label = "AltusButtonCommitMorph",
        ) { isLoading ->
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    color = onContainer,
                    strokeWidth = 2.dp,
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                ) {
                    if (leadingIcon != null) {
                        Icon(
                            imageVector = leadingIcon,
                            contentDescription = null,
                            tint = onContainer,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Text(text = text, style = AltusType.bodyStrong, color = onContainer)
                }
            }
        }
    }
}

@Composable
fun AltusGhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
    height: Dp = 52.dp,
    fillMaxWidth: Boolean = false,
    contentColor: Color = MaterialTheme.colorScheme.primary,
) {
    val tokens = AltusTheme.tokens
    val interactionSource = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .tapSettle(interactionSource, enabled = enabled)
            .then(if (fillMaxWidth) Modifier.fillMaxWidth() else Modifier)
            .height(height)
            .clip(AltusShapeTokens.pill)
            .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill)
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = ripple(),
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = AltusDimens.space5),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        ) {
            if (leadingIcon != null) {
                Icon(
                    imageVector = leadingIcon,
                    contentDescription = null,
                    tint = if (enabled) contentColor else tokens.ink300,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(
                text = text,
                style = AltusType.bodyStrong,
                color = if (enabled) contentColor else tokens.ink300,
            )
        }
    }
}
