package com.altuscorp.altus.feature.myday

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.collections.immutable.ImmutableList
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.StatusPill
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The WMS My Day — web parity with `app/(app)/tasks/agenda/page.tsx`'s Agenda
 * view (`components/tasks/my-day-workspace.tsx` + `agenda-board.tsx`): the
 * doer's own tasks bucketed by urgency — Overdue, Due Today, Upcoming — each a
 * [SectionHeader] with a mono count over its own cards. No drag-to-reschedule
 * (mobile has no pointer-drag surface); a per-card quick-status pill takes its
 * place — tap it to commit `allowedTransitions[0]`, the same one-step advance
 * the Tasks tab's swipe performs. Content-only: [com.altuscorp.altus.feature.wms.WmsShell]
 * owns the status-bar inset and the bottom pill nav.
 */
@Composable
fun WmsMyDayScreen(
    onOpenTask: (taskId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WmsMyDayViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = currentHaptics()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                WmsMyDayEffect.Committed -> haptics.commitTick()
                WmsMyDayEffect.Rejected -> haptics.gateUhUh()
            }
        }
    }

    WmsMyDayContent(
        state = state,
        onIntent = viewModel::onIntent,
        onOpenTask = onOpenTask,
        modifier = modifier,
    )
}

@Composable
private fun WmsMyDayContent(
    state: WmsMyDayUiState,
    onIntent: (WmsMyDayIntent) -> Unit,
    onOpenTask: (taskId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        when {
            state.isLoading && !state.contentLoaded -> WmsMyDaySkeleton()
            state.loadFailed && !state.contentLoaded -> ColdError(onRetry = { onIntent(WmsMyDayIntent.Retry) })
            else -> WmsMyDayLedger(state = state, onIntent = onIntent, onOpenTask = onOpenTask)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WmsMyDayLedger(
    state: WmsMyDayUiState,
    onIntent: (WmsMyDayIntent) -> Unit,
    onOpenTask: (taskId: String) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(WmsMyDayIntent.Refresh) },
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
            contentPadding = PaddingValues(
                top = AltusDimens.space4,
                bottom = AltusDimens.space12,
            ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "header", contentType = "header") {
                MyDayHeader(
                    dateLabel = state.dateLabel,
                    totalCount = state.totalCount,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            item(key = "banner", contentType = "banner") {
                BannerRow(
                    message = state.bannerMessage,
                    onDismiss = { onIntent(WmsMyDayIntent.DismissBanner) },
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            if (!state.hasAnyTasks) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "All clear.",
                        body = "Nothing on your plate for today.",
                    )
                }
            } else {
                bucket(
                    key = "overdue",
                    label = "Overdue",
                    rows = state.overdueTasks,
                    danger = true,
                    onOpenTask = onOpenTask,
                    onAdvance = { onIntent(WmsMyDayIntent.Advance(it)) },
                )
                bucket(
                    key = "due-today",
                    label = "Due Today",
                    rows = state.dueTodayTasks,
                    danger = false,
                    onOpenTask = onOpenTask,
                    onAdvance = { onIntent(WmsMyDayIntent.Advance(it)) },
                )
                bucket(
                    key = "upcoming",
                    label = "Upcoming",
                    rows = state.upcomingTasks,
                    danger = false,
                    onOpenTask = onOpenTask,
                    onAdvance = { onIntent(WmsMyDayIntent.Advance(it)) },
                )
            }
        }
    }
}

/** One lifecycle bucket: a [SectionHeader] (skipped entirely when empty) + its cards. */
private fun LazyListScope.bucket(
    key: String,
    label: String,
    rows: ImmutableList<WmsMyDayTaskRow>,
    danger: Boolean,
    onOpenTask: (String) -> Unit,
    onAdvance: (String) -> Unit,
) {
    if (rows.isEmpty()) return
    item(key = "$key-header", contentType = "section-header") {
        SectionHeader(
            title = label,
            count = "${rows.size}",
            modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
        )
    }
    items(
        items = rows,
        key = { it.id },
        contentType = { "agenda-task" },
    ) { row ->
        MyDayTaskCard(
            row = row,
            danger = danger,
            onOpen = { onOpenTask(row.id) },
            onAdvance = { onAdvance(row.id) },
            modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
        )
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun MyDayHeader(
    dateLabel: String,
    totalCount: Int,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "WMS / MY DAY",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = dateLabel.ifBlank { "Your day, in order" },
            style = AltusType.display,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = if (totalCount == 1) "1 task in view" else "$totalCount tasks in view",
            style = AltusType.label,
            color = tokens.ink400,
            maxLines = 1,
        )
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
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
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
        }
    }
}

// ─── Agenda task card ───────────────────────────────────────────────────────

@Composable
private fun MyDayTaskCard(
    row: WmsMyDayTaskRow,
    danger: Boolean,
    onOpen: () -> Unit,
    onAdvance: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier,
        onClick = onOpen,
        accentKeyline = if (danger) tokens.danger.color else tokens.accents.tasks,
    ) {
        if (row.task.taskNo != null) {
            Text(
                text = "#${row.task.taskNo}",
                style = AltusType.monoData,
                color = tokens.ink400,
                maxLines = 1,
            )
            Spacer(Modifier.height(2.dp))
        }
        Text(
            text = row.task.title,
            style = AltusType.heading,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (row.meta != null) {
            Spacer(Modifier.height(2.dp))
            Text(
                text = row.meta,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusPill(display = row.display)
            Spacer(Modifier.width(AltusDimens.space2))
            if (row.duePhrase.isNotBlank()) {
                Text(
                    text = row.duePhrase,
                    style = AltusType.monoData,
                    color = if (row.isOverdue) tokens.danger.color else tokens.ink400,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.weight(1f))
            if (row.canAdvance) {
                QuickStatusPill(label = row.advanceLabel.orEmpty(), onClick = onAdvance)
            }
        }
    }
}

/** The mobile stand-in for the web board's drag-to-reschedule: tap to advance
 *  one step (`allowedTransitions[0]`), labelled with the server's own status name. */
@Composable
private fun QuickStatusPill(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .border(1.dp, scheme.primary.copy(alpha = 0.4f), AltusShapeTokens.pill)
            .clickable(onClickLabel = "Mark $label", role = Role.Button, onClick = onClick)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = WmsMyDayIcons.ArrowRight,
            contentDescription = null,
            tint = scheme.primary,
            modifier = Modifier.height(14.dp).width(14.dp),
        )
        Text(text = label, style = AltusType.label, color = scheme.primary, maxLines = 1)
    }
}

// ─── Cold states ────────────────────────────────────────────────────────────────

@Composable
private fun ColdError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load My Day.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

@Composable
private fun WmsMyDaySkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space4),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(64.dp))
        repeat(4) { SkeletonBox(modifier = Modifier.fillMaxWidth().height(96.dp)) }
    }
}

// ─── Screen-local iconography (Lucide, 2dp stroke, round caps) ──────────────────

private object WmsMyDayIcons {
    val ArrowRight: ImageVector by lazy { lucide("MyDay.ArrowRight", "M5 12h14", "M12 5l7 7-7 7") }

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
