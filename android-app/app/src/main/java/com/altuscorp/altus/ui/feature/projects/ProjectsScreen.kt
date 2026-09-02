@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.projects

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
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
import androidx.compose.runtime.getValue
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * WMS Projects (read-only overview): the org's ambitious work broken down —
 * Project → Milestone → Result → Action — mirrored from the web `/projects`
 * page and collapsed to a scannable card per project with a real completion
 * meter (linked tasks done / total).
 *
 * Anatomy, top to bottom:
 *  1. An overview card — four mono stats (projects · milestones · results ·
 *     linked tasks), carrying the WMS workspace keyline.
 *  2. A [SectionHeader] eyebrow with the project count.
 *  3. One card per project: name + a mono percent pill, owner + optional due
 *     pill, a completion meter (WMS accent; success green only at 100%), and a
 *     quiet breakdown + "n/m done" line.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache. Pull-to-
 * refresh reconciles.
 */
@Composable
fun ProjectsScreen(
    onBack: () -> Unit,
    viewModel: ProjectsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ProjectsContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

/**
 * Content-only Projects screen for the WMS shell's "Projects" pill. The shell
 * owns the status-bar inset and the bottom pill nav, so this variant carries
 * NO [AltusTopAppBar] and never applies `statusBarsPadding` — it renders only
 * the skeleton / cold-error / loaded list over the canvas, exactly like the
 * hub's [com.altuscorp.altus.feature.wms.WmsDashboardScreen].
 */
@Composable
fun WmsProjectsScreen(
    modifier: Modifier = Modifier,
    viewModel: ProjectsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ProjectsBody(
        state = state,
        onIntent = viewModel::onIntent,
        modifier = modifier
            .fillMaxSize()
            .background(AltusTheme.tokens.canvas),
    )
}

@Composable
private fun ProjectsContent(
    state: ProjectsUiState,
    onBack: () -> Unit,
    onIntent: (ProjectsIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Projects",
            navigationIcon = ProjectsIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        ProjectsBody(state = state, onIntent = onIntent)
    }
}

/** The cold-load / cold-error / loaded-list body shared by both hosts. */
@Composable
private fun ProjectsBody(
    state: ProjectsUiState,
    onIntent: (ProjectsIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        when {
            state.isLoading && !state.hasContent -> ProjectsSkeleton()
            state.loadFailed && !state.hasContent -> ProjectsLoadError(
                onRetry = { onIntent(ProjectsIntent.Retry) },
            )
            else -> ProjectsList(
                state = state,
                onRefresh = { onIntent(ProjectsIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded list ──────────────────────────────────────────────────────────────

@Composable
private fun ProjectsList(
    state: ProjectsUiState,
    onRefresh: () -> Unit,
) {
    val pullState = rememberPullToRefreshState()

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
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = AltusDimens.cardGap,
                bottom = AltusDimens.space8,
            ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "overview", contentType = "overview") {
                OverviewCard(
                    state = state,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale-banner", contentType = "stale-banner") {
                    StaleBanner(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                }
            }

            item(key = "list-header", contentType = "section-header") {
                SectionHeader(
                    title = "All projects",
                    count = "${state.totalProjects}",
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            if (state.projects.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "No projects yet.",
                        body = "Projects broken down into milestones and results will appear here.",
                    )
                }
            } else {
                items(
                    items = state.projects,
                    key = { it.id },
                    contentType = { "project" },
                ) { project ->
                    ProjectCard(
                        project = project,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }
        }
    }
}

// ─── Overview stat card ───────────────────────────────────────────────────────

@Composable
private fun OverviewCard(
    state: ProjectsUiState,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.workspaces.wms.base,
    ) {
        Row(modifier = Modifier.fillMaxWidth()) {
            OverviewStat(value = "${state.totalProjects}", label = "Projects", modifier = Modifier.weight(1f))
            OverviewStat(value = "${state.totalMilestones}", label = "Milestones", modifier = Modifier.weight(1f))
            OverviewStat(value = "${state.totalResults}", label = "Results", modifier = Modifier.weight(1f))
            OverviewStat(value = "${state.totalTasks}", label = "Tasks", modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun OverviewStat(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier) {
        Text(
            text = value,
            style = AltusType.numeralStat,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Project card ─────────────────────────────────────────────────────────────

@Composable
private fun ProjectCard(
    project: ProjectRow,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val meterColor = if (project.complete) tokens.success.color else tokens.workspaces.wms.base

    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.workspaces.wms.base,
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                text = project.name,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            PercentPill(pct = project.pct, complete = project.complete)
        }

        Spacer(Modifier.height(AltusDimens.space2))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = project.ownerLabel,
                style = AltusType.label,
                color = if (project.hasOwner) MaterialTheme.colorScheme.onSurfaceVariant else tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (project.targetLabel != null) {
                Spacer(Modifier.width(AltusDimens.space2))
                Text(
                    text = "· ${project.targetLabel}",
                    style = AltusType.label,
                    color = tokens.warn.color,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Spacer(Modifier.height(AltusDimens.space3))

        // Completion meter — WMS accent; earns success green only at 100%.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(AltusShapeTokens.pill)
                .background(tokens.sunken),
        ) {
            if (project.hasTasks && project.pct > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(fraction = (project.pct / 100f).coerceIn(0f, 1f))
                        .fillMaxHeight()
                        .clip(AltusShapeTokens.pill)
                        .background(meterColor),
                )
            }
        }

        Spacer(Modifier.height(AltusDimens.space2))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = project.breakdownLabel,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Text(
                text = project.tasksLabel,
                style = AltusType.monoData,
                color = if (project.complete) tokens.success.color else tokens.ink400,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun PercentPill(
    pct: Int,
    complete: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val fg = if (complete) tokens.success.color else tokens.workspaces.wms.base
    Box(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(if (complete) tokens.success.wash else tokens.sunken)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    ) {
        Text(text = "$pct%", style = AltusType.monoData, color = fg, maxLines = 1)
    }
}

// ─── Degraded states ──────────────────────────────────────────────────────────

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
            text = "Couldn't refresh — showing the last synced projects.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun ProjectsLoadError(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        EmptyState(
            headline = "Couldn't load projects.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

// ─── Skeleton (exact resolved geometry) ──────────────────────────────────────

private const val SKELETON_CARDS = 5

@Composable
private fun ProjectsSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(
            modifier = Modifier
                .padding(horizontal = AltusDimens.screenGutter)
                .fillMaxWidth()
                .height(96.dp),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 36.dp)
                .padding(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    top = AltusDimens.sectionGap - AltusDimens.cardGap,
                    bottom = AltusDimens.space2,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonLine(width = 120.dp, height = 12.dp)
            Spacer(Modifier.weight(1f))
            SkeletonLine(width = 28.dp, height = 12.dp)
        }
        repeat(SKELETON_CARDS) {
            SkeletonBox(
                modifier = Modifier
                    .padding(horizontal = AltusDimens.screenGutter)
                    .fillMaxWidth()
                    .height(128.dp),
            )
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object ProjectsIcons {
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Projects.ArrowLeft",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        )
        listOf("M12 19l-7-7 7-7", "M19 12H5").forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.build()
    }
}
