@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.review360

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonCircle
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * Employees · Monthly 360 (read-only) — the peer/subordinate review surface.
 *
 * Anatomy, top to bottom (faithful to the web `/pms/review` page):
 *  1. A greeting hero carrying the Employees keyline (§1.1, keyline only): the
 *     cycle label, the intent line, and the "n of m reviewed" progress meter.
 *  2. Relation sections ("Your team", "Your manager", "Peers") — each a
 *     [SectionHeader] with a mono done/total count over roster cards showing
 *     the avatar, relation, the mono rating line for reviewed people, and a
 *     Reviewed / Pending pill (green is reserved for the Reviewed state).
 *  3. "My personal goals" — the user's own up-to-3 non-work goals with a
 *     status pill.
 *
 * A cold load paints the skeleton; a warm reconcile keeps the roster and folds
 * any failure into a quiet stale banner (never a dead end).
 */
@Composable
fun Review360Screen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: Review360ViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    Review360Content(
        state = state,
        onBack = onBack,
        onIntent = viewModel::onIntent,
        modifier = modifier,
    )
}

@Composable
private fun Review360Content(
    state: Review360UiState,
    onBack: () -> Unit,
    onIntent: (Review360Intent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "360 Review",
            navigationIcon = Review360Icons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> Review360Skeleton()
            state.loadError != null && !state.hasContent -> Review360LoadError(
                onRetry = { onIntent(Review360Intent.Retry) },
            )
            else -> Review360Roster(
                state = state,
                onRefresh = { onIntent(Review360Intent.Refresh) },
            )
        }
    }
}

// ─── Loaded roster ────────────────────────────────────────────────────────────

@Composable
private fun Review360Roster(
    state: Review360UiState,
    onRefresh: () -> Unit,
) {
    val accent = AltusTheme.tokens.workspaces.employees.base
    val pullState = rememberPullToRefreshState()
    val haptics = currentHaptics()

    LaunchedEffect(pullState, haptics) {
        snapshotFlow { pullState.distanceFraction >= 1f }
            .distinctUntilChanged()
            .filter { it }
            .collect { haptics.clockTick() }
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
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = AltusDimens.cardGap,
                bottom = AltusDimens.space12,
            ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "hero", contentType = "hero") {
                Review360Hero(
                    state = state,
                    accent = accent,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale", contentType = "stale") {
                    StaleBanner(
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            if (!state.hasContent) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "No one to review yet.",
                        body = "Reviews appear once you have a manager, peers, or direct reports on the org chart.",
                    )
                }
            }

            // Relation sections.
            state.groups.forEach { group ->
                item(key = "hdr-${group.key}", contentType = "section-header") {
                    SectionHeader(
                        title = group.header,
                        count = "${group.doneCount}/${group.people.size}",
                    )
                }
                items(
                    items = group.people,
                    key = { "${group.key}-${it.id}" },
                    contentType = { "person" },
                ) { person ->
                    PersonCard(
                        person = person,
                        accent = accent,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            // Personal goals.
            if (state.personalGoals.isNotEmpty()) {
                item(key = "hdr-goals", contentType = "section-header") {
                    SectionHeader(
                        title = "My personal goals",
                        count = state.personalGoals.size.toString(),
                    )
                }
                items(
                    items = state.personalGoals,
                    key = { "goal-${it.key}" },
                    contentType = { "goal" },
                ) { goal ->
                    GoalCard(
                        goal = goal,
                        accent = accent,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }
        }
    }
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

@Composable
private fun Review360Hero(
    state: Review360UiState,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = accent,
    ) {
        Text(
            text = "Employees · Monthly 360".uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = "Monthly Review",
            style = AltusType.title1,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = buildString {
                append("Rate the people you work with on Attitude, Behaviour and Skill")
                if (state.periodLabel.isNotBlank()) append(" for ${state.periodLabel}")
                append(".")
            },
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (state.totalCount > 0) {
            Spacer(Modifier.height(AltusDimens.space4))
            val complete = state.reviewedCount >= state.totalCount
            Text(
                text = "${state.reviewedCount} of ${state.totalCount} reviewed",
                style = AltusType.monoData,
                color = if (complete) tokens.success.color else tokens.ink400,
            )
            Spacer(Modifier.height(AltusDimens.space2))
            ProgressMeter(
                fraction = state.progress,
                color = if (complete) tokens.success.color else accent,
            )
        }
    }
}

/** A slim rounded progress track — the review-completion meter. */
@Composable
private fun ProgressMeter(
    fraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(6.dp)
                .clip(AltusShapeTokens.pill)
                .background(color),
        )
    }
}

// ─── Person card ──────────────────────────────────────────────────────────────

@Composable
private fun PersonCard(
    person: Review360PersonUi,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(name = person.name, imageUrl = person.avatarUrl, size = 44.dp)
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = person.name,
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${person.relationLabel} · ${person.department}",
                    style = AltusType.label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (person.ratingLabel != null) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(
                        text = person.ratingLabel,
                        style = AltusType.monoData,
                        color = accent,
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.width(AltusDimens.space3))
            ReviewStatePill(done = person.done)
        }

        if (person.note != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = person.note,
                style = AltusType.body,
                color = tokens.ink400,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Reviewed = success wash (the one green); Pending = quiet sunken bed. */
@Composable
private fun ReviewStatePill(
    done: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val (label, color, wash) = if (done) {
        Triple("Reviewed", tokens.success.color, tokens.success.wash)
    } else {
        Triple("Pending", tokens.ink400, tokens.sunken)
    }
    Text(
        text = label,
        style = AltusType.label,
        color = color,
        maxLines = 1,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(wash)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

// ─── Goal card ────────────────────────────────────────────────────────────────

@Composable
private fun GoalCard(
    goal: Review360GoalUi,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = accent) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = goal.title,
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (goal.detail != null) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(
                        text = goal.detail,
                        style = AltusType.body,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(AltusDimens.space3))
            GoalStatusPill(kind = goal.statusKind, label = goal.statusLabel)
        }
    }
}

@Composable
private fun GoalStatusPill(
    kind: GoalStatusKind,
    label: String,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val (color, wash) = when (kind) {
        GoalStatusKind.Done -> tokens.success.color to tokens.success.wash
        GoalStatusKind.Dropped -> tokens.ink400 to tokens.sunken
        GoalStatusKind.Active -> tokens.info.color to tokens.info.wash
    }
    Text(
        text = label,
        style = AltusType.label,
        color = color,
        maxLines = 1,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(wash)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
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
            text = "Couldn't refresh — showing the last synced roster.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun Review360LoadError(
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

private const val SKELETON_ROWS = 5

@Composable
private fun Review360Skeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.cardGap,
            ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        // Hero silhouette.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(148.dp),
        )
        Spacer(Modifier.height(AltusDimens.space2))
        // Section-header silhouette.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 36.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonLine(width = 120.dp, height = 12.dp)
            Spacer(Modifier.weight(1f))
            SkeletonLine(width = 36.dp, height = 12.dp)
        }
        // Roster-card silhouettes.
        repeat(SKELETON_ROWS) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 76.dp)
                    .clip(AltusShapeTokens.card)
                    .background(AltusTheme.tokens.surface)
                    .padding(AltusDimens.cardPadding),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonCircle(diameter = 44.dp)
                Spacer(Modifier.width(AltusDimens.space3))
                Column(Modifier.weight(1f)) {
                    SkeletonLine(width = 148.dp)
                    Spacer(Modifier.height(AltusDimens.space1))
                    SkeletonLine(width = 96.dp, height = 10.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonLine(width = 64.dp, height = 20.dp)
            }
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object Review360Icons {

    /** lucide `arrow-left` — the top-bar back affordance. */
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Review360.ArrowLeft",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        )
        listOf("M12 19l-7-7 7-7", "M19 12H5").forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(Color.Black), // always overridden by Icon tint
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.build()
    }
}
