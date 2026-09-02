package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * Filter / meta chip (S6 filter row, DCC date chips): 8dp radius, `label`
 * type, optional mono count. Selected = `primaryContainer` fill; unselected =
 * surface + hairline. Single-select semantics belong to the caller.
 */
@Composable
fun AltusChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: String? = null,
    enabled: Boolean = true,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }

    val container by animateColorAsState(
        targetValue = if (selected) scheme.primaryContainer else tokens.surface,
        label = "AltusChipContainer",
    )
    val labelColor = when {
        !enabled -> tokens.ink300
        selected -> scheme.onPrimaryContainer
        else -> scheme.onSurfaceVariant
    }

    Row(
        modifier = modifier
            .tapSettle(interactionSource, enabled = enabled)
            .height(36.dp)
            .clip(AltusShapeTokens.chip)
            .background(container)
            .then(
                if (!selected) {
                    Modifier.border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.chip)
                } else {
                    Modifier
                },
            )
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = ripple(),
                role = Role.Checkbox,
                onClick = onClick,
            )
            .padding(horizontal = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        Text(text = label, style = AltusType.label, color = labelColor)
        if (count != null) {
            Text(
                text = count,
                style = AltusType.monoData,
                color = if (selected) scheme.onPrimaryContainer else tokens.ink400,
            )
        }
    }
}
