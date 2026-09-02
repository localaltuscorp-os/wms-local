package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import com.altuscorp.altus.domain.model.StatusDisplay
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.SemanticColor

/**
 * Server-driven status pill (S6/S7): renders the backend's `statusDisplay`
 * `{ label, colour-token }` verbatim — the client never hard-codes a status
 * label, a transition rule, or a colour.
 *
 * The colour vocabulary is the FIXED server enum `STATUS_COLOR_TOKENS`
 * (db/enums.ts): blue · green · amber · red · rose · purple · yellow ·
 * orange · slate · brown · stone — plus the client-side "neutral" fallback
 * ([com.altuscorp.altus.domain.model.TaskBoard.displayFor] emits it for an
 * unknown status). [resolveStatusColor] is the one mapping table from that
 * vocabulary onto theme tokens, so "no hex in composables" holds even for
 * server-named colours.
 */
@Composable
fun StatusPill(
    display: StatusDisplay,
    modifier: Modifier = Modifier,
) {
    val semantic = resolveStatusColor(display.color)
    Text(
        text = display.label,
        style = AltusType.label,
        color = semantic.color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(semantic.wash)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

/**
 * The StatusColorResolver: server colour token → theme [SemanticColor]
 * (text colour + wash fill). Non-semantic tokens borrow module accents or the
 * ink ladder with a 14%-alpha wash so every pairing stays theme-derived and
 * theme-switch safe. Unknown tokens degrade to neutral — never a crash, never
 * a hex.
 */
@Composable
@ReadOnlyComposable
fun resolveStatusColor(token: String): SemanticColor {
    val tokens = AltusTheme.tokens
    return when (token.lowercase()) {
        "green" -> tokens.success
        "red", "rose" -> tokens.danger
        "amber", "yellow", "orange" -> tokens.warn
        "blue" -> tokens.info
        "purple" -> tokens.accents.dcc.asWashPair()
        "brown" -> tokens.accents.goals.asWashPair()
        "slate" -> SemanticColor(
            color = tokens.ink400,
            wash = tokens.ink400.copy(alpha = WASH_ALPHA),
        )
        // "stone", "neutral", and anything the server adds later.
        else -> SemanticColor(
            color = tokens.ink400,
            wash = tokens.sunken,
        )
    }
}

private const val WASH_ALPHA = 0.14f

private fun androidx.compose.ui.graphics.Color.asWashPair(): SemanticColor =
    SemanticColor(color = this, wash = this.copy(alpha = WASH_ALPHA))
