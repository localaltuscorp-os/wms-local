package com.altuscorp.altus.feature.team

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.SemanticColor
import kotlinx.collections.immutable.ImmutableList

/**
 * WMS · Team performance — the mobile rendition of the web `/weekly-goals/team`
 * page: who's working, who's blocked, who has no plan, and who's behind — live,
 * today, over the viewer's A-to-Z scoped roster (self → downline → all). A
 * four-tile summary strip over a member-card list, sorted needs-help/behind
 * first then by goal score, mirroring the web exactly. Read-only: unlike the
 * web there is no drill-in to a member's goals or checklist review in this
 * pass. Altus red on light; every colour is a theme token.
 *
 * Matches the NavHost signature: `TeamScreen(onBack, onOpenTask)` (the task
 * callback is unused here — kept so the shared route wiring is untouched).
 */
@Composable
fun TeamScreen(
    onBack: () -> Unit,
    onOpenTask: (id: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: TeamViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Team performance",
            navigationIcon = TeamIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
            actions = {
                RefreshAction(
                    spinning = state.isRefreshing,
                    onClick = { viewModel.onIntent(TeamIntent.Refresh) },
                )
            },
        )

        TeamBody(
            state = state,
            onIntent = viewModel::onIntent,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )
    }
}

/**
 * TEAM PERFORMANCE as a WMS-shell PAGE — the content-only host used by the
 * [com.altuscorp.altus.feature.wms.WmsShell] "Team" pill. Identical board to
 * the standalone [TeamScreen] but WITHOUT the top app bar (the shell's pill
 * bar is the chrome) and WITHOUT [Modifier.statusBarsPadding] (the shell owns
 * the status-bar inset). Its `@HiltViewModel` scopes to the shell's back-stack
 * entry, so pill round-trips swap the view without re-fetching.
 */
@Composable
fun WmsTeamScreen(
    modifier: Modifier = Modifier,
    viewModel: TeamViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    TeamBody(
        state = state,
        onIntent = viewModel::onIntent,
        modifier = modifier.fillMaxSize(),
    )
}

/** Cold-skeleton / cold-error / stale-banner + warm-board state switch, shared by both hosts. */
@Composable
private fun TeamBody(
    state: TeamUiState,
    onIntent: (TeamIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        StaleBanner(visible = state.refreshFailed)

        when {
            state.isLoading -> TeamSkeleton(modifier = Modifier.fillMaxSize())

            state.loadFailed -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                EmptyState(
                    headline = "Couldn't load the team.",
                    body = "Check your connection and try again.",
                    actionLabel = "Retry",
                    onAction = { onIntent(TeamIntent.Retry) },
                )
            }

            state.isEmpty -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                EmptyState(
                    headline = "No team members to show.",
                    body = "Your roster shows up here once you have direct reports.",
                )
            }

            else -> TeamList(
                summary = state.summary,
                members = state.members,
            )
        }
    }
}

// ─── Board ───────────────────────────────────────────────────────────────────

@Composable
private fun TeamList(
    summary: TeamSummary,
    members: ImmutableList<TeamMemberCard>,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AltusDimens.screenGutter,
            end = AltusDimens.screenGutter,
            top = AltusDimens.space3,
            bottom = AltusDimens.space12,
        ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(key = "summary", contentType = "summary") {
            SummaryStrip(summary = summary)
        }

        items(
            items = members,
            key = { it.id },
            contentType = { "member" },
        ) { member ->
            MemberCard(member = member, modifier = Modifier.animateItem())
        }
    }
}

// ─── Summary strip (mirrors the web's four `Stat` tiles) ────────────────────

@Composable
private fun SummaryStrip(summary: TeamSummary, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            SummaryTile(label = "Team", value = summary.teamSize, tone = null, modifier = Modifier.weight(1f))
            SummaryTile(label = "Working now", value = summary.workingNow, tone = tokens.success, modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            SummaryTile(
                label = "No plan today",
                value = summary.noPlanToday,
                tone = if (summary.noPlanToday > 0) tokens.danger else null,
                modifier = Modifier.weight(1f),
            )
            SummaryTile(
                label = "Need help",
                value = summary.needHelp,
                tone = if (summary.needHelp > 0) tokens.warn else null,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun SummaryTile(
    label: String,
    value: Int,
    tone: SemanticColor?,
    modifier: Modifier = Modifier,
) {
    AltusCard(modifier = modifier.fillMaxWidth(), padding = AltusDimens.space3) {
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = value.toString(),
            style = AltusType.title1,
            color = tone?.color ?: MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Member card ─────────────────────────────────────────────────────────────

@Composable
private fun MemberCard(member: TeamMemberCard, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    AltusCard(modifier = modifier.fillMaxWidth()) {
        // Row 1 — avatar, name + status pill, department, goal score.
        Row(verticalAlignment = Alignment.Top) {
            Avatar(name = member.name, imageUrl = member.avatarUrl, size = 44.dp)
            Spacer(Modifier.width(AltusDimens.space3))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = member.name,
                        style = AltusType.heading,
                        color = scheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(AltusDimens.space2))
                    MemberStatusPill(status = member.status)
                }
                Text(
                    text = member.department ?: "—",
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(AltusDimens.space2))
            GoalScoreReadout(pct = member.goalScorePct)
        }

        Spacer(Modifier.height(AltusDimens.space3))

        // Row 2 — the metric grid (mirrors the web's 9-tile `Metric` grid).
        MetricGrid(member = member)

        Spacer(Modifier.height(AltusDimens.space3))

        // Row 3 — in/out times.
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space4)) {
            Text(
                text = "In ${member.lastInLabel ?: "—"}",
                style = AltusType.label,
                color = tokens.ink400,
            )
            Text(
                text = "Out ${member.lastOutLabel ?: "—"}",
                style = AltusType.label,
                color = tokens.ink400,
            )
        }
    }
}

@Composable
private fun GoalScoreReadout(pct: Int?, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val color = when {
        pct == null -> tokens.ink400
        pct >= 80 -> tokens.success.color
        pct >= 60 -> tokens.warn.color
        else -> tokens.danger.color
    }
    Column(modifier = modifier, horizontalAlignment = Alignment.End) {
        Text(
            text = pct?.let { "$it%" } ?: "—",
            style = AltusType.title2,
            color = color,
            maxLines = 1,
        )
        Text(
            text = "GOAL SCORE",
            style = AltusType.caption,
            color = tokens.ink400,
            maxLines = 1,
        )
    }
}

@Composable
private fun MetricGrid(member: TeamMemberCard, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val cells: List<Triple<String, String, SemanticColor?>> = listOf(
        Triple("Goals", "${member.goalsDone}/${member.goalsCount}", null),
        Triple("Workload", member.assignedToday.toString(), null),
        Triple("Done today", member.doneToday.toString(), tokens.success),
        Triple("Pending", member.pendingTasks.toString(), null),
        Triple("Overdue", member.overdueTasks.toString(), if (member.overdueTasks > 0) tokens.danger else null),
        Triple("Blocked", member.blockedTasks.toString(), if (member.blockedTasks > 0) tokens.warn else null),
        Triple("Need help", member.needHelp.toString(), if (member.needHelp > 0) tokens.warn else null),
        Triple("DCC", member.dccCompliancePct?.let { "$it%" } ?: "—", if (member.dccCompliancePct != null && member.dccCompliancePct < 80) tokens.danger else null),
        Triple("Training", "${member.trainingHoursMonth}h", null),
    )
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        cells.chunked(3).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                row.forEach { (label, value, tone) ->
                    MetricTile(label = label, value = value, tone = tone, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun MetricTile(
    label: String,
    value: String,
    tone: SemanticColor?,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space2),
    ) {
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = value,
            style = AltusType.bodyStrong,
            color = tone?.color ?: scheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Status pill (client-derived tone; mirrors the web's `statusOf`) ────────

@Composable
private fun MemberStatusPill(status: TeamMemberStatus, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val (label, semantic) = when (status) {
        TeamMemberStatus.NeedsHelp -> "Needs help" to tokens.warn
        TeamMemberStatus.Blocked -> "Blocked" to tokens.warn
        TeamMemberStatus.Working -> "Working" to tokens.success
        TeamMemberStatus.ClockedOut -> "Clocked out" to SemanticColor(color = tokens.ink400, wash = tokens.sunken)
        TeamMemberStatus.NoPlan -> "No plan" to tokens.danger
        TeamMemberStatus.NotInYet -> "Not in yet" to SemanticColor(color = tokens.ink400, wash = tokens.sunken)
    }
    Text(
        text = label,
        style = AltusType.label,
        color = semantic.color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(semantic.wash)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

// ─── Chrome bits ─────────────────────────────────────────────────────────────

@Composable
private fun RefreshAction(spinning: Boolean, onClick: () -> Unit) {
    val tint = MaterialTheme.colorScheme.onSurfaceVariant
    IconButton(onClick = onClick, enabled = !spinning) {
        Icon(
            imageVector = TeamIcons.Refresh,
            contentDescription = "Refresh team",
            tint = tint,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun StaleBanner(visible: Boolean, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AnimatedVisibility(
        visible = visible,
        enter = expandVertically(tween(200)) + fadeIn(tween(200)),
        exit = shrinkVertically(tween(150)) + fadeOut(tween(150)),
    ) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(top = AltusDimens.space2)
                .clip(AltusShapeTokens.input)
                .background(tokens.warn.wash)
                .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
        ) {
            Text(
                text = "Showing the last synced roster — reconnect to refresh.",
                style = AltusType.label,
                color = tokens.warn.color,
            )
        }
    }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

@Composable
private fun TeamSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            repeat(2) {
                AltusCard(modifier = Modifier.weight(1f), padding = AltusDimens.space3) {
                    SkeletonLine(width = 60.dp, height = 12.dp)
                    Spacer(Modifier.height(AltusDimens.space2))
                    SkeletonLine(width = 28.dp, height = 22.dp)
                }
            }
        }
        Spacer(Modifier.height(AltusDimens.space2))
        repeat(3) {
            SkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                shape = AltusShapeTokens.card,
            )
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object TeamIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Team.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val Refresh: ImageVector by lazy {
        lucide(
            "Team.Refresh",
            "M23 4v6h-6",
            "M1 20v-6h6",
            "M3.51 9a9 9 0 0 1 14.85-3.36L23 10",
            "M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
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
