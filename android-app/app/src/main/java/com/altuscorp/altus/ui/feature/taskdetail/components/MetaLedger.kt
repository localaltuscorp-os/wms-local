package com.altuscorp.altus.feature.tasks.detail.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.domain.model.TaskDetail
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * S7 meta ledger: a 2-column hairline grid — Client · Subject / Due · Doer /
 * Initiator · Created — caption eyebrows over mono values.
 *
 * The Due cell honours the due-date rule: the IMMUTABLE original date is the
 * value; a revision renders beneath it in `info` tone ("Revised → 8 Jul"),
 * otherwise the live due phrase ("Due today" / "Overdue 3d") carries the
 * warn/danger tone computed from the EFFECTIVE due (revised ?? original).
 *
 * Rows use `heightIn(min)` + intrinsic sizing, not fixed heights, so
 * fontScale 1.3× never truncates (the readability house rule).
 */
@Composable
fun MetaLedger(
    detail: TaskDetail,
    modifier: Modifier = Modifier,
) {
    AltusCard(modifier = modifier.fillMaxWidth(), padding = 0.dp) {
        LedgerRow {
            LedgerCell(label = "Client", value = detail.client)
            CellDivider()
            LedgerCell(label = "Subject", value = detail.subject)
        }
        RowDivider()
        LedgerRow {
            DueCell(detail)
            CellDivider()
            LedgerCell(label = "Doer", value = detail.doerName)
        }
        RowDivider()
        LedgerRow {
            LedgerCell(
                label = "Initiator",
                value = detail.initiatorName ?: detail.creatorName,
            )
            CellDivider()
            LedgerCell(
                label = "Created",
                value = detail.createdAt?.let { DateFormat.dateSmart(it) },
            )
        }
    }
}

@Composable
private fun LedgerRow(content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .heightIn(min = LedgerRowMinHeight),
        content = content,
    )
}

@Composable
private fun RowScope.LedgerCell(
    label: String,
    value: String?,
    valueColor: Color? = null,
    subLine: (@Composable () -> Unit)? = null,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .padding(horizontal = AltusDimens.cardPadding, vertical = AltusDimens.space3),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = tokens.ink400,
            maxLines = 1,
        )
        Text(
            text = value?.takeIf { it.isNotBlank() } ?: "—",
            style = AltusType.monoData,
            color = valueColor ?: MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            modifier = Modifier.padding(top = AltusDimens.space1),
        )
        if (subLine != null) subLine()
    }
}

/**
 * Due cell: immutable original date as the mono value; the revision (`info`)
 * or the live due phrase (warn/danger) as the sub-line.
 */
@Composable
private fun RowScope.DueCell(detail: TaskDetail) {
    val tokens = AltusTheme.tokens
    val effective = detail.effectiveDueAt
    val phase = EffectiveDue.duePhase(effective)

    val phaseColor = when (phase) {
        EffectiveDue.DuePhase.OVERDUE -> tokens.danger.color
        EffectiveDue.DuePhase.TODAY, EffectiveDue.DuePhase.SOON -> tokens.warn.color
        else -> tokens.ink400
    }

    LedgerCell(
        label = "Due",
        value = detail.dueAt?.let { DateFormat.dateSmart(it) },
        valueColor = if (phase == EffectiveDue.DuePhase.OVERDUE && detail.revisedTargetDate == null) {
            tokens.danger.color
        } else {
            null
        },
        subLine = {
            val revised = detail.revisedTargetDate
            when {
                revised != null -> Text(
                    text = "Revised → ${DateFormat.dateSmart(revised)}",
                    style = AltusType.label,
                    color = tokens.info.color,
                    maxLines = 1,
                )

                effective != null && phase != EffectiveDue.DuePhase.NONE -> Text(
                    text = EffectiveDue.duePhrase(effective),
                    style = AltusType.label,
                    color = phaseColor,
                    maxLines = 1,
                )
            }
        },
    )
}

@Composable
private fun RowScope.CellDivider() {
    Box(
        modifier = Modifier
            .width(AltusDimens.hairline)
            .fillMaxHeight()
            .background(AltusTheme.tokens.hairline),
    )
}

@Composable
private fun RowDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(AltusDimens.hairline)
            .background(AltusTheme.tokens.hairline),
    )
}

/** 4dp-grid minimum; rows grow with fontScale instead of truncating. */
private val LedgerRowMinHeight = 72.dp
