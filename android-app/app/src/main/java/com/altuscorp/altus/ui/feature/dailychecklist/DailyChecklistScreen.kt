@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.dailychecklist

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.rememberAltusSheetState
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * WMS Daily Checklist — web parity with `app/(app)/daily-checklist/page.tsx`
 * (`DayLedger`): the day's committed items (manager-assigned tasks live, THEN
 * personal items), a "day is planned" banner, a carry-forward strip for
 * unfinished items from earlier days, and a "pull from weekly goals" rail.
 * Content-only: [com.altuscorp.altus.feature.wms.WmsShell] owns the status-bar
 * inset and the bottom pill nav.
 */
@Composable
fun DailyChecklistScreen(
    modifier: Modifier = Modifier,
    viewModel: DailyChecklistViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = currentHaptics()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                DailyChecklistEffect.Committed -> haptics.commitTick()
                DailyChecklistEffect.Reject -> haptics.gateUhUh()
            }
        }
    }

    DailyChecklistContent(state = state, onIntent = viewModel::onIntent, modifier = modifier)
}

@Composable
private fun DailyChecklistContent(
    state: DailyChecklistUiState,
    onIntent: (DailyChecklistIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        when {
            state.isLoading -> ChecklistSkeleton()
            state.loadFailed -> Box(Modifier.fillMaxWidth().fillMaxHeight(), contentAlignment = Alignment.Center) {
                EmptyState(
                    headline = "Couldn't load your checklist",
                    body = "The Daily Checklist needs a connection to load.",
                    actionLabel = "Retry",
                    onAction = { onIntent(DailyChecklistIntent.Retry) },
                )
            }
            else -> ChecklistBoard(state = state, onIntent = onIntent)
        }

        if (state.noteDraft != null) {
            NoteSheet(draft = state.noteDraft, onIntent = onIntent)
        }

        MessageBanner(
            message = state.message,
            onShown = { onIntent(DailyChecklistIntent.MessageShown) },
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding(),
        )
    }
}

// ─── The board ──────────────────────────────────────────────────────────────────

@Composable
private fun ChecklistBoard(
    state: DailyChecklistUiState,
    onIntent: (DailyChecklistIntent) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(DailyChecklistIntent.Refresh) },
        state = pullState,
        modifier = Modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pullState,
                isRefreshing = state.isRefreshing,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = AltusTheme.tokens.raised,
                color = MaterialTheme.colorScheme.primary,
            )
        },
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = AltusDimens.space3, bottom = AltusDimens.space12),
        ) {
            item(key = "header", contentType = "header") {
                DayHeader(
                    weekday = state.weekday,
                    date = state.date,
                    total = state.totalCount,
                    done = state.doneCount,
                    pending = state.pendingCount,
                    modifier = Modifier
                        .padding(horizontal = AltusDimens.screenGutter)
                        .padding(bottom = AltusDimens.space3),
                )
            }

            if (state.overdueCount > 0) {
                item(key = "overdue-strip", contentType = "overdue-strip") {
                    OverdueStrip(
                        count = state.overdueCount,
                        busy = state.carryingForward,
                        onCarryForward = { onIntent(DailyChecklistIntent.CarryForward) },
                        modifier = Modifier
                            .padding(horizontal = AltusDimens.screenGutter)
                            .padding(bottom = AltusDimens.space3),
                    )
                }
            }

            item(key = "day-ready", contentType = "day-ready") {
                DayReadyBanner(
                    planned = state.dayPlanned,
                    total = state.totalCount,
                    assignedCount = state.assigned.size,
                    modifier = Modifier
                        .padding(horizontal = AltusDimens.screenGutter)
                        .padding(bottom = AltusDimens.space4),
                )
            }

            if (state.totalCount == 0 && state.pullable.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "Nothing planned yet",
                        body = "Tasks your manager assigns for today appear here automatically. Add your own below.",
                        modifier = Modifier.padding(vertical = AltusDimens.space6),
                    )
                }
            }

            if (state.assigned.isNotEmpty()) {
                item(key = "h-assigned", contentType = "section-header") {
                    SectionHeader(title = "Assigned by your manager", count = "${state.assigned.size}")
                }
                items(state.assigned, key = { "a-${it.id}" }, contentType = { "row" }) { row ->
                    ChecklistRowCard(
                        row = row,
                        busy = BusyKeys.task(row.taskId ?: row.id) in state.busyKeys,
                        onToggle = { done -> onIntent(DailyChecklistIntent.ToggleAssigned(row.taskId ?: row.id, done)) },
                        onRemove = null,
                        onEditNote = null,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            if (state.personal.isNotEmpty()) {
                item(key = "h-personal", contentType = "section-header") {
                    SectionHeader(title = "Personal", count = "${state.personal.size}")
                }
                items(state.personal, key = { "p-${it.id}" }, contentType = { "row" }) { row ->
                    ChecklistRowCard(
                        row = row,
                        busy = BusyKeys.item(row.id) in state.busyKeys,
                        onToggle = { done -> onIntent(DailyChecklistIntent.TogglePersonal(row.id, done)) },
                        onRemove = { onIntent(DailyChecklistIntent.RemovePersonal(row.id)) },
                        onEditNote = { onIntent(DailyChecklistIntent.OpenNote(row.id, row.done, row.doneNote)) },
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            item(key = "composer", contentType = "composer") {
                PersonalComposer(
                    value = state.draftTitle,
                    adding = state.addingPersonal,
                    onValueChange = { onIntent(DailyChecklistIntent.DraftTitleChanged(it)) },
                    onAdd = { onIntent(DailyChecklistIntent.AddPersonal) },
                    modifier = Modifier
                        .padding(horizontal = AltusDimens.screenGutter)
                        .padding(top = AltusDimens.space2, bottom = AltusDimens.space5),
                )
            }

            if (state.pullable.isNotEmpty()) {
                item(key = "h-pullable", contentType = "section-header") {
                    SectionHeader(title = "Pull from weekly goals", count = "${state.pullable.size}")
                }
                items(state.pullable, key = { "g-${it.id}" }, contentType = { "pullable" }) { goal ->
                    PullableGoalCard(
                        goal = goal,
                        pending = BusyKeys.goal(goal.id) in state.busyKeys,
                        onAdd = { onIntent(DailyChecklistIntent.PullGoal(goal.id)) },
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }
        }
    }
}

// ─── Header ───────────────────────────────────────────────────────────────────

@Composable
private fun DayHeader(
    weekday: String,
    date: String,
    total: Int,
    done: Int,
    pending: Int,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = scheme.primary) {
        Text(
            text = weekday.ifBlank { "Today" }.uppercase(),
            style = AltusType.caption,
            color = scheme.primary,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(text = "Today", style = AltusType.title1, color = scheme.onSurface)
            if (date.isNotBlank()) {
                Spacer(Modifier.width(AltusDimens.space2))
                Text(
                    text = date,
                    style = AltusType.body,
                    color = tokens.ink400,
                    modifier = Modifier.padding(bottom = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            HeroChip(label = "Committed", value = total)
            HeroChip(label = "Done", value = done, color = tokens.success.color)
            HeroChip(label = "Pending", value = pending, color = tokens.warn.color)
        }
    }
}

@Composable
private fun HeroChip(label: String, value: Int, color: androidx.compose.ui.graphics.Color? = null, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        Text(text = "$value", style = AltusType.monoData, color = color ?: scheme.onSurface)
        Text(text = label, style = AltusType.label, color = tokens.ink400)
    }
}

// ─── Overdue strip ──────────────────────────────────────────────────────────────

@Composable
private fun OverdueStrip(
    count: Int,
    busy: Boolean,
    onCarryForward: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.card)
            .background(tokens.warn.wash)
            .border(AltusDimens.hairline, tokens.warn.color.copy(alpha = 0.35f), AltusShapeTokens.card)
            .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "$count unfinished item${if (count == 1) "" else "s"} from earlier",
            style = AltusType.bodyStrong,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(AltusDimens.space2))
        AltusGhostButton(
            text = "Carry forward",
            onClick = onCarryForward,
            enabled = !busy,
            height = 40.dp,
            contentColor = tokens.warn.color,
        )
    }
}

// ─── Day-ready banner ───────────────────────────────────────────────────────────

@Composable
private fun DayReadyBanner(
    planned: Boolean,
    total: Int,
    assignedCount: Int,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val bg = if (planned) tokens.success.wash else tokens.danger.wash
    val fg = if (planned) tokens.success.color else tokens.danger.color
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.card)
            .background(bg)
            .padding(AltusDimens.space4),
    ) {
        Text(
            text = if (planned) "Your day is planned" else "Nothing planned yet — add one item to start your day",
            style = AltusType.bodyStrong,
            color = fg,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = if (assignedCount > 0) {
                "$assignedCount task${if (assignedCount == 1) "" else "s"} assigned by your manager · $total planned in total."
            } else {
                "Your assigned tasks appear here automatically — add personal items any time."
            },
            style = AltusType.label,
            color = tokens.ink400,
        )
    }
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

@Composable
private fun ChecklistRowCard(
    row: ChecklistRow,
    busy: Boolean,
    onToggle: (Boolean) -> Unit,
    onRemove: (() -> Unit)?,
    onEditNote: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val haptics = currentHaptics()

    AltusCard(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = AltusDimens.space2)
            .alpha(if (row.done) 0.85f else 1f),
        accentKeyline = when {
            row.overdue -> tokens.danger.color
            row.goalRelated -> tokens.accents.goals
            else -> tokens.accents.tasks
        },
    ) {
        Row(verticalAlignment = Alignment.Top) {
            CheckToggle(
                done = row.done,
                busy = busy,
                onToggle = {
                    haptics.commitTick()
                    onToggle(!row.done)
                },
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = row.title,
                    style = AltusType.heading,
                    color = if (row.done) tokens.ink400 else scheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (row.assigned) "Assigned" else if (row.goalRelated) "Goal" else "Personal",
                        style = AltusType.label,
                        color = if (row.assigned) scheme.primary else tokens.ink400,
                    )
                    if (row.duePhrase != null) {
                        Text(
                            text = row.duePhrase,
                            style = AltusType.label,
                            color = if (row.overdue) tokens.danger.color else tokens.ink400,
                        )
                    }
                    if (row.carried) {
                        Text(text = "Carried", style = AltusType.label, color = tokens.warn.color)
                    }
                }
                if (row.meta != null) {
                    Text(text = row.meta, style = AltusType.label, color = tokens.ink400, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!row.assigned && row.doneNote.isNotBlank()) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(text = row.doneNote, style = AltusType.label, color = tokens.ink400, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            if (onEditNote != null || onRemove != null) {
                Column(horizontalAlignment = Alignment.End) {
                    if (onEditNote != null) {
                        Icon(
                            imageVector = NoteIcon,
                            contentDescription = "Edit note",
                            tint = tokens.ink400,
                            modifier = Modifier
                                .size(20.dp)
                                .tapSettleClickable(withRipple = true, onClickLabel = "Edit note", onClick = onEditNote),
                        )
                    }
                    if (onRemove != null) {
                        Spacer(Modifier.height(AltusDimens.space2))
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = "Remove",
                            tint = tokens.ink400,
                            modifier = Modifier
                                .size(20.dp)
                                .tapSettleClickable(withRipple = true, onClickLabel = "Remove", onClick = onRemove),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CheckToggle(done: Boolean, busy: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .size(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (done) tokens.success.wash else tokens.sunken)
            .border(AltusDimens.hairline, if (done) tokens.success.color else tokens.hairline, RoundedCornerShape(8.dp))
            .tapSettleClickable(enabled = !busy, withRipple = true, onClickLabel = if (done) "Mark not done" else "Mark done", onClick = onToggle),
        contentAlignment = Alignment.Center,
    ) {
        when {
            busy -> CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = tokens.ink400)
            done -> Icon(imageVector = Icons.Filled.Check, contentDescription = null, tint = tokens.success.color, modifier = Modifier.size(16.dp))
            else -> Unit
        }
    }
}

// ─── Composer ─────────────────────────────────────────────────────────────────

@Composable
private fun PersonalComposer(
    value: String,
    adding: Boolean,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = currentHaptics()
    val canAdd = value.isNotBlank() && !adding
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        AltusTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            label = "Add something you'll get done today",
            placeholder = "A commitment for today",
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (canAdd) { haptics.commitTick(); onAdd() } }),
        )
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(AltusShapeTokens.pill)
                .background(if (canAdd) MaterialTheme.colorScheme.primary else AltusTheme.tokens.ink300)
                .tapSettleClickable(enabled = canAdd, withRipple = true, onClickLabel = "Add", onClick = { haptics.commitTick(); onAdd() }),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedContent(targetState = adding, label = "AddMorph") { isAdding ->
                if (isAdding) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Icon(imageVector = Icons.Filled.Add, contentDescription = "Add", tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(22.dp))
                }
            }
        }
    }
}

// ─── Pullable goal ──────────────────────────────────────────────────────────────

@Composable
private fun PullableGoalCard(
    goal: PullableGoalRow,
    pending: Boolean,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth().padding(bottom = AltusDimens.space2), accentKeyline = tokens.accents.goals) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(text = goal.title, style = AltusType.heading, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (goal.meta != null) {
                    Text(text = goal.meta, style = AltusType.label, color = tokens.ink400, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(AltusDimens.space3))
            AltusGhostButton(
                text = "Add",
                onClick = onAdd,
                enabled = !pending,
                height = 36.dp,
                leadingIcon = if (pending) null else Icons.Filled.Add,
            )
        }
    }
}

// ─── Note-editor sheet ──────────────────────────────────────────────────────────

@Composable
private fun NoteSheet(draft: NoteDraft, onIntent: (DailyChecklistIntent) -> Unit) {
    val sheetState = rememberAltusSheetState()
    AltusBottomSheet(
        state = sheetState,
        onDismissRequest = { onIntent(DailyChecklistIntent.DismissNote) },
        peekHeight = 280.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(top = AltusDimens.space3, bottom = AltusDimens.space5),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
        ) {
            Text(text = "Add a note", style = AltusType.title2, color = MaterialTheme.colorScheme.onSurface)
            AltusTextField(
                value = draft.text,
                onValueChange = { onIntent(DailyChecklistIntent.NoteChanged(it)) },
                label = "Note",
                placeholder = "What happened…",
                singleLine = false,
                enabled = !draft.submitting,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Default),
            )
            AltusPrimaryButton(text = "Save", onClick = { onIntent(DailyChecklistIntent.SaveNote) }, loading = draft.submitting)
        }
    }
}

// ─── Message banner ───────────────────────────────────────────────────────────

@Composable
private fun MessageBanner(message: String?, onShown: () -> Unit, modifier: Modifier = Modifier) {
    if (message == null) return
    val tokens = AltusTheme.tokens
    LaunchedEffect(message) {
        kotlinx.coroutines.delay(3500)
        onShown()
    }
    Box(modifier = modifier.fillMaxWidth().padding(AltusDimens.screenGutter)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(AltusShapeTokens.input)
                .background(tokens.danger.wash)
                .tapSettleClickable(withRipple = false, onClickLabel = "Dismiss", onClick = onShown)
                .padding(AltusDimens.space3),
        ) {
            Text(text = message, style = AltusType.body, color = tokens.danger.color)
        }
    }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

@Composable
private fun ChecklistSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
    ) {
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(140.dp), shape = AltusShapeTokens.card)
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(72.dp), shape = AltusShapeTokens.card)
        repeat(4) {
            Row(modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
                    SkeletonLine(width = 200.dp, height = 16.dp)
                    SkeletonLine(width = 120.dp, height = 12.dp)
                }
            }
        }
    }
}

private val NoteIcon = androidx.compose.ui.graphics.vector.ImageVector.Builder(
    name = "DailyChecklist.Note",
    defaultWidth = 24.dp,
    defaultHeight = 24.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
).apply {
    addPath(
        pathData = androidx.compose.ui.graphics.vector.addPathNodes("M4 4h11l5 5v11H4z M15 4v5h5 M9 13h6 M9 17h6"),
        fill = null,
        stroke = androidx.compose.ui.graphics.SolidColor(androidx.compose.ui.graphics.Color.Black),
        strokeLineWidth = 2f,
        strokeLineCap = androidx.compose.ui.graphics.StrokeCap.Round,
        strokeLineJoin = androidx.compose.ui.graphics.StrokeJoin.Round,
    )
}.build()
