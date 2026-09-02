package com.altuscorp.altus.feature.weeklygoals

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.StatusPill
import com.altuscorp.altus.ui.designsystem.tapSettle
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * WEEKLY GOALS BOARD (WMS) — the signed-in user's read-only per-week goal cards,
 * faithful to the web `/weekly-goals` page: a week pager + a weighted-score and
 * weight-budget summary, then one card per active goal carrying its eyebrow
 * (client · subject), title, weight, target date, server status pill and the
 * effective %Done bar (evergreen only when a goal is complete).
 *
 * Reads are cache-first ([WeeklyGoalsViewModel] paints instantly on a warm week,
 * null = skeletons in the final geometry). There are no edits here — the board
 * mirrors the web read; filling happens on the S8 goals-fill gate.
 *
 * Signature: `WeeklyGoalsScreen(onBack)` — matches the NavHost composable call.
 */
@Composable
fun WeeklyGoalsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: WeeklyGoalsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Weekly goals",
            navigationIcon = WeeklyGoalsIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )

        WeeklyGoalsBody(
            state = state,
            onIntent = viewModel::onIntent,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )
    }
}

/**
 * WEEKLY GOALS as a WMS-shell PAGE — the content-only host used by the
 * [com.altuscorp.altus.feature.wms.WmsShell] "Weekly Goals" pill. Identical board
 * to the standalone [WeeklyGoalsScreen] but WITHOUT the top app bar (the shell's
 * pill bar is the chrome) and WITHOUT [Modifier.statusBarsPadding] (the shell owns
 * the status-bar inset). Its `@HiltViewModel` scopes to the shell's back-stack
 * entry, so pill round-trips swap the view without re-fetching.
 */
@Composable
fun WmsWeeklyGoalsScreen(
    modifier: Modifier = Modifier,
    viewModel: WeeklyGoalsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    WeeklyGoalsBody(
        state = state,
        onIntent = viewModel::onIntent,
        modifier = modifier.fillMaxSize(),
    )
}

/** Cold-skeleton / cold-error / warm-board state switch, shared by both hosts. */
@Composable
private fun WeeklyGoalsBody(
    state: WeeklyGoalsUiState,
    onIntent: (WeeklyGoalsIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    when {
        state.isLoading -> WeeklyGoalsSkeleton(modifier = modifier)

        state.loadError != null -> Box(
            modifier = modifier,
            contentAlignment = Alignment.Center,
        ) {
            EmptyState(
                headline = "Couldn't load your goals",
                body = state.loadError,
                actionLabel = "Retry",
                onAction = { onIntent(WeeklyGoalsIntent.Refresh) },
            )
        }

        else -> WeeklyGoalsContent(
            state = state,
            onIntent = onIntent,
            modifier = modifier,
        )
    }
}

// ─── Content ────────────────────────────────────────────────────────────────

@Composable
private fun WeeklyGoalsContent(
    state: WeeklyGoalsUiState,
    onIntent: (WeeklyGoalsIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(
            start = AltusDimens.screenGutter,
            end = AltusDimens.screenGutter,
            top = AltusDimens.space2,
            bottom = AltusDimens.space12,
        ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(key = "pager", contentType = "pager") {
            WeekPager(
                weekLabel = state.weekLabel,
                isCurrentWeek = state.isCurrentWeek,
                canGoPrev = state.prevWeek != null,
                canGoNext = state.nextWeek != null,
                onPrev = { onIntent(WeeklyGoalsIntent.PrevWeek) },
                onNext = { onIntent(WeeklyGoalsIntent.NextWeek) },
                onThisWeek = { onIntent(WeeklyGoalsIntent.ThisWeek) },
            )
        }

        item(key = "summary", contentType = "summary") {
            SummaryCard(state = state)
        }

        if (state.showEmpty) {
            item(key = "empty", contentType = "empty") {
                EmptyState(
                    headline = "No goals yet",
                    body = "This week has no goals on your ledger. Set your priorities on the web board.",
                    modifier = Modifier.padding(top = AltusDimens.space6),
                )
            }
        } else {
            items(
                items = state.goals,
                key = { it.id },
                contentType = { "goal" },
            ) { goal ->
                GoalCard(goal = goal)
            }
        }
    }
}

// ─── Week pager ───────────────────────────────────────────────────────────────

@Composable
private fun WeekPager(
    weekLabel: String,
    isCurrentWeek: Boolean,
    canGoPrev: Boolean,
    canGoNext: Boolean,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onThisWeek: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = AltusTheme.tokens

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PagerButton(
            icon = WeeklyGoalsIcons.ChevronLeft,
            contentDescription = "Previous week",
            enabled = canGoPrev,
            onClick = onPrev,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = AltusDimens.space2),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = weekLabel,
                style = AltusType.bodyStrong,
                color = scheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!isCurrentWeek) {
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = "Back to this week",
                    style = AltusType.label,
                    color = scheme.primary,
                    modifier = Modifier
                        .clip(AltusShapeTokens.pill)
                        .clickable(role = Role.Button, onClick = onThisWeek)
                        .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
                )
            } else {
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = "THIS WEEK",
                    style = AltusType.caption,
                    color = tokens.ink400,
                )
            }
        }
        PagerButton(
            icon = WeeklyGoalsIcons.ChevronRight,
            contentDescription = "Next week",
            enabled = canGoNext,
            onClick = onNext,
        )
    }
}

@Composable
private fun PagerButton(
    icon: ImageVector,
    contentDescription: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val interaction = remember { MutableInteractionSource() }

    Box(
        modifier = modifier
            .size(AltusDimens.touchMin)
            .tapSettle(interaction, enabled = enabled)
            .clip(CircleShape)
            .clickable(
                enabled = enabled,
                interactionSource = interaction,
                indication = ripple(),
                role = Role.Button,
                onClickLabel = contentDescription,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) scheme.onSurface else tokens.ink300,
            modifier = Modifier.size(24.dp),
        )
    }
}

// ─── Summary card ─────────────────────────────────────────────────────────────

@Composable
private fun SummaryCard(
    state: WeeklyGoalsUiState,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = AltusTheme.tokens

    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.accents.goals,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "WEEKLY SCORE",
                    style = AltusType.caption,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = "${state.scoreValue}%",
                    style = AltusType.numeralStat,
                    color = if (state.scoreValue >= 100) tokens.success.color else scheme.onSurface,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "WEIGHT",
                    style = AltusType.caption,
                    color = scheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = state.weightLabel,
                    style = AltusType.monoData,
                    color = if (state.weightOffBudget) tokens.warn.color else scheme.onSurface,
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space3))
        MeterBar(
            fraction = state.weightFraction,
            track = if (state.weightOffBudget) tokens.warn.color else scheme.primary,
        )
        if (state.weightOffBudget) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = "Weights don't total ${state.weightLabel.substringAfter("/ ").trim()} yet — balance them on the web board.",
                style = AltusType.label,
                color = tokens.ink400,
            )
        }
    }
}

// ─── Goal card ────────────────────────────────────────────────────────────────

@Composable
private fun GoalCard(
    goal: WeeklyGoalCardUi,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = AltusTheme.tokens

    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.accents.goals,
    ) {
        // Eyebrow + status pill.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = goal.eyebrow ?: "GOAL ${goal.indexLabel}",
                style = AltusType.caption,
                color = scheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.size(AltusDimens.space2))
            StatusPill(display = goal.status)
        }

        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = goal.title,
            style = AltusType.heading,
            color = scheme.onSurface,
        )

        if (goal.notes != null) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = goal.notes,
                style = AltusType.body,
                color = scheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // Meta strip: weight · target date.
        Spacer(Modifier.height(AltusDimens.space2))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
        ) {
            MetaChip(label = "WEIGHT", value = goal.weightLabel)
            if (goal.dueLabel != null) {
                MetaChip(label = "TARGET", value = goal.dueLabel)
            }
            Spacer(Modifier.weight(1f))
            if (goal.carried) {
                Text(
                    text = "↪ carried",
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
        }

        if (goal.incentiveLabel != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Box(
                modifier = Modifier
                    .clip(AltusShapeTokens.pill)
                    .background(tokens.accents.goals.copy(alpha = 0.14f))
                    .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
            ) {
                Text(
                    text = goal.incentiveLabel,
                    style = AltusType.label,
                    color = tokens.accents.goals,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Spacer(Modifier.height(AltusDimens.space3))

        // %Done readout + bar.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "% DONE",
                style = AltusType.caption,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = goal.pctLabel,
                style = AltusType.monoData,
                color = if (goal.isComplete) tokens.success.color else scheme.onSurface,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(AltusDimens.space2))
        MeterBar(
            fraction = goal.pctFraction,
            track = if (goal.isComplete) tokens.success.color else scheme.primary,
        )

        if (goal.reviewNote != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = goal.reviewNote,
                style = AltusType.label,
                color = tokens.ink400,
            )
        }
    }
}

@Composable
private fun MetaChip(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    Column(modifier = modifier) {
        Text(text = label, style = AltusType.caption, color = scheme.onSurfaceVariant)
        Text(text = value, style = AltusType.monoData, color = scheme.onSurface, maxLines = 1)
    }
}

/** A slim rounded progress track; [fraction] 0..1 fills with [track]. */
@Composable
private fun MeterBar(
    fraction: Float,
    track: Color,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(AltusShapeTokens.pill)
            .background(tokens.hairline),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(8.dp)
                .clip(AltusShapeTokens.pill)
                .background(track),
        )
    }
}

// ─── Skeleton (Signature 8: final geometry) ──────────────────────────────────

@Composable
private fun WeeklyGoalsSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space2),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonLine(width = 200.dp, height = 18.dp, modifier = Modifier.padding(vertical = AltusDimens.space2))
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp),
            shape = AltusShapeTokens.card,
        )
        repeat(3) {
            SkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                shape = AltusShapeTokens.card,
            )
        }
    }
}

// ─── Screen-local glyphs (Lucide, 2dp stroke — §1.7) ─────────────────────────

private object WeeklyGoalsIcons {
    val ArrowLeft: ImageVector by lazy { lucide("WeeklyGoals.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val ChevronLeft: ImageVector by lazy { lucide("WeeklyGoals.ChevronLeft", "M15 18l-6-6 6-6") }
    val ChevronRight: ImageVector by lazy { lucide("WeeklyGoals.ChevronRight", "M9 18l6-6-6-6") }

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
