package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The empty state (S6 "All clear.", S10 "Nothing new."): a `display` headline,
 * an optional quiet explainer, and an optional ghost action. Calm, not cute —
 * an empty ledger is a good ledger.
 */
@Composable
fun EmptyState(
    headline: String,
    modifier: Modifier = Modifier,
    body: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        Text(
            text = headline,
            style = AltusType.display,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        if (body != null) {
            Text(
                text = body,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        if (actionLabel != null && onAction != null) {
            AltusGhostButton(
                text = actionLabel,
                onClick = onAction,
                modifier = Modifier.padding(top = AltusDimens.space2),
            )
        }
    }
}
