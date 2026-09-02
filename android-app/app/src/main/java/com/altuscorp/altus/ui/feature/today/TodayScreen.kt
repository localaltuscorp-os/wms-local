@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.today

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.collapsingHeaderOffset
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * S2 — Today, the paced ledger. A fixed-order obligation ledger (never a feed):
 * a collapsing greeting header over the Day Ring hero (the one `deep` card in
 * light mode), the task-pressure stat pair, the DCC compliance card, the single
 * ranked gate banner, and the horizontal module row whose last card sits
 * half-visible (the "more exists" tease). Strip *order* is client-fixed; strip
 * *contents* re-rank (overdue climbs, gates persist until cleared).
 *
 * Cache paints instantly; skeletons appear only on a true cold cache and keep
 * the exact resolved geometry (Signature 8). Pull-to-refresh is evergreen with a
 * CLOCK_TICK the instant the pull arms (§1.6). The Day Strip that docks above
 * the tabs is a sibling ([TodayDayStrip]) the shell mounts — it draws the same
 * [com.altuscorp.altus.ui.designsystem.DayRingState] this hero does.
 */
@Composable
fun TodayScreen(
    onOpenPunch: () -> Unit,
    onOpenPlan: () -> Unit,
    onOpenGoalsFill: () -> Unit,
    onOpenHub: () -> Unit,
    onOpenAttendanceHistory: () -> Unit,
    onOpenInbox: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenTasks: (filter: String?) -> Unit,
    onOpenDcc: () -> Unit,
    viewModel: TodayViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    val onModule: (ModuleId) -> Unit = remember(
        onOpenAttendanceHistory, onOpenTasks, onOpenDcc, onOpenGoalsFill, onOpenInbox, onOpenHub,
    ) {
        { id ->
            when (id) {
                ModuleId.Attendance -> onOpenAttendanceHistory()
                ModuleId.Tasks -> onOpenTasks(null)
                ModuleId.Dcc -> onOpenDcc()
                ModuleId.Goals -> onOpenGoalsFill()
                ModuleId.Inbox -> onOpenInbox()
                ModuleId.More -> onOpenHub()
            }
        }
    }

    TodayContent(
        state = state,
        onIntent = viewModel::onIntent,
        onOpenPunch = onOpenPunch,
        onOpenGoalsFill = onOpenGoalsFill,
        onOpenProfile = onOpenProfile,
        onOpenInbox = onOpenInbox,
        onOpenTasks = onOpenTasks,
        onOpenDcc = onOpenDcc,
        onModule = onModule,
    )
}

@Composable
private fun TodayContent(
    state: TodayUiState,
    onIntent: (TodayIntent) -> Unit,
    onOpenPunch: () -> Unit,
    onOpenGoalsFill: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenInbox: () -> Unit,
    onOpenTasks: (filter: String?) -> Unit,
    onOpenDcc: () -> Unit,
    onModule: (ModuleId) -> Unit,
) {
    val tokens = AltusTheme.tokens

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas)
            .statusBarsPadding(),
    ) {
        when {
            state.isLoading && !state.contentLoaded -> ColdLoad()
            state.loadFailed && !state.contentLoaded -> ColdError(onRetry = { onIntent(TodayIntent.Retry) })
            else -> TodayLedger(
                state = state,
                onIntent = onIntent,
                onOpenPunch = onOpenPunch,
                onOpenGoalsFill = onOpenGoalsFill,
                onOpenProfile = onOpenProfile,
                onOpenInbox = onOpenInbox,
                onOpenTasks = onOpenTasks,
                onOpenDcc = onOpenDcc,
                onModule = onModule,
            )
        }
    }
}

// ─── The loaded ledger ─────────────────────────────────────────────────────────

private val COMPACT_BAR_HEIGHT = 56.dp

@Composable
private fun TodayLedger(
    state: TodayUiState,
    onIntent: (TodayIntent) -> Unit,
    onOpenPunch: () -> Unit,
    onOpenGoalsFill: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenInbox: () -> Unit,
    onOpenTasks: (filter: String?) -> Unit,
    onOpenDcc: () -> Unit,
    onModule: (ModuleId) -> Unit,
) {
    val listState = rememberLazyListState()
    val density = LocalDensity.current
    val collapsePx = with(density) { 96.dp.toPx() }
    val haptics = currentHaptics()

    // Collapse fraction: 0 fully expanded → 1 fully collapsed. Read in a
    // derived state so scrolling never recomposes the whole ledger.
    val collapseFraction by remember {
        derivedStateOf {
            if (listState.firstVisibleItemIndex > 0) {
                1f
            } else {
                (listState.firstVisibleItemScrollOffset / collapsePx).coerceIn(0f, 1f)
            }
        }
    }

    val pullState = rememberPullToRefreshState()
    LaunchedEffect(pullState, haptics) {
        snapshotFlow { pullState.distanceFraction >= 1f }
            .distinctUntilChanged()
            .filter { it }
            .collect { haptics.clockTick() }
    }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { onIntent(TodayIntent.Refresh) },
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
                contentPadding = PaddingValues(bottom = AltusDimens.space12),
                verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
            ) {
                item(key = "header", contentType = "header") {
                    ExpandedHeader(
                        state = state,
                        onOpenProfile = onOpenProfile,
                        modifier = Modifier.collapsingHeaderOffset(
                            scrollPxProvider = {
                                if (listState.firstVisibleItemIndex > 0) collapsePx
                                else listState.firstVisibleItemScrollOffset.toFloat()
                            },
                            collapseRangePx = collapsePx,
                        ),
                    )
                }

                item(key = "hero", contentType = "hero") {
                    TodayHeroCard(
                        state = state,
                        onOpenPunch = onOpenPunch,
                        onOpenGoalsFill = onOpenGoalsFill,
                        onSealShown = { onIntent(TodayIntent.MarkSealShown) },
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }

                if (state.refreshFailed) {
                    item(key = "stale", contentType = "stale") {
                        TodayStaleBanner(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                    }
                }

                item(key = "pressure", contentType = "pressure") {
                    TaskPressureRow(
                        pending = state.pendingTasks,
                        overdue = state.overdueTasks,
                        onOpenTasks = onOpenTasks,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }

                item(key = "dcc", contentType = "dcc") {
                    val dcc = state.dcc
                    if (dcc != null) {
                        DccCard(
                            dcc = dcc,
                            onOpenDcc = onOpenDcc,
                            modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                        )
                    } else {
                        SkeletonBox(
                            modifier = Modifier
                                .padding(horizontal = AltusDimens.screenGutter)
                                .fillMaxWidth()
                                .height(96.dp),
                        )
                    }
                }

                val bannerGate = state.bannerGate
                if (bannerGate != null) {
                    item(key = "gate", contentType = "gate") {
                        GoalsGateBannerCard(
                            gate = bannerGate,
                            onOpenGoalsFill = onOpenGoalsFill,
                            modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                        )
                    }
                }

                item(key = "modules-header", contentType = "section-header") {
                    SectionHeader(
                        title = "Modules",
                        modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                    )
                }

                item(key = "modules", contentType = "modules") {
                    ModuleRow(modules = state.modules, onModule = onModule)
                }
            }
        }

        // The pinned compact bar cross-fades in as the greeting header collapses.
        CompactHeader(
            greeting = state.greeting,
            avatarName = state.avatarName,
            avatarUrl = state.avatarUrl,
            fraction = collapseFraction,
            onOpenProfile = onOpenProfile,
            modifier = Modifier.align(Alignment.TopCenter),
        )
    }
}

// ─── Collapsing header (parallax 0.5×, fades by 60%) ───────────────────────────

@Composable
private fun ExpandedHeader(
    state: TodayUiState,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space5, bottom = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = state.greeting,
                style = AltusType.display,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = state.dateLabel,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
            )
        }
        Avatar(
            name = state.avatarName,
            imageUrl = state.avatarUrl,
            size = 32.dp,
            modifier = Modifier.tapSettleClickable(
                withRipple = true,
                onClickLabel = "Open profile",
                onClick = onOpenProfile,
            ),
        )
    }
}

/** The 56dp pinned bar; background + text fade in with the collapse fraction. */
@Composable
private fun CompactHeader(
    greeting: String,
    avatarName: String,
    avatarUrl: String?,
    fraction: Float,
    onOpenProfile: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = COMPACT_BAR_HEIGHT)
            .graphicsLayer { alpha = fraction }
            .background(tokens.canvas)
            .padding(horizontal = AltusDimens.screenGutter),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = greeting,
            style = AltusType.title2,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Avatar(
            name = avatarName,
            imageUrl = avatarUrl,
            size = 32.dp,
            modifier = Modifier
                .alpha(fraction)
                .tapSettleClickable(
                    enabled = fraction > 0.5f,
                    withRipple = true,
                    onClickLabel = "Open profile",
                    onClick = onOpenProfile,
                ),
        )
    }
}

// ─── Cold-cache states ─────────────────────────────────────────────────────────

@Composable
private fun ColdLoad(modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxSize()) {
        Spacer(Modifier.height(COMPACT_BAR_HEIGHT + AltusDimens.space5))
        TodaySkeleton()
    }
}

@Composable
private fun ColdError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load your day.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}
