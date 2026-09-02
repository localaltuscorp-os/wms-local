@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.tasks.list

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusChip
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.tapSettle
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.toImmutableList

/**
 * S6 Task List — the Tasks tab root and the target of every Today pressure
 * card. Pinned header (title + a 44dp evergreen **New task** pill, no FAB) over
 * an expanding search and the four counted filter chips; a `LazyColumn` of
 * 96dp cards with `key`/`contentType`/`animateItem` (overdue gravity), the
 * Completed section collapsed. Swipe-to-advance lives on the card.
 *
 * Matches the NavHost signature: `TaskListScreen(filter, onOpenTask, onNewTask)`.
 */
@Composable
fun TaskListScreen(
    filter: String?,
    onOpenTask: (id: String) -> Unit,
    onNewTask: () -> Unit,
    viewModel: TaskListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = currentHaptics()
    val tokens = AltusTheme.tokens

    // Seed the chip pre-selection from the deep-link filter once.
    LaunchedEffect(filter) { viewModel.applyInitialFilter(filter) }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                TaskListEffect.Committed -> haptics.commitTick()
                is TaskListEffect.Rejected -> haptics.gateUhUh()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        TaskListHeader(
            searchActive = state.searchActive,
            query = state.query,
            onToggleSearch = { viewModel.onIntent(TaskListIntent.SearchToggled) },
            onQueryChange = { viewModel.onIntent(TaskListIntent.QueryChanged(it)) },
            onNewTask = onNewTask,
        )

        if (!state.loading) {
            FilterChipRow(
                filter = state.filter,
                counts = state.counts,
                onSelect = { viewModel.onIntent(TaskListIntent.FilterSelected(it)) },
            )
        }

        BannerRow(
            message = state.bannerMessage,
            onDismiss = { viewModel.onIntent(TaskListIntent.DismissBanner) },
        )

        val visibleRows = remember(state.pending, state.completed, state.filter) {
            when (state.filter) {
                TaskFilter.All, TaskFilter.Pending -> state.pending
                TaskFilter.Overdue -> state.pending.filter { it.isOverdue }.toImmutableList()
                TaskFilter.Done -> state.completed
            }
        }
        val showCompletedSection = state.filter == TaskFilter.All && state.completed.isNotEmpty()
        val isEmpty = visibleRows.isEmpty() && !showCompletedSection

        val pullState = rememberPullToRefreshState()
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.onIntent(TaskListIntent.Refresh) },
            state = pullState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            indicator = {
                PullToRefreshDefaults.Indicator(
                    state = pullState,
                    isRefreshing = state.isRefreshing,
                    modifier = Modifier.align(Alignment.TopCenter),
                    containerColor = tokens.raised,
                    color = MaterialTheme.colorScheme.primary,
                )
            },
        ) {
            when {
                state.loading -> TaskListSkeleton(
                    modifier = Modifier.fillMaxSize(),
                )

                isEmpty -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    FilterEmptyState(
                        filter = state.filter,
                        onNewTask = onNewTask,
                        onShowAll = { viewModel.onIntent(TaskListIntent.FilterSelected(TaskFilter.All)) },
                    )
                }

                else -> TaskListBody(
                    rows = visibleRows,
                    completed = state.completed,
                    completedExpanded = state.completedExpanded,
                    showCompletedSection = showCompletedSection,
                    onOpenTask = onOpenTask,
                    onAdvance = { viewModel.onIntent(TaskListIntent.Advance(it)) },
                    onToggleCompleted = { viewModel.onIntent(TaskListIntent.CompletedToggled) },
                )
            }
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun TaskListHeader(
    searchActive: Boolean,
    query: String,
    onToggleSearch: () -> Unit,
    onQueryChange: (String) -> Unit,
    onNewTask: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val focusManager = LocalFocusManager.current
    val searchFocus = remember { FocusRequester() }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space3, bottom = AltusDimens.space2),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().height(48.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
        ) {
            Text(
                text = "Tasks",
                style = AltusType.title1,
                color = scheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            IconTapTarget(
                icon = if (searchActive) TaskListIcons.Close else TaskListIcons.Search,
                contentDescription = if (searchActive) "Close search" else "Search tasks",
                onClick = onToggleSearch,
            )
            AltusPrimaryButton(
                text = "New task",
                onClick = onNewTask,
                leadingIcon = TaskListIcons.Plus,
                height = 44.dp,
                fillMaxWidth = false,
            )
        }

        AnimatedVisibility(
            visible = searchActive,
            enter = expandVertically() + fadeIn(),
            exit = shrinkVertically() + fadeOut(),
        ) {
            LaunchedEffect(Unit) { searchFocus.requestFocus() }
            AltusTextField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = "Search by title, client or #no",
                leadingIcon = TaskListIcons.Search,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = AltusDimens.space3)
                    .focusRequester(searchFocus),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
            )
        }
    }
}

@Composable
private fun IconTapTarget(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .size(AltusDimens.touchMin)
            .tapSettle(interaction)
            .clip(CircleShape)
            .clickable(
                interactionSource = interaction,
                indication = ripple(bounded = false),
                role = Role.Button,
                onClickLabel = contentDescription,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(24.dp),
        )
    }
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

@Composable
private fun FilterChipRow(
    filter: TaskFilter,
    counts: FilterCounts,
    onSelect: (TaskFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = currentHaptics()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(bottom = AltusDimens.space2),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        TaskFilter.entries.forEach { chip ->
            AltusChip(
                label = chip.label,
                selected = chip == filter,
                count = counts.forFilter(chip).toString(),
                onClick = {
                    if (chip != filter) haptics.commitTick()
                    onSelect(chip)
                },
            )
        }
    }
}

// ─── Banner ───────────────────────────────────────────────────────────────────

@Composable
private fun BannerRow(
    message: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AnimatedVisibility(
        visible = message != null,
        enter = expandVertically(tween(200)) + fadeIn(tween(200)),
        exit = shrinkVertically(tween(150)) + fadeOut(tween(150)),
    ) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(bottom = AltusDimens.space2)
                .clip(AltusShapeTokens.input)
                .background(tokens.warn.wash)
                .clickable(onClickLabel = "Dismiss", onClick = onDismiss)
                .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = message.orEmpty(),
                style = AltusType.label,
                color = tokens.warn.color,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = TaskListIcons.Close,
                contentDescription = "Dismiss",
                tint = tokens.warn.color,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

// ─── List body ─────────────────────────────────────────────────────────────────

@Composable
private fun TaskListBody(
    rows: ImmutableList<TaskRow>,
    completed: ImmutableList<TaskRow>,
    completedExpanded: Boolean,
    showCompletedSection: Boolean,
    onOpenTask: (String) -> Unit,
    onAdvance: (String) -> Unit,
    onToggleCompleted: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AltusDimens.screenGutter,
            end = AltusDimens.screenGutter,
            top = AltusDimens.space2,
            bottom = AltusDimens.space12,
        ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        items(
            items = rows,
            key = { it.id },
            contentType = { "task" },
        ) { row ->
            TaskCard(
                row = row,
                onOpen = { onOpenTask(row.id) },
                onAdvance = { onAdvance(row.id) },
                modifier = Modifier.animateItem(),
            )
        }

        if (showCompletedSection) {
            item(key = "completed-header", contentType = "completed-header") {
                CompletedHeader(
                    count = completed.size,
                    expanded = completedExpanded,
                    onToggle = onToggleCompleted,
                    modifier = Modifier.animateItem(),
                )
            }
            if (completedExpanded) {
                items(
                    items = completed,
                    key = { "done-${it.id}" },
                    contentType = { "task-done" },
                ) { row ->
                    TaskCard(
                        row = row,
                        onOpen = { onOpenTask(row.id) },
                        onAdvance = { onAdvance(row.id) },
                        modifier = Modifier.animateItem(),
                    )
                }
            }
        }
    }
}

@Composable
private fun CompletedHeader(
    count: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = AltusDimens.space3)
            .clip(AltusShapeTokens.input)
            .tapSettle(interaction)
            .clickable(
                interactionSource = interaction,
                indication = ripple(),
                role = Role.Button,
                onClickLabel = if (expanded) "Collapse completed" else "Expand completed",
                onClick = onToggle,
            )
            .padding(vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Text(
            text = "COMPLETED",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = count.toString(),
            style = AltusType.monoData,
            color = tokens.ink400,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = if (expanded) TaskListIcons.ChevronDown else TaskListIcons.ChevronRight,
            contentDescription = null,
            tint = tokens.ink400,
            modifier = Modifier.size(20.dp),
        )
    }
}

// ─── Empty + skeleton ───────────────────────────────────────────────────────

@Composable
private fun FilterEmptyState(
    filter: TaskFilter,
    onNewTask: () -> Unit,
    onShowAll: () -> Unit,
) {
    when (filter) {
        TaskFilter.All -> EmptyState(
            headline = "All clear.",
            body = "Nothing on your plate right now.",
            actionLabel = "Create a task",
            onAction = onNewTask,
        )

        TaskFilter.Pending -> EmptyState(
            headline = "Nothing pending.",
            body = "You're all caught up.",
            actionLabel = "Create a task",
            onAction = onNewTask,
        )

        TaskFilter.Overdue -> EmptyState(
            headline = "Nothing overdue.",
            body = "You're on top of it.",
            actionLabel = "Show all tasks",
            onAction = onShowAll,
        )

        TaskFilter.Done -> EmptyState(
            headline = "Nothing done yet.",
            body = "Completed tasks land here.",
            actionLabel = "Show all tasks",
            onAction = onShowAll,
        )
    }
}

@Composable
private fun TaskListSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space2),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        repeat(6) {
            TaskCardSkeleton()
        }
        Spacer(Modifier.height(AltusDimens.space4))
    }
}

// ─── Icons (Lucide, 2dp round stroke — matches the app's icon voice) ────────

internal object TaskListIcons {
    val Plus: ImageVector by lazy { lucide("Tasks.Plus", "M12 5v14", "M5 12h14") }
    val Search: ImageVector by lazy {
        lucide("Tasks.Search", "M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16", "M21 21l-4.35-4.35")
    }
    val Close: ImageVector by lazy { lucide("Tasks.Close", "M18 6L6 18", "M6 6l12 12") }
    val ChevronRight: ImageVector by lazy { lucide("Tasks.ChevronRight", "M9 18l6-6-6-6") }
    val ChevronDown: ImageVector by lazy { lucide("Tasks.ChevronDown", "M6 9l6 6 6-6") }
    val ArrowRight: ImageVector by lazy { lucide("Tasks.ArrowRight", "M5 12h14", "M12 5l7 7-7 7") }

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
