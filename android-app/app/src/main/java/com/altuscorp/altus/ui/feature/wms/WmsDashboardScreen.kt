@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.wms

import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.StatusPill
import com.altuscorp.altus.domain.model.AdminTaskStats
import com.altuscorp.altus.domain.model.TopPerformer
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList

/**
 * The WMS Dashboard — the workspace landing (web parity with
 * `app/(app)/dashboard/page.tsx`). A calm ledger, not a feed: a greeting, the
 * pending/overdue task-pressure pair, the daily-compliance ring, the single
 * weekly-goals gate banner, and the "Today" list (the doer's overdue + due-today
 * tasks). Altus-red (`primary`) on the light canvas; green reserved for
 * complete/success. Content-only: [WmsShell] owns the status-bar inset and the
 * bottom pill nav, so this screen never applies `statusBarsPadding` itself.
 */
@Composable
fun WmsDashboardScreen(
    onOpenTask: (taskId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WmsDashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    WmsDashboardContent(
        state = state,
        onIntent = viewModel::onIntent,
        onOpenTask = onOpenTask,
        modifier = modifier,
    )
}

@Composable
private fun WmsDashboardContent(
    state: WmsDashboardUiState,
    onIntent: (WmsDashboardIntent) -> Unit,
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
            state.isLoading && !state.contentLoaded -> WmsDashboardSkeleton()
            state.loadFailed && !state.contentLoaded -> ColdError(onRetry = { onIntent(WmsDashboardIntent.Retry) })
            else -> WmsDashboardLedger(state = state, onIntent = onIntent, onOpenTask = onOpenTask)
        }
    }
}

@Composable
private fun WmsDashboardLedger(
    state: WmsDashboardUiState,
    onIntent: (WmsDashboardIntent) -> Unit,
    onOpenTask: (taskId: String) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(WmsDashboardIntent.Refresh) },
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
            item(key = "greeting", contentType = "greeting") {
                GreetingHeader(
                    greeting = state.greeting,
                    dateLabel = state.dateLabel,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            item(key = "pressure", contentType = "pressure") {
                TaskPressureRow(
                    pending = state.pending,
                    overdue = state.overdue,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            // Admin-only org-wide analytics (web-parity): the completion-rate
            // hero with a segmented task-mix bar, the 6 colour-coded KPI tiles,
            // and the top-performers rail.
            state.adminStats?.let { stats ->
                item(key = "completion-hero", contentType = "completion-hero") {
                    CompletionHero(stats = stats, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                }
                item(key = "task-mix", contentType = "task-mix") {
                    TaskMixCard(stats = stats, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                }
                item(key = "admin-kpi", contentType = "admin-kpi") {
                    AdminKpiGrid(stats = stats, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                }
            }

            if (state.topPerformers.isNotEmpty()) {
                item(key = "performers-header", contentType = "section-header") {
                    SectionHeader(
                        title = "Top performers",
                        count = null,
                        modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                    )
                }
                item(key = "performers-rail", contentType = "performers-rail") {
                    TopPerformersRail(performers = state.topPerformers)
                }
            }

            item(key = "compliance", contentType = "compliance") {
                val compliance = state.compliance
                if (compliance != null) {
                    ComplianceCard(
                        compliance = compliance,
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

            if (state.goalsUnfilled > 0) {
                item(key = "goals-gate", contentType = "goals-gate") {
                    GoalsGateBanner(
                        unfilled = state.goalsUnfilled,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            item(key = "today-header", contentType = "section-header") {
                SectionHeader(
                    title = "Today",
                    count = if (state.todayLoading) null else state.todayTasks.size.toString(),
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            when {
                state.todayLoading -> {
                    item(key = "today-skeleton", contentType = "today-skeleton") {
                        Column(
                            modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
                        ) {
                            repeat(3) {
                                SkeletonBox(modifier = Modifier.fillMaxWidth().height(84.dp))
                            }
                        }
                    }
                }

                state.todayTasks.isEmpty() -> {
                    item(key = "today-empty", contentType = "today-empty") {
                        EmptyState(
                            headline = "All clear.",
                            body = "Nothing overdue or due today — nice.",
                        )
                    }
                }

                else -> items(
                    items = state.todayTasks,
                    key = { it.id },
                    contentType = { "today-task" },
                ) { row ->
                    TodayTaskCard(
                        row = row,
                        onOpen = { onOpenTask(row.id) },
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }
        }
    }
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

@Composable
private fun GreetingHeader(
    greeting: String,
    dateLabel: String,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "WMS / DASHBOARD",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = greeting.ifBlank { "Your day, in order" },
            style = AltusType.display,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = dateLabel,
            style = AltusType.label,
            color = tokens.ink400,
            maxLines = 1,
        )
    }
}

// ─── Task pressure (two half-width stat cards) ──────────────────────────────────

@Composable
private fun TaskPressureRow(
    pending: Int,
    overdue: Int,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        PressureCard(
            eyebrow = "Pending",
            value = pending,
            danger = false,
            modifier = Modifier.weight(1f),
        )
        PressureCard(
            eyebrow = "Overdue",
            value = overdue,
            danger = overdue > 0,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun PressureCard(
    eyebrow: String,
    value: Int,
    danger: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val valueColor = if (danger) tokens.danger.color else MaterialTheme.colorScheme.onSurface
    AltusCard(
        modifier = modifier,
        accentKeyline = if (danger) tokens.danger.color else tokens.accents.tasks,
    ) {
        Text(
            text = eyebrow.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = "$value",
            style = AltusType.numeralStat,
            color = valueColor,
            maxLines = 1,
        )
    }
}

// ─── Completion hero (Altus-red gradient + animated count-up) ───────────────────

@Composable
private fun CompletionHero(
    stats: AdminTaskStats,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    // Count-up: hold at 0, then settle on the real value once content arrives, so
    // the number rolls up on first paint (and re-rolls if the data changes).
    var target by remember { mutableIntStateOf(0) }
    LaunchedEffect(stats.completionPct) { target = stats.completionPct }
    val animatedPct by animateIntAsState(
        targetValue = target,
        animationSpec = tween(durationMillis = 900),
        label = "completionPct",
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AltusDimens.radiusHero))
            .background(
                Brush.linearGradient(
                    colors = listOf(scheme.primary, tokens.deep),
                ),
            )
            .padding(AltusDimens.space5),
    ) {
        Column(Modifier.fillMaxWidth()) {
            Text(
                text = "COMPLETION RATE",
                style = AltusType.caption,
                color = tokens.onDeepSecondary,
                maxLines = 1,
            )
            Spacer(Modifier.height(AltusDimens.space2))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    text = "$animatedPct",
                    style = AltusType.numeralHero,
                    color = tokens.onDeep,
                    maxLines = 1,
                )
                Text(
                    text = "%",
                    style = AltusType.display,
                    color = tokens.onDeep.copy(alpha = 0.85f),
                    modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
                )
                Spacer(Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${stats.done}",
                        style = AltusType.numeralStat,
                        color = tokens.onDeep,
                        maxLines = 1,
                    )
                    Text(
                        text = "of ${stats.total} done",
                        style = AltusType.monoData,
                        color = tokens.onDeepSecondary,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

// ─── Task-mix card (segmented distribution bar + legend) ────────────────────────

private data class MixSegment(val label: String, val value: Int, val color: Color)

@Composable
private fun TaskMixCard(
    stats: AdminTaskStats,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    // The distribution segments (Total is the denominator, not a slice). Any
    // remainder — on-hold, cancelled, follow-up tiers — reads as "Other".
    val known = stats.done + stats.pending + stats.notStarted + stats.needInfo + stats.notApproved
    val other = (stats.total - known).coerceAtLeast(0)
    val segments = listOf(
        MixSegment("Done", stats.done, tokens.success.color),
        MixSegment("Pending", stats.pending, tokens.info.color),
        MixSegment("Not started", stats.notStarted, tokens.ink400),
        MixSegment("Need info", stats.needInfo, tokens.warn.color),
        MixSegment("Not approved", stats.notApproved, tokens.danger.color),
        MixSegment("Other", other, tokens.ink300),
    ).filter { it.value > 0 }

    AltusCard(modifier = modifier) {
        Text(
            text = "TASK MIX",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space3))
        // The segmented bar — weighted, rounded, gapless. Pure layout (no Canvas)
        // so it stays cheap to compose while scrolling.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(12.dp)
                .clip(RoundedCornerShape(6.dp)),
        ) {
            if (segments.isEmpty()) {
                Box(Modifier.fillMaxSize().background(tokens.hairline))
            } else {
                segments.forEach { seg ->
                    Box(
                        Modifier
                            .weight(seg.value.toFloat())
                            .fillMaxSize()
                            .background(seg.color),
                    )
                }
            }
        }

        Spacer(Modifier.height(AltusDimens.space3))
        // Legend — two-column flow of coloured dots + label · count.
        Column(verticalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            segments.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3)) {
                    pair.forEach { seg -> LegendItem(seg, Modifier.weight(1f)) }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun LegendItem(seg: MixSegment, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(seg.color))
        Spacer(Modifier.width(AltusDimens.space2))
        Text(
            text = seg.label,
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Spacer(Modifier.width(AltusDimens.space1))
        Text(
            text = "${seg.value}",
            style = AltusType.bodyStrong,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Admin KPI strip (6 colour-coded tiles, 2 per row) ──────────────────────────

private data class KpiTile(val label: String, val value: Int, val dot: Color)

@Composable
private fun AdminKpiGrid(
    stats: AdminTaskStats,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val tiles = listOf(
        KpiTile("Total", stats.total, scheme.primary),
        KpiTile("Need Info", stats.needInfo, tokens.warn.color),
        KpiTile("Not Approved", stats.notApproved, tokens.danger.color),
        KpiTile("Done", stats.done, tokens.success.color),
        KpiTile("Pending", stats.pending, tokens.info.color),
        KpiTile("Not Started", stats.notStarted, tokens.ink400),
    )
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap)) {
        tiles.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap)) {
                pair.forEach { tile -> KpiTileCard(tile, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KpiTileCard(tile: KpiTile, modifier: Modifier = Modifier) {
    AltusCard(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(tile.dot))
            Spacer(Modifier.width(AltusDimens.space2))
            Text(
                text = tile.label.uppercase(),
                style = AltusType.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = "${tile.value}",
            style = AltusType.numeralStat,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Top-performers rail (horizontal, ranked avatar cards) ──────────────────────

@Composable
private fun TopPerformersRail(
    performers: ImmutableList<TopPerformer>,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = AltusDimens.screenGutter),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        itemsIndexed(
            items = performers,
            key = { _, p -> p.name },
            contentType = { _, _ -> "performer" },
        ) { index, p ->
            PerformerCard(rank = index + 1, performer = p)
        }
    }
}

@Composable
private fun PerformerCard(rank: Int, performer: TopPerformer) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    // #1 gets the gold nod; the rest wear the brand tint.
    val avatarColor = if (rank == 1) tokens.zest else scheme.primary
    AltusCard(modifier = Modifier.width(150.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(contentAlignment = Alignment.Center) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(avatarColor.copy(alpha = 0.16f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initialsOf(performer.name),
                        style = AltusType.bodyStrong,
                        color = if (rank == 1) tokens.warn.color else scheme.primary,
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.width(AltusDimens.space2))
            Text(
                text = "#$rank",
                style = AltusType.monoData,
                color = tokens.ink400,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = performer.name,
            style = AltusType.bodyStrong,
            color = scheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = "${performer.done} done · 30d",
            style = AltusType.monoData,
            color = tokens.ink400,
            maxLines = 1,
        )
    }
}

private fun initialsOf(name: String): String {
    val parts = name.trim().split(" ").filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(2).uppercase()
        else -> "${parts.first().first()}${parts.last().first()}".uppercase()
    }
}

// ─── Daily compliance ───────────────────────────────────────────────────────────

@Composable
private fun ComplianceCard(
    compliance: WmsCompliance,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier, accentKeyline = tokens.accents.dcc) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ComplianceRing(fraction = compliance.fraction, complete = compliance.complete, pct = compliance.pct)
            Spacer(Modifier.width(AltusDimens.space4))
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Daily compliance",
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = if (compliance.complete) "Done for today" else "${compliance.filled}/${compliance.due} filled",
                    style = AltusType.monoData,
                    color = if (compliance.complete) tokens.success.color else tokens.ink400,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun ComplianceRing(
    fraction: Float,
    complete: Boolean,
    pct: Int,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val track = tokens.hairline
    val sweepColor = if (complete) tokens.success.color else scheme.primary
    Box(
        modifier = modifier.size(AltusDimens.dccRing),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(AltusDimens.dccRing)) {
            val strokePx = 6.dp.toPx()
            val inset = strokePx / 2f
            val arcSize = Size(size.width - strokePx, size.height - strokePx)
            val topLeft = Offset(inset, inset)
            val style = Stroke(width = strokePx, cap = StrokeCap.Round)
            drawArc(
                color = track,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = style,
            )
            if (fraction > 0.001f) {
                drawArc(
                    color = sweepColor,
                    startAngle = -90f,
                    sweepAngle = 360f * fraction.coerceIn(0f, 1f),
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = style,
                )
            }
        }
        Text(
            text = "$pct%",
            style = AltusType.label,
            color = if (complete) tokens.success.color else scheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Weekly-goals gate banner ───────────────────────────────────────────────────

@Composable
private fun GoalsGateBanner(
    unfilled: Int,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier, accentKeyline = tokens.accents.goals) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = WmsDashboardIcons.Target,
                contentDescription = null,
                tint = tokens.accents.goals,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Set this week's goals",
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "$unfilled still to fill",
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
        }
    }
}

// ─── Today task card ────────────────────────────────────────────────────────────

@Composable
private fun TodayTaskCard(
    row: WmsTodayTaskRow,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier,
        onClick = onOpen,
        accentKeyline = if (row.isOverdue) tokens.danger.color else tokens.accents.tasks,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                if (row.taskNo != null) {
                    Text(
                        text = "#${row.taskNo}",
                        style = AltusType.monoData,
                        color = tokens.ink400,
                        maxLines = 1,
                    )
                    Spacer(Modifier.height(2.dp))
                }
                Text(
                    text = row.title,
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
                Spacer(Modifier.height(AltusDimens.space2))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                ) {
                    StatusPill(display = row.display)
                    if (row.duePhrase.isNotBlank()) {
                        Text(
                            text = row.duePhrase,
                            style = AltusType.monoData,
                            color = if (row.isOverdue) tokens.danger.color else tokens.ink400,
                            maxLines = 1,
                        )
                    }
                }
            }
            Icon(
                imageVector = WmsDashboardIcons.ChevronRight,
                contentDescription = null,
                tint = tokens.ink400,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

// ─── Cold states ────────────────────────────────────────────────────────────────

@Composable
private fun ColdError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load your dashboard.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

@Composable
private fun WmsDashboardSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space4),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(72.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            SkeletonBox(modifier = Modifier.weight(1f).height(96.dp))
            SkeletonBox(modifier = Modifier.weight(1f).height(96.dp))
        }
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(96.dp))
        repeat(3) { SkeletonBox(modifier = Modifier.fillMaxWidth().height(84.dp)) }
    }
}

// ─── Screen-local iconography (Lucide, 2dp stroke, round caps) ──────────────────

private object WmsDashboardIcons {
    val ChevronRight: ImageVector by lazy { lucide("WmsDash.ChevronRight", "M9 18l6-6-6-6") }

    val Target: ImageVector by lazy {
        lucide(
            "WmsDash.Target",
            "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
            "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
            "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
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
