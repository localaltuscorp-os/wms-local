package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusTheme

/**
 * The `stamp` motion token (§1.5) as a composable: a success mark that scales
 * 0.6 → 1 with spring(0.55, 300) while fading in over 120ms. Used for punch
 * success, DCC 100%, and segment completion.
 *
 * Compose it unconditionally and drive [visible]; the stamp animates in when
 * it flips true and fades out when false (reverts are quick, never theatrical).
 */
@Composable
fun Stamp(
    visible: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    containerColor: Color = AltusTheme.tokens.success.color,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary,
    contentDescription: String? = "Done",
) {
    val motion = AltusTheme.motion

    val scale by animateFloatAsState(
        targetValue = if (visible) 1f else 0.6f,
        animationSpec = motion.stampFloat,
        label = "StampScale",
    )
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = motion.stampFade,
        label = "StampFade",
    )

    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
            .clip(CircleShape)
            .background(containerColor),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.Check,
            contentDescription = contentDescription,
            tint = contentColor,
            modifier = Modifier
                .fillMaxSize()
                .padding(size / 4),
        )
    }
}
