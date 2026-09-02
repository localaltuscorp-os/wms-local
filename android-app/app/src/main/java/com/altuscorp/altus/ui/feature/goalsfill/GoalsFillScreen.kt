package com.altuscorp.altus.feature.goals

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.tapSettle
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlin.math.roundToInt

/**
 * S8 — Weekly-goals fill. The pushed surface that clears the Mon/Thu
 * `needsGoals` gate: one card per unfilled goal, each carrying a 5%-detent
 * %Done slider (`CLOCK_TICK` per detent) and — for anything under 100% — a
 * short explanation. One 56dp commit pill submits the whole ledger.
 *
 * Reads are cache-first ([GoalsFillViewModel] paints instantly, null =
 * skeletons in the exact final geometry); drafts live in the ViewModel so
 * process death never loses a slider position mid-fill; submit is ONLINE-ONLY
 * and, on success, clears the gate in every local mirror on the same frame and
 * pops back to whatever the gate was blocking.
 *
 * Signature: `GoalsFillScreen(onBack)` — matches the NavHost's
 * `composable<GoalsFillRoute>` call.
 */
@Composable
fun GoalsFillScreen(
    onBack: () -> Unit,
    viewModel: GoalsFillViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = currentHaptics()
    val tokens = AltusTheme.tokens

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                GoalsFillEvent.Submitted -> {
                    haptics.commitTick()
                    onBack()
                }

                GoalsFillEvent.SubmitRejected -> haptics.gateUhUh()
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            GoalsFillHeader(
                title = "Weekly goals",
                subtitle = state.weekLabel,
                progress = if (state.showContent) state.progressLabel else null,
                onBack = onBack,
            )

            when {
                state.isLoading -> GoalsFillSkeleton(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )

                state.loadErrorMessage != null -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyState(
                        headline = "Couldn't load your goals",
                        body = state.loadErrorMessage,
                        actionLabel = "Retry",
                        onAction = { viewModel.onIntent(GoalsFillIntent.Refresh) },
                    )
                }

                state.showEmpty -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyState(
                        headline = "All filled.",
                        body = "Every goal is logged for this week — nothing's blocking your clock-in.",
                    )
                }

                else -> GoalsFillContent(
                    state = state,
                    onIntent = viewModel::onIntent,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            }
        }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun GoalsFillHeader(
    title: String,
    subtitle: String?,
    progress: String?,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = AltusTheme.tokens
    val backInteraction = remember { MutableInteractionSource() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(AltusDimens.touchMin)
                .tapSettle(backInteraction)
                .clip(CircleShape)
                .clickable(
                    interactionSource = backInteraction,
                    indication = ripple(),
                    role = Role.Button,
                    onClickLabel = "Back",
                    onClick = onBack,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = GoalsFillIcons.ArrowLeft,
                contentDescription = "Back",
                tint = scheme.onSurface,
                modifier = Modifier.size(24.dp),
            )
        }
        Spacer(Modifier.size(AltusDimens.space2))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = AltusType.title1, color = scheme.onSurface)
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = AltusType.label,
                    color = scheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (progress != null) {
            Text(
                text = progress,
                style = AltusType.monoData,
                color = tokens.ink400,
                maxLines = 1,
                modifier = Modifier.padding(end = AltusDimens.space3),
            )
        }
    }
}

// ─── Content ─────────────────────────────────────────────────────────────────

@Composable
private fun GoalsFillContent(
    state: GoalsFillUiState,
    onIntent: (GoalsFillIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    Column(modifier = modifier) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space2,
                bottom = AltusDimens.space6,
            ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "intro", contentType = "intro") {
                Text(
                    text = "Log where each goal landed this week. Anything under 100% needs a one-line reason.",
                    style = AltusType.body,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = AltusDimens.space1),
                )
            }

            items(
                items = state.goals,
                key = { it.id },
                contentType = { "goal" },
            ) { row ->
                GoalFillCard(
                    row = row,
                    enabled = !state.isSubmitting,
                    onPctChange = { pct ->
                        onIntent(GoalsFillIntent.ChangePct(row.id, pct))
                    },
                    onExplanationChange = { text ->
                        onIntent(GoalsFillIntent.ChangeExplanation(row.id, text))
                    },
                )
            }
        }

        // Commit dock — pinned, rides above the IME with the screen's imePadding.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(top = AltusDimens.space3, bottom = AltusDimens.space4),
        ) {
            if (state.submitError != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(AltusShapeTokens.input)
                        .background(tokens.danger.wash)
                        .padding(AltusDimens.space3),
                ) {
                    Text(
                        text = state.submitError,
                        style = AltusType.body,
                        color = tokens.danger.color,
                    )
                }
                Spacer(Modifier.height(AltusDimens.space3))
            }
            AltusPrimaryButton(
                text = "Submit weekly goals",
                onClick = { onIntent(GoalsFillIntent.Submit) },
                loading = state.isSubmitting,
                enabled = state.goals.isNotEmpty(),
            )
        }
    }
}

// ─── One goal card ───────────────────────────────────────────────────────────

@Composable
private fun GoalFillCard(
    row: GoalFillRowUi,
    enabled: Boolean,
    onPctChange: (Int) -> Unit,
    onExplanationChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    AltusCard(
        modifier = modifier,
        accentKeyline = tokens.accents.goals,
    ) {
        // Eyebrow + ready marker.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = row.eyebrow.uppercase(),
                style = AltusType.caption,
                color = scheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (row.isReady) {
                Icon(
                    imageVector = GoalsFillIcons.Check,
                    contentDescription = "Ready",
                    tint = tokens.success.color,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = row.title,
            style = AltusType.heading,
            color = scheme.onSurface,
        )

        if (row.target != null) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = row.target,
                style = AltusType.body,
                color = scheme.onSurfaceVariant,
            )
        }

        if (row.meta != null || row.dueLabel != null) {
            Spacer(Modifier.height(AltusDimens.space1))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                if (row.meta != null) {
                    Text(
                        text = row.meta,
                        style = AltusType.label,
                        color = tokens.ink400,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                }
                if (row.dueLabel != null) {
                    Text(
                        text = row.dueLabel,
                        style = AltusType.monoData,
                        color = tokens.ink400,
                        maxLines = 1,
                    )
                }
            }
        }

        Spacer(Modifier.height(AltusDimens.space4))

        // %Done readout + slider.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "% DONE",
                style = AltusType.caption,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${row.pctDone}%",
                style = AltusType.monoData,
                color = if (row.pctDone >= 100) tokens.success.color else scheme.onSurface,
                maxLines = 1,
            )
        }

        GoalPctSlider(
            pct = row.pctDone,
            enabled = enabled,
            onPctChange = onPctChange,
        )

        // Explanation — only for goals under 100% (the ones needing attention).
        if (row.explanationRequired) {
            Spacer(Modifier.height(AltusDimens.space3))
            AltusTextField(
                value = row.explanation,
                onValueChange = onExplanationChange,
                label = "Why below 100%?",
                placeholder = "A short reason",
                error = row.explanationError,
                enabled = enabled,
                singleLine = false,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Default,
                ),
            )
        }
    }
}

// ─── The 5%-detent slider ────────────────────────────────────────────────────

/**
 * A %Done slider snapped to 5% detents (§ Plan goal-actuals grammar, reused):
 * every detent crossing fires a `CLOCK_TICK` and reports the new whole-percent
 * value up to the ViewModel, which owns the draft. Active track is evergreen —
 * progress toward green is progress toward "done, no attention needed."
 */
@Composable
private fun GoalPctSlider(
    pct: Int,
    enabled: Boolean,
    onPctChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()

    Slider(
        value = pct.toFloat(),
        onValueChange = { raw ->
            val snapped = (raw / DETENT).roundToInt() * DETENT
            if (snapped != pct) {
                haptics.clockTick()
                onPctChange(snapped)
            }
        },
        enabled = enabled,
        valueRange = 0f..100f,
        steps = DETENT_STEPS,
        colors = SliderDefaults.colors(
            thumbColor = scheme.primary,
            activeTrackColor = scheme.primary,
            inactiveTrackColor = tokens.hairline,
            activeTickColor = Color.Transparent,
            inactiveTickColor = Color.Transparent,
            disabledThumbColor = tokens.ink300,
            disabledActiveTrackColor = tokens.ink300,
            disabledInactiveTrackColor = tokens.hairline,
        ),
        modifier = modifier.fillMaxWidth(),
    )
}

// ─── Skeleton (Signature 8: exact final geometry) ────────────────────────────

@Composable
private fun GoalsFillSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space2, bottom = AltusDimens.space4),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonLine(width = 240.dp, height = 16.dp)
        Spacer(Modifier.height(AltusDimens.space1))
        repeat(3) {
            SkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(196.dp),
                shape = AltusShapeTokens.card,
            )
        }
        Spacer(Modifier.weight(1f))
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(AltusDimens.actionPrimary),
            shape = AltusShapeTokens.pill,
        )
    }
}

private const val DETENT = 5
private const val DETENT_STEPS = 19 // 0,5,…,100 → 19 interior stops over 0..100.

// ─── Screen-local glyphs (Lucide, 2dp stroke — §1.7) ─────────────────────────

private object GoalsFillIcons {

    /** lucide `arrow-left` — back. */
    val ArrowLeft: ImageVector by lazy {
        lucide("GoalsFill.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5")
    }

    /** lucide `check` — this goal satisfies the gate. */
    val Check: ImageVector by lazy {
        lucide("GoalsFill.Check", "M20 6L9 17l-4-4")
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
