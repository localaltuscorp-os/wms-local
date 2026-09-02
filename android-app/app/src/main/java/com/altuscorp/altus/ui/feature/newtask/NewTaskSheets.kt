package com.altuscorp.altus.feature.tasks.newtask

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusSheetValue
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.rememberAltusSheetState
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import java.time.LocalDate
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.launch

/**
 * The New Task decision sheets (Part 3 rule 3: anything mutating with ≤1
 * decision is a bottom sheet, never a screen): doer / initiator / subject
 * pick-lists and the due-date ledger. Every pick fires `EFFECT_TICK` and
 * settles the sheet closed through its own `sheet-rise` spring.
 */

/** One row of a pick-list sheet. */
@Immutable
internal data class PickerRow(val id: String, val label: String)

private const val SEARCH_THRESHOLD = 8

/** How many days forward the due-date ledger offers. */
private const val DUE_WINDOW_DAYS = 30L

@Composable
internal fun OptionPickerSheet(
    title: String,
    rows: ImmutableList<PickerRow>,
    selectedId: String?,
    onPick: (PickerRow) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    searchPlaceholder: String = "Search",
    /** When non-null, a leading muted row that clears the selection. */
    clearLabel: String? = null,
    onClear: (() -> Unit)? = null,
) {
    val state = rememberAltusSheetState(initialTarget = AltusSheetValue.Half)
    val scope = rememberCoroutineScope()
    val haptics = currentHaptics()
    val tokens = AltusTheme.tokens

    var query by rememberSaveable { mutableStateOf("") }
    val filtered = remember(rows, query) {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) rows
        else rows.filter { it.label.contains(trimmed, ignoreCase = true) }.toImmutableList()
    }

    fun settle(block: () -> Unit) {
        haptics.commitTick()
        block()
        scope.launch { state.hide() }
    }

    AltusBottomSheet(
        state = state,
        onDismissRequest = onDismiss,
        modifier = modifier,
        halfFraction = 0.62f,
    ) {
        Text(
            text = title,
            style = AltusType.title2,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space2,
                bottom = AltusDimens.space3,
            ),
        )

        if (rows.size > SEARCH_THRESHOLD) {
            AltusTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = searchPlaceholder,
                leadingIcon = NewTaskIcons.Search,
                modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
            )
            Spacer(Modifier.height(AltusDimens.space3))
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = false)
                .imePadding(),
        ) {
            if (clearLabel != null && onClear != null) {
                item(key = "__clear", contentType = "option") {
                    PickerRowItem(
                        label = clearLabel,
                        selected = selectedId == null,
                        muted = true,
                        onClick = { settle(onClear) },
                    )
                }
            }
            items(filtered, key = { it.id }, contentType = { "option" }) { row ->
                PickerRowItem(
                    label = row.label,
                    selected = row.id == selectedId,
                    onClick = { settle { onPick(row) } },
                )
            }
            if (filtered.isEmpty()) {
                item(key = "__empty", contentType = "empty") {
                    Text(
                        text = "No matches.",
                        style = AltusType.body,
                        color = tokens.ink400,
                        modifier = Modifier.padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space4,
                        ),
                    )
                }
            }
        }
        Spacer(Modifier.height(AltusDimens.space4))
    }
}

/**
 * The due-date ledger: the next [DUE_WINDOW_DAYS] days as 56dp rows —
 * "Today" / "Tomorrow" / "Mon, 6 Jul" left, the ISO day key in mono right
 * (the ledger fingerprint).
 */
@Composable
internal fun DueDateSheet(
    selected: LocalDate?,
    onPick: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state = rememberAltusSheetState(initialTarget = AltusSheetValue.Half)
    val scope = rememberCoroutineScope()
    val haptics = currentHaptics()
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    val today = remember { LocalDate.now() }
    val days = remember(today) {
        (0 until DUE_WINDOW_DAYS).map { today.plusDays(it) }.toImmutableList()
    }

    AltusBottomSheet(
        state = state,
        onDismissRequest = onDismiss,
        modifier = modifier,
        halfFraction = 0.62f,
    ) {
        Text(
            text = "Due date",
            style = AltusType.title2,
            color = scheme.onSurface,
            modifier = Modifier.padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space2,
                bottom = AltusDimens.space3,
            ),
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = false),
        ) {
            items(days, key = { DateFormat.dayKey(it) }, contentType = { "day" }) { date ->
                val isSelected = date == selected
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .tapSettleClickable(
                            withRipple = true,
                            role = Role.Button,
                            onClickLabel = dueDayLabel(date, today),
                            onClick = {
                                haptics.commitTick()
                                onPick(date)
                                scope.launch { state.hide() }
                            },
                        )
                        .padding(horizontal = AltusDimens.screenGutter),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = dueDayLabel(date, today),
                        style = if (isSelected) AltusType.bodyStrong else AltusType.body,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = DateFormat.dayKey(date),
                        style = AltusType.monoData,
                        color = if (isSelected) scheme.primary else tokens.ink400,
                        maxLines = 1,
                    )
                    if (isSelected) {
                        Spacer(Modifier.size(AltusDimens.space2))
                        Icon(
                            imageVector = NewTaskIcons.Check,
                            contentDescription = "Selected",
                            tint = scheme.primary,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(AltusDimens.space4))
    }
}

/** "Today" / "Tomorrow" / "Mon, 6 Jul" — shared with the screen's due field. */
internal fun dueDayLabel(date: LocalDate, today: LocalDate): String = when (date) {
    today -> "Today"
    today.plusDays(1) -> "Tomorrow"
    else -> DateFormat.dayHeader(date, today)
}

@Composable
private fun PickerRowItem(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    muted: Boolean = false,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .tapSettleClickable(
                withRipple = true,
                role = Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .padding(horizontal = AltusDimens.screenGutter),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = if (selected) AltusType.bodyStrong else AltusType.body,
            color = if (muted) tokens.ink400 else scheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Icon(
                imageVector = NewTaskIcons.Check,
                contentDescription = "Selected",
                tint = scheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * Screen-local Lucide glyphs (2dp stroke, round caps — §1.7), built in code so
 * no icon library ships. The stroke colour is a placeholder every render
 * replaces via `Icon(tint = …)`.
 */
internal object NewTaskIcons {

    /** lucide `arrow-left` — back. */
    val ArrowLeft: ImageVector by lazy {
        lucide("NewTask.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5")
    }

    /** lucide `chevron-down` — pick-field affordance. */
    val ChevronDown: ImageVector by lazy {
        lucide("NewTask.ChevronDown", "M6 9l6 6 6-6")
    }

    /** lucide `check` — selected row. */
    val Check: ImageVector by lazy {
        lucide("NewTask.Check", "M20 6L9 17l-4-4")
    }

    /** lucide `search` — sheet filter field. */
    val Search: ImageVector by lazy {
        lucide(
            "NewTask.Search",
            "M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16",
            "M21 21l-4.35-4.35",
        )
    }

    private fun lucide(name: String, vararg paths: String): ImageVector {
        val builder = ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        )
        paths.forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(Color.Black), // always overridden by Icon tint
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
