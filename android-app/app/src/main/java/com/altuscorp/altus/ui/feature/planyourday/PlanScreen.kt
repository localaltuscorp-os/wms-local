package com.altuscorp.altus.feature.plan

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.domain.model.DayPlan
import com.altuscorp.altus.domain.model.PlanItem
import com.altuscorp.altus.domain.model.PlannerGoal
import com.altuscorp.altus.domain.model.PullableGoal
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.rememberAltusSheetState
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlin.math.roundToInt
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.delay

/**
 * S4 Plan Your Day — the pushed surface that clears the clock-in `needsPlan`
 * gate. Reuses the DCC row grammar: today's assigned tasks, pullable weekly
 * goals, and overdue items appear as 64dp rows with a one-tap "+ Add" morph
 * chip; a pinned mono "2/5" commitment meter (MIN_DAILY_ITEMS) leads the list;
 * live goals log today's actual through a 5%-detent slider sheet. Satisfying
 * the meter pops back to the blocked clock-in surface.
 *
 * Every commit is online-only and optimistic at the fingertip — the chip fires
 * one commit tick and shows its pending face while the server ack advances the
 * meter. A rejected commit fires the "uh-uh" double-tick and a quiet banner;
 * the board never blocks.
 */
@Composable
fun PlanScreen(
    onBack: () -> Unit,
    viewModel: PlanViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = currentHaptics()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                PlanEffect.PopBack -> onBack()
                PlanEffect.ActualsSaved -> haptics.commitTick()
                PlanEffect.Reject -> haptics.gateUhUh()
            }
        }
    }

    PlanContent(
        state = state,
        onBack = onBack,
        onIntent = viewModel::onIntent,
    )
}

@Composable
private fun PlanContent(
    state: PlanUiState,
    onBack: () -> Unit,
    onIntent: (PlanIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    val plan = state.plan

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
        ) {
            AltusTopAppBar(
                title = "Plan your day",
                navigationIcon = Icons.AutoMirrored.Filled.ArrowBack,
                onNavigationClick = onBack,
                navigationContentDescription = "Back",
                actions = {
                    if (plan != null) {
                        MeterPill(plannedCount = plan.plannedCount, minItems = plan.minItems)
                    }
                },
            )

            when {
                plan != null -> PlanList(
                    plan = plan,
                    state = state,
                    onIntent = onIntent,
                    onBack = onBack,
                )

                state.loadFailed -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyState(
                        headline = "Couldn't load your plan",
                        body = "Planning needs a connection to load your goals and tasks.",
                        actionLabel = "Retry",
                        onAction = { onIntent(PlanIntent.Refresh) },
                    )
                }

                else -> PlanSkeleton()
            }
        }

        // The goal-actuals decision (Part 3, rule 3): a bottom sheet, never a screen.
        if (state.actuals != null) {
            ActualsSheet(draft = state.actuals, onIntent = onIntent)
        }

        // One-shot rejection copy — quiet danger-wash banner, self-clearing.
        MessageBanner(
            message = state.message,
            onShown = { onIntent(PlanIntent.MessageShown) },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding(),
        )
    }
}

// ─── The list ─────────────────────────────────────────────────────────────────

@Composable
private fun PlanList(
    plan: DayPlan,
    state: PlanUiState,
    onIntent: (PlanIntent) -> Unit,
    onBack: () -> Unit,
) {
    // Dedupe the pullable rails against what's already committed today so a
    // background reconcile can't briefly show a task in both places.
    val plannedTaskIds = remember(plan.items) { plan.items.mapNotNull { it.taskId }.toSet() }
    val plannedGoalIds = remember(plan.items) { plan.items.mapNotNull { it.goalId }.toSet() }

    val pullableTasks: ImmutableList<PlanItem> = remember(plan.assignedTasks, plannedTaskIds) {
        plan.assignedTasks.filter { it.taskId == null || it.taskId !in plannedTaskIds }.toImmutableList()
    }
    val pullableGoals: ImmutableList<PullableGoal> = remember(plan.pullableGoals, plannedGoalIds) {
        plan.pullableGoals.filter { it.id !in plannedGoalIds }.toImmutableList()
    }

    val nothingToPlan = plan.items.isEmpty() &&
        pullableTasks.isEmpty() &&
        pullableGoals.isEmpty() &&
        plan.goals.isEmpty() &&
        plan.overdue.isEmpty()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = AltusDimens.space12),
    ) {
        item(key = "meter", contentType = "meter") {
            MeterCard(
                plan = plan,
                onBack = onBack,
                modifier = Modifier
                    .padding(horizontal = AltusDimens.screenGutter)
                    .padding(top = AltusDimens.space3, bottom = AltusDimens.space4),
            )
        }

        item(key = "composer", contentType = "composer") {
            PersonalComposer(
                value = state.draftTitle,
                adding = state.addingPersonal,
                onValueChange = { onIntent(PlanIntent.DraftTitleChanged(it)) },
                onAdd = { onIntent(PlanIntent.AddPersonal) },
                modifier = Modifier
                    .padding(horizontal = AltusDimens.screenGutter)
                    .padding(bottom = AltusDimens.space4),
            )
        }

        if (nothingToPlan) {
            item(key = "empty", contentType = "empty") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = AltusDimens.space8, bottom = AltusDimens.space8),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyState(
                        headline = "Nothing waiting",
                        body = "Add your own commitments above to plan the day.",
                    )
                }
            }
        }

        // What's already committed today.
        if (plan.items.isNotEmpty()) {
            item(key = "h-planned", contentType = "header") {
                SectionHeader(title = "Today's plan", count = "${plan.items.size}")
            }
            items(plan.items, key = { "planned-${it.id}" }, contentType = { "planned" }) { item ->
                PlannedRow(item = item)
            }
        }

        // Pull from today's assigned tasks.
        if (pullableTasks.isNotEmpty()) {
            item(key = "h-assigned", contentType = "header") {
                SectionHeader(title = "Pull from assigned", count = "${pullableTasks.size}")
            }
            items(pullableTasks, key = { "task-${it.id}" }, contentType = { "pullable" }) { item ->
                val key = item.taskId?.let(PlanPendingKeys::task) ?: "task-${item.id}"
                AddableRow(
                    title = item.title,
                    meta = item.metaLine(),
                    pending = key in state.pendingKeys,
                    onAdd = { item.taskId?.let { onIntent(PlanIntent.PullTask(it)) } },
                )
            }
        }

        // Pull from this week's goals.
        if (pullableGoals.isNotEmpty()) {
            item(key = "h-goals-pull", contentType = "header") {
                SectionHeader(title = "Weekly goals", count = "${pullableGoals.size}")
            }
            items(pullableGoals, key = { "pull-goal-${it.id}" }, contentType = { "pullable" }) { goal ->
                AddableRow(
                    title = goal.displayTitle(),
                    meta = goal.metaLine(),
                    pending = PlanPendingKeys.goal(goal.id) in state.pendingKeys,
                    onAdd = { onIntent(PlanIntent.PullGoal(goal.id)) },
                )
            }
        }

        // Goals in play today — log the actual (the detent-slider sheet).
        if (plan.goals.isNotEmpty()) {
            item(key = "h-goals-log", contentType = "header") {
                SectionHeader(title = "Today's goals", count = "${plan.goals.size}")
            }
            items(plan.goals, key = { "goal-${it.id}" }, contentType = { "loggable" }) { goal ->
                GoalActualRow(
                    goal = goal,
                    onLog = { onIntent(PlanIntent.OpenActuals(goal)) },
                )
            }
        }

        // Overdue — re-commit into today.
        if (plan.overdue.isNotEmpty()) {
            item(key = "h-overdue", contentType = "header") {
                SectionHeader(title = "Overdue", count = "${plan.overdue.size}")
            }
            items(plan.overdue, key = { "overdue-${it.id}" }, contentType = { "pullable" }) { item ->
                AddableRow(
                    title = item.title,
                    meta = item.metaLine(),
                    pending = PlanPendingKeys.overdue(item.id) in state.pendingKeys,
                    danger = true,
                    onAdd = { onIntent(PlanIntent.AddOverdue(item)) },
                )
            }
        }
    }
}

// ─── Commitment meter ─────────────────────────────────────────────────────────

/** The pinned mono "2/5" in the app bar — the always-visible commitment count. */
@Composable
private fun MeterPill(plannedCount: Int, minItems: Int) {
    val tokens = AltusTheme.tokens
    val satisfied = plannedCount >= minItems
    Text(
        text = "$plannedCount/$minItems",
        style = AltusType.monoData,
        color = if (satisfied) tokens.success.color else MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.padding(end = AltusDimens.space4),
    )
}

/**
 * The hero meter: mono `n / 5`, a swept progress track (`ring-sweep` timing on
 * a linear bar), and the single next-step line. When the gate is fully cleared
 * it turns success and offers the one-tap route back to clock-in.
 */
@Composable
private fun MeterCard(
    plan: DayPlan,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    val gateCleared = plan.satisfied && !plan.needsGoalActuals
    val target = if (plan.minItems <= 0) 1f else (plan.plannedCount.toFloat() / plan.minItems).coerceIn(0f, 1f)
    val fraction by animateFloatAsState(
        targetValue = target,
        animationSpec = AltusTheme.motion.ringSweep,
        label = "MeterSweep",
    )
    val trackColor = if (gateCleared) tokens.success.color else scheme.primary

    val nextLine = when {
        gateCleared -> "You're set — clock in when you're ready."
        plan.satisfied && plan.needsGoalActuals -> "Log today's progress on your goals to finish."
        else -> "Add ${plan.remaining} more to unlock clock-in."
    }

    AltusCard(
        modifier = modifier,
        accentKeyline = tokens.accents.goals,
    ) {
        Text(
            text = "COMMITMENT",
            style = AltusType.caption,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = "${plan.plannedCount}",
                style = AltusType.numeralStat,
                color = if (gateCleared) tokens.success.color else scheme.onSurface,
            )
            Text(
                text = " / ${plan.minItems}",
                style = AltusType.monoData,
                color = tokens.ink400,
                modifier = Modifier.padding(bottom = 4.dp),
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))
        // Progress track — hairline bed, swept fill.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(tokens.hairline),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .height(8.dp)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(trackColor),
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Text(
            text = nextLine,
            style = AltusType.body,
            color = if (gateCleared) tokens.success.color else scheme.onSurfaceVariant,
        )
        if (gateCleared) {
            Spacer(Modifier.height(AltusDimens.space3))
            AltusPrimaryButton(
                text = "Back to clock-in",
                onClick = onBack,
                height = AltusDimens.actionPrimary,
            )
        }
    }
}

// ─── Composer ─────────────────────────────────────────────────────────────────

/** Type a personal commitment; Enter or the "+" pill adds it to today. */
@Composable
private fun PersonalComposer(
    value: String,
    adding: Boolean,
    onValueChange: (String) -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = currentHaptics()
    val canAdd = value.isNotBlank() && !adding
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        AltusTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            label = "Add your own",
            placeholder = "A commitment for today",
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    if (canAdd) {
                        haptics.commitTick()
                        onAdd()
                    }
                },
            ),
        )
        AddToTodayChip(
            pending = adding,
            enabled = canAdd,
            onAdd = {
                haptics.commitTick()
                onAdd()
            },
            modifier = Modifier.padding(bottom = 4.dp),
        )
    }
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

/** A 64dp pullable row: title + meta left, the "+ Add" morph chip right. */
@Composable
private fun AddableRow(
    title: String,
    meta: String?,
    pending: Boolean,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
) {
    val haptics = currentHaptics()
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowText(title = title, meta = meta, modifier = Modifier.weight(1f), danger = danger)
            Spacer(Modifier.width(AltusDimens.space3))
            AddToTodayChip(
                pending = pending,
                enabled = !pending,
                onAdd = {
                    haptics.commitTick()
                    onAdd()
                },
            )
        }
        RowDivider(danger = danger)
    }
}

/** An already-committed row — inert, 92% opacity, success check (S5 grammar). */
@Composable
private fun PlannedRow(item: PlanItem, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .alpha(0.92f)
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowText(title = item.title, meta = item.metaLine(), modifier = Modifier.weight(1f))
            Spacer(Modifier.width(AltusDimens.space3))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
            ) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = tokens.success.color,
                    modifier = Modifier.size(16.dp),
                )
                Text(text = "Planned", style = AltusType.label, color = tokens.success.color)
            }
        }
        RowDivider()
    }
}

/** A live goal: title + pct meta left, "Log" ghost that opens the sheet. */
@Composable
private fun GoalActualRow(
    goal: PlannerGoal,
    onLog: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowText(
                title = goal.displayTitle(),
                meta = goal.logMetaLine(),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            AltusGhostButton(
                text = if (goal.loggedToday) "Update" else "Log",
                onClick = onLog,
                height = 36.dp,
                contentColor = if (goal.loggedToday) tokens.success.color else MaterialTheme.colorScheme.primary,
            )
        }
        RowDivider()
    }
}

@Composable
private fun RowText(
    title: String,
    meta: String?,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(AltusDimens.space1)) {
        Text(
            text = title,
            style = AltusType.heading,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (meta != null) {
            Text(
                text = meta,
                style = AltusType.label,
                color = if (danger) tokens.danger.color else tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun RowDivider(danger: Boolean = false) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = AltusDimens.screenGutter)
            .height(AltusDimens.hairline)
            .background(if (danger) tokens.danger.wash else tokens.hairline),
    )
}

/**
 * The "+ Add to today" morph chip — the commit-morph grammar (Signature 2):
 * an outlined "Add" pill that swaps IN PLACE to a spinner while the online
 * commit is in flight, width held.
 */
@Composable
private fun AddToTodayChip(
    pending: Boolean,
    enabled: Boolean,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val motion = AltusTheme.motion

    Box(
        modifier = modifier
            .height(36.dp)
            .widthChip()
            .clip(AltusShapeTokens.pill)
            .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill)
            .tapSettleClickable(
                enabled = enabled && !pending,
                withRipple = true,
                onClickLabel = "Add to today",
                onClick = onAdd,
            ),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = pending,
            transitionSpec = {
                (fadeIn(motion.tabFadeIn) togetherWith fadeOut(motion.tabFadeOut))
                    .using(SizeTransform(clip = false))
            },
            label = "AddMorph",
        ) { isPending ->
            if (isPending) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = scheme.primary,
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
                    modifier = Modifier.padding(horizontal = AltusDimens.space3),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = null,
                        tint = if (enabled) scheme.primary else tokens.ink300,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Add",
                        style = AltusType.label,
                        color = if (enabled) scheme.primary else tokens.ink300,
                    )
                }
            }
        }
    }
}

private fun Modifier.widthChip(): Modifier = this.width(76.dp)

// ─── Goal-actuals sheet ───────────────────────────────────────────────────────

/** The 5%-detent slider sheet (S4): mono %, `CLOCK_TICK` per detent, note, Save. */
@Composable
private fun ActualsSheet(
    draft: ActualsDraft,
    onIntent: (PlanIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val haptics = currentHaptics()
    val sheetState = rememberAltusSheetState()

    AltusBottomSheet(
        state = sheetState,
        onDismissRequest = { onIntent(PlanIntent.DismissActuals) },
        peekHeight = 360.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(top = AltusDimens.space3, bottom = AltusDimens.space5),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
        ) {
            Text(
                text = "Log today's progress",
                style = AltusType.title2,
                color = scheme.onSurface,
            )
            Text(
                text = draft.goal.displayTitle(),
                style = AltusType.body,
                color = scheme.onSurfaceVariant,
            )
            Text(
                text = "${draft.pct}%",
                style = AltusType.numeralHero,
                color = if (draft.pct >= 100) tokens.success.color else scheme.primary,
            )
            Slider(
                value = draft.pct.toFloat(),
                onValueChange = { raw ->
                    // steps=19 yields clean 5-multiples; round away float epsilon.
                    val next = raw.roundToInt()
                    if (next != draft.pct) haptics.clockTick()
                    onIntent(PlanIntent.ActualPctChanged(next))
                },
                valueRange = 0f..100f,
                // 5% detents: 21 stops → 19 internal steps.
                steps = 19,
                enabled = !draft.submitting,
            )
            AltusTextField(
                value = draft.note,
                onValueChange = { onIntent(PlanIntent.ActualNoteChanged(it)) },
                label = "Note",
                placeholder = "Optional — what moved today",
                singleLine = false,
                enabled = !draft.submitting,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Default,
                ),
            )
            AltusPrimaryButton(
                text = "Save",
                onClick = { onIntent(PlanIntent.SubmitActual) },
                loading = draft.submitting,
            )
        }
    }
}

// ─── Message banner ───────────────────────────────────────────────────────────

@Composable
private fun MessageBanner(
    message: String?,
    onShown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (message == null) return
    val tokens = AltusTheme.tokens
    LaunchedEffect(message) {
        delay(3500)
        onShown()
    }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(AltusDimens.screenGutter),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(AltusShapeTokens.input)
                .background(tokens.danger.wash)
                .tapSettleClickable(withRipple = false, onClickLabel = "Dismiss", onClick = onShown)
                .padding(AltusDimens.space3),
        ) {
            Text(text = message, style = AltusType.body, color = tokens.danger.color)
        }
    }
}

// ─── Skeleton (Signature 8: exact resolved geometry) ──────────────────────────

@Composable
private fun PlanSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
    ) {
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp),
            shape = AltusShapeTokens.card,
        )
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = AltusShapeTokens.input,
        )
        repeat(5) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                ) {
                    SkeletonLine(width = 200.dp, height = 16.dp)
                    SkeletonLine(width = 120.dp, height = 12.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonBox(
                    modifier = Modifier.size(76.dp, 36.dp),
                    shape = AltusShapeTokens.pill,
                )
            }
        }
    }
}

// ─── Row copy helpers ─────────────────────────────────────────────────────────

/** "Client · Subject" for a plan item; blank fields never leave an orphan dot. */
private fun PlanItem.metaLine(): String? =
    listOfNotNull(client, subject).filter { it.isNotBlank() }
        .joinToString(" · ")
        .ifBlank { null }

private fun PullableGoal.metaLine(): String? =
    listOfNotNull(targetDone?.let { "Target $it" }, "Weight $weight")
        .joinToString(" · ")
        .ifBlank { null }

/** Live goal meta: current % + today's logged marker. */
private fun PlannerGoal.logMetaLine(): String {
    val progress = "$pctDone% done"
    return if (loggedToday) "$progress · logged today" else progress
}
