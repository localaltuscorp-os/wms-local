package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme

/**
 * SKELETONS THAT KEEP THEIR WORD (Signature 8): every loading state shimmers
 * in the EXACT resolved geometry — zero layout shift, ever. Screens compose
 * these primitives into a silhouette matching the final layout 1:1.
 *
 * Shimmer = the `shimmer` motion token (1100ms linear) sweeping a 20° gradient.
 * The progress state is read inside the draw phase only, so the sweep never
 * recomposes the tree.
 */

/** A shimmering block. Give it the final content's size and shape. */
@Composable
fun SkeletonBox(
    modifier: Modifier = Modifier,
    shape: Shape = AltusShapeTokens.card,
) {
    val progress = shimmerProgress()
    val base = AltusTheme.tokens.sunken
    val highlight = AltusTheme.tokens.raised

    Box(
        modifier = modifier
            .clip(shape)
            .drawWithCache {
                onDrawBehind {
                    drawRect(base)
                    val sweep = size.width * 1.5f
                    val x = -sweep + (size.width + 2 * sweep) * progress.value
                    val brush = Brush.linearGradient(
                        colors = listOf(base, highlight, base),
                        start = Offset(x, 0f),
                        // 20° sweep: dy = dx * tan(20°) ≈ 0.364.
                        end = Offset(x + sweep, sweep * 0.364f),
                    )
                    drawRect(brush)
                }
            },
    )
}

/** A shimmering text line. Defaults approximate one `body` line. */
@Composable
fun SkeletonLine(
    width: Dp,
    modifier: Modifier = Modifier,
    height: Dp = 14.dp,
) {
    SkeletonBox(
        modifier = modifier
            .width(width)
            .height(height),
        shape = RoundedCornerShape(percent = 50),
    )
}

/** A shimmering circle — avatars, rings. */
@Composable
fun SkeletonCircle(
    diameter: Dp,
    modifier: Modifier = Modifier,
) {
    SkeletonBox(
        modifier = modifier.size(diameter),
        shape = CircleShape,
    )
}

/** One shared 0→1 sweep per composition subtree, driven by `motion.shimmer`. */
@Composable
private fun shimmerProgress(): State<Float> {
    val motion = AltusTheme.motion
    val transition = rememberInfiniteTransition(label = "SkeletonShimmer")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = motion.shimmer),
        label = "SkeletonShimmerProgress",
    )
}
