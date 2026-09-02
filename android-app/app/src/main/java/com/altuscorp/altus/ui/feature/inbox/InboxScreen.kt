@file:OptIn(ExperimentalFoundationApi::class)

package com.altuscorp.altus.feature.inbox

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonCircle
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * S10 Inbox — the pushed notification ledger.
 *
 * Anatomy (top to bottom):
 *  1. [AltusTopAppBar] "Inbox" with a back affordance and a "mark all read"
 *     check-check action that appears only while unread items exist.
 *  2. A `LazyColumn` grouped by local day: sticky `caption` [SectionHeader]
 *     eyebrows ("TODAY" / "MON, 30 JUN") over 64dp rows — accent-tinted type
 *     glyph, `body-strong` one-liner + quiet context line, mono time, and the
 *     6dp evergreen unread dot with a `surface` fill (read rows sit on canvas).
 *  3. A footer that fetches older pages on end-of-list reach, shows a spinner
 *     while loading, and offers a calm retry if a page fails.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache and keep
 * the exact resolved geometry (Signature 8). Tapping a row clears its dot
 * optimistically (EFFECT_TICK) and deep-links via the payload's `altus://`
 * route. Pull-to-refresh is evergreen with a CLOCK_TICK when the pull arms.
 */
@Composable
fun InboxScreen(
    onBack: () -> Unit,
    onOpenDeepLink: (uri: String) -> Unit,
    viewModel: InboxViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    InboxContent(
        state = state,
        onBack = onBack,
        onOpenDeepLink = onOpenDeepLink,
        onIntent = viewModel::onIntent,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InboxContent(
    state: InboxUiState,
    onBack: () -> Unit,
    onOpenDeepLink: (uri: String) -> Unit,
    onIntent: (InboxIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Inbox",
            navigationIcon = InboxIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
            actions = {
                if (state.canMarkAll) {
                    IconButton(onClick = { onIntent(InboxIntent.MarkAllRead) }) {
                        Icon(
                            imageVector = InboxIcons.CheckCheck,
                            contentDescription = "Mark all read",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            },
        )
        when {
            state.isLoading && !state.hasContent -> InboxSkeleton()
            state.loadFailed && !state.hasContent -> InboxLoadError(
                onRetry = { onIntent(InboxIntent.Retry) },
            )
            !state.hasContent -> InboxEmpty()
            else -> InboxLedger(
                state = state,
                onRefresh = { onIntent(InboxIntent.Refresh) },
                onLoadMore = { onIntent(InboxIntent.LoadMore) },
                onOpenRow = { row ->
                    haptics.commitTick()
                    onIntent(InboxIntent.MarkRead(row.id))
                    row.deepLink?.let(onOpenDeepLink)
                },
            )
        }
    }
}

// ─── Loaded ledger ────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InboxLedger(
    state: InboxUiState,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenRow: (InboxRow) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    val listState = rememberLazyListState()
    val haptics = currentHaptics()

    // CLOCK_TICK the moment the pull crosses the arm threshold (§1.6).
    LaunchedEffect(pullState, haptics) {
        snapshotFlow { pullState.distanceFraction >= 1f }
            .distinctUntilChanged()
            .filter { it }
            .collect { haptics.clockTick() }
    }

    // Auto-fetch the next older page as the tail comes into view.
    LaunchedEffect(listState, state.hasMore, state.isLoadingMore, state.loadMoreFailed) {
        if (!state.hasMore || state.isLoadingMore || state.loadMoreFailed) return@LaunchedEffect
        snapshotFlow {
            val layout = listState.layoutInfo
            val last = layout.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= layout.totalItemsCount - LOAD_MORE_THRESHOLD
        }
            .distinctUntilChanged()
            .filter { it }
            .collect { onLoadMore() }
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
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
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = AltusDimens.space8),
        ) {
            if (state.refreshFailed) {
                item(key = "stale-banner", contentType = "stale-banner") {
                    StaleBanner(
                        modifier = Modifier.padding(
                            start = AltusDimens.screenGutter,
                            end = AltusDimens.screenGutter,
                            top = AltusDimens.cardGap,
                        ),
                    )
                }
            }

            state.groups.forEach { group ->
                stickyHeader(key = "h-${group.key}", contentType = "day-header") {
                    SectionHeader(title = group.header)
                }
                items(
                    items = group.rows,
                    key = { it.id },
                    contentType = { "inbox-row" },
                ) { row ->
                    InboxRowItem(row = row, onClick = { onOpenRow(row) })
                }
            }

            item(key = "footer", contentType = "footer") {
                InboxFooter(
                    isLoadingMore = state.isLoadingMore,
                    loadMoreFailed = state.loadMoreFailed,
                    hasMore = state.hasMore,
                    onRetry = onLoadMore,
                )
            }
        }
    }
}

// ─── Row ──────────────────────────────────────────────────────────────────────

/**
 * One 64dp inbox row (S10). Unread rows sit on `surface` with the 6dp evergreen
 * dot; read rows blend into canvas. `heightIn` (not a fixed height) so
 * fontScale 1.3× never truncates. Ripple kept (rows, not cards — §1.5).
 */
@Composable
private fun InboxRowItem(
    row: InboxRow,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = row.category.accentColor()
    val rowFill = if (row.isUnread) tokens.surface else tokens.canvas

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(rowFill)
            .tapSettleClickable(withRipple = true, onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(
                    horizontal = AltusDimens.screenGutter,
                    vertical = AltusDimens.space3,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Accent-tinted type glyph in a 40dp 12%-wash container (§1.1).
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(AltusDimens.radiusInput))
                    .background(accent.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = row.category.glyph(),
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(20.dp),
                )
            }

            Spacer(Modifier.width(AltusDimens.space3))

            Column(Modifier.weight(1f)) {
                Text(
                    text = row.title,
                    style = AltusType.bodyStrong,
                    color = if (row.isUnread) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (row.context != null) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(
                        text = row.context,
                        style = AltusType.label,
                        color = tokens.ink400,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Spacer(Modifier.width(AltusDimens.space3))

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = row.timeLabel,
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    maxLines = 1,
                )
                if (row.isUnread) {
                    Spacer(Modifier.height(AltusDimens.space2))
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape),
                    )
                }
            }
        }
        HorizontalDivider(
            modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
            thickness = AltusDimens.hairline,
            color = tokens.hairline,
        )
    }
}

// ─── Footer (pagination) ──────────────────────────────────────────────────────

@Composable
private fun InboxFooter(
    isLoadingMore: Boolean,
    loadMoreFailed: Boolean,
    hasMore: Boolean,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = if (isLoadingMore || loadMoreFailed) 56.dp else AltusDimens.space4)
            .padding(vertical = AltusDimens.space3),
        contentAlignment = Alignment.Center,
    ) {
        when {
            isLoadingMore -> CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = MaterialTheme.colorScheme.primary,
                strokeWidth = 2.dp,
            )
            loadMoreFailed -> Text(
                text = "Couldn't load older — Retry",
                style = AltusType.label,
                color = tokens.danger.color,
                modifier = Modifier
                    .clip(AltusShapeTokens.chip)
                    .tapSettleClickable(withRipple = true, onClick = onRetry)
                    .padding(
                        horizontal = AltusDimens.space3,
                        vertical = AltusDimens.space2,
                    ),
            )
            !hasMore -> Unit
        }
    }
}

// ─── Degraded / empty states ──────────────────────────────────────────────────

/** Empty inbox — the calm "you're clear" state (S10). */
@Composable
private fun InboxEmpty(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        EmptyState(
            headline = "Nothing new.",
            body = "Assignments, mentions and reminders land here.",
        )
    }
}

/** Quiet warn banner when content is on screen but the reconcile failed. */
@Composable
private fun StaleBanner(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.warn.wash)
            .padding(AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Couldn't refresh — showing your last synced inbox.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

/** Cold cache + failed fetch: the calm full-screen retry (never a dead end). */
@Composable
private fun InboxLoadError(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        EmptyState(
            headline = "Couldn't load.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

// ─── Skeleton (Signature 8: exact resolved geometry) ─────────────────────────

private const val SKELETON_ROWS = 8

@Composable
private fun InboxSkeleton(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier.fillMaxSize()) {
        // One day-header silhouette (sticky-safe geometry).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 36.dp)
                .padding(
                    horizontal = AltusDimens.screenGutter,
                    vertical = AltusDimens.space2,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonLine(width = 96.dp, height = 12.dp)
        }

        repeat(SKELETON_ROWS) {
            Column(Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 64.dp)
                        .padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space3,
                        ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SkeletonCircle(diameter = 40.dp)
                    Spacer(Modifier.width(AltusDimens.space3))
                    Column(Modifier.weight(1f)) {
                        SkeletonLine(width = 208.dp)
                        Spacer(Modifier.height(AltusDimens.space1))
                        SkeletonLine(width = 132.dp, height = 10.dp)
                    }
                    Spacer(Modifier.width(AltusDimens.space3))
                    SkeletonLine(width = 40.dp, height = 12.dp)
                }
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    thickness = AltusDimens.hairline,
                    color = tokens.hairline,
                )
            }
        }
    }
}

// ─── Category → accent + glyph (theme-resolved, never a hex here) ─────────────

@Composable
private fun InboxCategory.accentColor(): Color {
    val accents = AltusTheme.tokens.accents
    return when (this) {
        InboxCategory.Task -> accents.tasks
        InboxCategory.Dcc -> accents.dcc
        InboxCategory.Goals -> accents.goals
        InboxCategory.Attendance -> accents.attendance
        InboxCategory.Digest, InboxCategory.General -> accents.dash
    }
}

private fun InboxCategory.glyph(): ImageVector = when (this) {
    InboxCategory.Task -> InboxIcons.CheckSquare
    InboxCategory.Dcc -> InboxIcons.LayoutGrid
    InboxCategory.Goals -> InboxIcons.Target
    InboxCategory.Attendance -> InboxIcons.Clock
    InboxCategory.Digest -> InboxIcons.ListGlyph
    InboxCategory.General -> InboxIcons.Bell
}

private const val LOAD_MORE_THRESHOLD = 3

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object InboxIcons {

    /** lucide `arrow-left`. */
    val ArrowLeft: ImageVector by lazy {
        lucide("Inbox.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5")
    }

    /** lucide `check-check` — mark-all-read. */
    val CheckCheck: ImageVector by lazy {
        lucide("Inbox.CheckCheck", "M18 6 7 17l-5-5", "m22 10-7.5 7.5L13 16")
    }

    /** lucide `square-check` — task notices. */
    val CheckSquare: ImageVector by lazy {
        lucide(
            "Inbox.CheckSquare",
            "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
            "m9 12 2 2 4-4",
        )
    }

    /** lucide `layout-grid` — DCC notices. */
    val LayoutGrid: ImageVector by lazy {
        lucide(
            "Inbox.LayoutGrid",
            "M3 3h7v7H3z",
            "M14 3h7v7h-7z",
            "M14 14h7v7h-7z",
            "M3 14h7v7H3z",
        )
    }

    /** lucide `target` — weekly-goals notices. */
    val Target: ImageVector by lazy {
        lucide(
            "Inbox.Target",
            "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20",
            "M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12",
            "M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4",
        )
    }

    /** lucide `clock` — attendance notices. */
    val Clock: ImageVector by lazy {
        lucide(
            "Inbox.Clock",
            "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20",
            "M12 7v5l3 2",
        )
    }

    /** lucide `list` — digests / overdue roll-ups. */
    val ListGlyph: ImageVector by lazy {
        lucide(
            "Inbox.List",
            "M8 6h13",
            "M8 12h13",
            "M8 18h13",
            "M3 6h.01",
            "M3 12h.01",
            "M3 18h.01",
        )
    }

    /** lucide `bell` — the neutral fallback. */
    val Bell: ImageVector by lazy {
        lucide(
            "Inbox.Bell",
            "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
            "M10.3 21a1.94 1.94 0 0 0 3.4 0",
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
