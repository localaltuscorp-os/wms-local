package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * Section header (§1.3 rhythm + S5/S6): UPPERCASE `caption` eyebrow left,
 * mono count right ("SECTION B · CLIENT: ACME" — "2/4"). Designed for
 * `stickyHeader {}` use, so it fills its width with an opaque background
 * (default: the canvas) and content never ghosts through while pinned.
 */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    count: String? = null,
    containerColor: Color = AltusTheme.tokens.canvas,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(containerColor)
            .heightIn(min = 36.dp)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (count != null) {
            Text(
                text = count,
                style = AltusType.monoData,
                color = AltusTheme.tokens.ink400,
                maxLines = 1,
            )
        }
    }
}
