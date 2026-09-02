package com.altuscorp.altus.feature.gate

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.altuscorp.altus.feature.dcc.DccComplianceRing
import com.altuscorp.altus.feature.dcc.DccKpiRow
import com.altuscorp.altus.feature.dcc.DccKpiRowUi
import com.altuscorp.altus.feature.dcc.DccParticipantCard
import com.altuscorp.altus.feature.dcc.DccParticipantUi
import com.altuscorp.altus.feature.dcc.DccSectionUi
import com.altuscorp.altus.feature.dcc.DccStatus
import com.altuscorp.altus.feature.dcc.DccTrayHeader
import com.altuscorp.altus.feature.dcc.DccTrayUi
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AuroraBackground
import nl.dionsegijn.konfetti.compose.KonfettiView
import nl.dionsegijn.konfetti.core.Party
import nl.dionsegijn.konfetti.core.Position
import nl.dionsegijn.konfetti.core.emitter.Emitter
import java.util.concurrent.TimeUnit
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.CommitValue
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
import kotlinx.collections.immutable.ImmutableSet
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.persistentSetOf
import kotlinx.coroutines.delay

// ─────────────────────────────────────────────────────────────────────────────
// Screen contract (one @Immutable UiState + one sealed intent + one-shot effects)
// ─────────────────────────────────────────────────────────────────────────────

/** The goal-actuals sheet draft (5%-detent slider + optional note), shared with the Plan board. */
@Immutable
data class ActualsDraft(
    val goal: PlannerGoal,
    val pct: Int,
    val note: String,
    val submitting: Boolean = false,
)

/**
 * THE UNIFIED DAILY GATE state — both halves of the morning ritual reduced into
 * one render-ready snapshot. [planSatisfied] / [dccSatisfied] already fold in
 * the fail-open rule (a half that can't load is treated as satisfied), and
 * [allSatisfied] is the single unlock the enter action reads.
 */
@Immutable
data class DailyGateUiState(
    val isLoading: Boolean = true,
    /** Kill-switch off, or both halves cold-failed → enter straight through. */
    val bypass: Boolean = false,
    val planSatisfied: Boolean = false,
    val dccSatisfied: Boolean = false,
    // Plan half.
    val plan: DayPlan? = null,
    val planColdFailed: Boolean = false,
    val planLoadError: String? = null,
    val draftTitle: String = "",
    val addingPersonal: Boolean = false,
    val pendingKeys: ImmutableSet<String> = persistentSetOf(),
    val actuals: ActualsDraft? = null,
    // DCC half.
    val dccColdFailed: Boolean = false,
    val dccLoadError: String? = null,
    val ownerName: String = "",
    val dccDue: Int = 0,
    val dccFilled: Int = 0,
    val dccPct: Int = 0,
    val dccComplete: Boolean = false,
    val sections: ImmutableList<DccSectionUi> = persistentListOf(),
    val participants: ImmutableList<DccParticipantUi> = persistentListOf(),
    val trays: ImmutableList<DccTrayUi> = persistentListOf(),
    val dccShowEmpty: Boolean = false,
    val expandedParticipantIds: ImmutableSet<String> = persistentSetOf(),
    val expandedTrayKinds: ImmutableSet<String> = persistentSetOf(),
    // Shared.
    val message: String? = null,
) {
    val allSatisfied: Boolean get() = planSatisfied && dccSatisfied
    val dccFraction: Float
        get() = if (dccDue > 0) (dccFilled.toFloat() / dccDue).coerceIn(0f, 1f) else if (dccComplete) 1f else 0f
}

sealed interface GateIntent {
    data object RetryPlan : GateIntent
    data object RetryDcc : GateIntent
    data object MessageShown : GateIntent

    // Plan half.
    data class DraftTitleChanged(val value: String) : GateIntent
    data object AddPersonal : GateIntent
    data class PullTask(val taskId: String) : GateIntent
    data class PullGoal(val goalId: String) : GateIntent
    data class OpenActuals(val goal: PlannerGoal) : GateIntent
    data object DismissActuals : GateIntent
    data class ActualPctChanged(val pct: Int) : GateIntent
    data class ActualNoteChanged(val note: String) : GateIntent
    data object SubmitActual : GateIntent

    // DCC half.
    data class CommitItem(val itemId: String, val status: String?) : GateIntent
    data class CommitParticipant(val itemId: String, val subjectId: String, val status: String?) : GateIntent
    data class BulkParticipants(val itemId: String, val status: String?) : GateIntent
    data class ToggleParticipant(val itemId: String) : GateIntent
    data class ToggleTray(val kind: String) : GateIntent
}

/** One-shot effects the screen turns into haptics. */
sealed interface GateEffect {
    data object Reject : GateEffect
    data object ActualsSaved : GateEffect
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE UNIFIED DAILY GATE — the post-login wall that merges "plan your day" and
 * "daily compliance" into one scroll with a single "I'm done — enter". Shown
 * right after login/enrollment and BEFORE the app opens; [onEnter] lands on the
 * Hub / main app the instant both halves clear (or immediately on fail-open).
 *
 * FAIL-OPEN: [DailyGateUiState.bypass] (kill-switch off or both halves failed to
 * load) auto-enters, and each half fails open on its own load error — a hiccup
 * never locks anyone out.
 */
@Composable
fun DailyGateScreen(
    onEnter: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DailyGateViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val onIntent = viewModel::onIntent
    val haptics = currentHaptics()

    // FAIL-OPEN / kill-switch: nothing to gate → let the user straight through.
    LaunchedEffect(state.bypass) { if (state.bypass) onEnter() }

    // The unlock moment — a single heavy click when both halves close.
    LaunchedEffect(state.allSatisfied) { if (state.allSatisfied) haptics.daySeal() }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                GateEffect.Reject -> haptics.gateUhUh()
                GateEffect.ActualsSaved -> haptics.commitTick()
            }
        }
    }

    GateContent(
        state = state,
        onEnter = {
            haptics.commitTick()
            onEnter()
        },
        onIntent = onIntent,
        pendingFor = viewModel::pending,
        modifier = modifier,
    )
}

@Composable
private fun GateContent(
    state: DailyGateUiState,
    onEnter: () -> Unit,
    onIntent: (GateIntent) -> Unit,
    pendingFor: (String) -> kotlinx.coroutines.flow.Flow<Int>,
    modifier: Modifier = Modifier,
) {
    // Celebrate once when both rituals JUST completed — auto-dismiss after ~4.5s
    // so the konfetti overlay never lingers over the "enter" CTA.
    var celebrate by remember { mutableStateOf(false) }
    LaunchedEffect(state.allSatisfied) {
        celebrate = state.allSatisfied
        if (state.allSatisfied) {
            delay(4500)
            celebrate = false
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        // Premium brand backdrop (behind everything).
        AuroraBackground(Modifier.fillMaxSize())

        when {
            state.isLoading -> GateSkeleton(Modifier.statusBarsPadding())

            // statusBarsPadding on the whole content column so nothing — hero or
            // scrolled rows — ever slides under the system status/notification bar.
            else -> Column(Modifier.fillMaxSize().statusBarsPadding()) {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = AltusDimens.space8),
                ) {
                    item(key = "hero", contentType = "hero") {
                        GateHero(state = state)
                    }

                    planSection(state, onIntent)
                    dccSection(state, onIntent, pendingFor)
                }

                GateFooter(state = state, onEnter = onEnter, onIntent = onIntent)
            }
        }

        MessageBanner(
            message = state.message,
            onShown = { onIntent(GateIntent.MessageShown) },
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding(),
        )

        // Confetti rains over everything on completion (decorative; auto-clears).
        if (celebrate) {
            GateConfetti(modifier = Modifier.fillMaxSize())
        }
    }

    // The goal-actuals decision — a bottom sheet, never a screen (Plan grammar).
    if (state.actuals != null) {
        ActualsSheet(draft = state.actuals, onIntent = onIntent)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — greeting + the combined "two rituals" progress read
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun GateHero(state: DailyGateUiState, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val done = (if (state.planSatisfied) 1 else 0) + (if (state.dccSatisfied) 1 else 0)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space5, bottom = AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Text(text = "BEFORE YOU BEGIN", style = AltusType.caption, color = scheme.onSurfaceVariant)
        Text(
            text = greetingFor(state.ownerName),
            // Brand-gradient display type — the hero moment.
            style = AltusType.display.copy(
                brush = Brush.linearGradient(listOf(scheme.primary, tokens.deep)),
            ),
        )
        Text(
            text = "Two quick rituals open the day — plan it, then log yesterday's compliance.",
            style = AltusType.body,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = "$done / 2 done",
            style = AltusType.monoData,
            color = if (state.allSatisfied) tokens.success.color else scheme.onSurface,
        )
    }
}

private fun greetingFor(ownerName: String): String {
    val first = ownerName.trim().split(" ").firstOrNull()?.takeIf { it.isNotBlank() }
    return if (first != null) "Good morning, $first." else "Good morning."
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan half
// ─────────────────────────────────────────────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.planSection(
    state: DailyGateUiState,
    onIntent: (GateIntent) -> Unit,
) {
    item(key = "plan-header", contentType = "section-header") {
        RitualHeader(
            eyebrow = "RITUAL ONE",
            title = "Plan your day",
            satisfied = state.planSatisfied,
        )
    }

    val plan = state.plan
    when {
        plan != null -> {
            item(key = "plan-meter", contentType = "plan-meter") {
                PlanMeterCard(
                    plan = plan,
                    modifier = Modifier
                        .padding(horizontal = AltusDimens.screenGutter)
                        .padding(bottom = AltusDimens.space3),
                )
            }
            item(key = "plan-composer", contentType = "plan-composer") {
                PersonalComposer(
                    value = state.draftTitle,
                    adding = state.addingPersonal,
                    onValueChange = { onIntent(GateIntent.DraftTitleChanged(it)) },
                    onAdd = { onIntent(GateIntent.AddPersonal) },
                    modifier = Modifier
                        .padding(horizontal = AltusDimens.screenGutter)
                        .padding(bottom = AltusDimens.space3),
                )
            }
            planRails(plan, state, onIntent)
        }

        state.planColdFailed -> item(key = "plan-failopen", contentType = "notice") {
            FailOpenNotice(
                body = "Couldn't load your plan — this step is skipped so you're never stuck.",
                onRetry = { onIntent(GateIntent.RetryPlan) },
            )
        }

        else -> item(key = "plan-skel", contentType = "skeleton") { RailSkeleton() }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.planRails(
    plan: DayPlan,
    state: DailyGateUiState,
    onIntent: (GateIntent) -> Unit,
) {
    val plannedTaskIds = plan.items.mapNotNull { it.taskId }.toSet()
    val plannedGoalIds = plan.items.mapNotNull { it.goalId }.toSet()
    val pullableTasks = plan.assignedTasks.filter { it.taskId == null || it.taskId !in plannedTaskIds }
    val pullableGoals = plan.pullableGoals.filter { it.id !in plannedGoalIds }

    if (plan.items.isNotEmpty()) {
        item(key = "plan-committed-h", contentType = "sub-header") {
            SectionHeader(title = "Today's plan", count = "${plan.items.size}")
        }
        items(plan.items, key = { "planned-${it.id}" }, contentType = { "planned" }) { item ->
            PlannedRow(item = item)
        }
    }

    if (pullableTasks.isNotEmpty()) {
        item(key = "plan-assigned-h", contentType = "sub-header") {
            SectionHeader(title = "Pull from assigned", count = "${pullableTasks.size}")
        }
        items(pullableTasks, key = { "task-${it.id}" }, contentType = { "pullable" }) { item ->
            AddableRow(
                title = item.title,
                meta = item.metaLine(),
                pending = (item.taskId?.let(PendingKeys::task) ?: "task-${item.id}") in state.pendingKeys,
                onAdd = { item.taskId?.let { onIntent(GateIntent.PullTask(it)) } },
            )
        }
    }

    if (pullableGoals.isNotEmpty()) {
        item(key = "plan-goals-h", contentType = "sub-header") {
            SectionHeader(title = "Weekly goals", count = "${pullableGoals.size}")
        }
        items(pullableGoals, key = { "pull-goal-${it.id}" }, contentType = { "pullable" }) { goal ->
            AddableRow(
                title = goal.displayTitle(),
                meta = goal.metaLine(),
                pending = PendingKeys.goal(goal.id) in state.pendingKeys,
                onAdd = { onIntent(GateIntent.PullGoal(goal.id)) },
            )
        }
    }

    if (plan.goals.isNotEmpty()) {
        item(key = "plan-log-h", contentType = "sub-header") {
            SectionHeader(title = "Log today's progress", count = "${plan.goals.size}")
        }
        items(plan.goals, key = { "goal-${it.id}" }, contentType = { "loggable" }) { goal ->
            GoalActualRow(goal = goal, onLog = { onIntent(GateIntent.OpenActuals(goal)) })
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DCC half
// ─────────────────────────────────────────────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.dccSection(
    state: DailyGateUiState,
    onIntent: (GateIntent) -> Unit,
    pendingFor: (String) -> kotlinx.coroutines.flow.Flow<Int>,
) {
    item(key = "dcc-header", contentType = "section-header") {
        RitualHeader(
            eyebrow = "RITUAL TWO",
            title = "Daily compliance",
            satisfied = state.dccSatisfied,
        )
    }

    val hasContent = state.sections.isNotEmpty() || state.participants.isNotEmpty() || state.trays.isNotEmpty()

    when {
        hasContent -> {
            item(key = "dcc-ring", contentType = "dcc-ring") {
                DccMeterCard(
                    state = state,
                    modifier = Modifier
                        .padding(horizontal = AltusDimens.screenGutter)
                        .padding(bottom = AltusDimens.space3),
                )
            }

            state.sections.forEach { section ->
                item(key = "sec-${section.key}", contentType = "sub-header") {
                    SectionHeader(title = section.title, count = section.count)
                }
                items(section.items, key = { "sec-item-${it.id}" }, contentType = { "dcc-row" }) { item ->
                    DccKpiRow(
                        item = item,
                        editable = true,
                        pendingFor = pendingFor,
                        onCommit = { value -> onIntent(GateIntent.CommitItem(item.id, DccStatus.fromCommit(value))) },
                        onClear = { onIntent(GateIntent.CommitItem(item.id, null)) },
                        onOpenSheet = { onIntent(GateIntent.CommitItem(item.id, DccStatus.DONE)) },
                    )
                }
            }

            if (state.participants.isNotEmpty()) {
                item(key = "dcc-part-h", contentType = "sub-header") {
                    SectionHeader(title = "Roster KPIs", count = "${state.participants.size}")
                }
                items(state.participants, key = { "part-${it.id}" }, contentType = { "dcc-participant" }) { participant ->
                    DccParticipantCard(
                        participant = participant,
                        expanded = participant.id in state.expandedParticipantIds,
                        editable = true,
                        onToggle = { onIntent(GateIntent.ToggleParticipant(participant.id)) },
                        onBulk = { status -> onIntent(GateIntent.BulkParticipants(participant.id, status)) },
                        onCommitSubject = { subjectId, status ->
                            onIntent(GateIntent.CommitParticipant(participant.id, subjectId, status))
                        },
                    )
                }
            }

            state.trays.forEach { tray ->
                item(key = "tray-${tray.kind}", contentType = "dcc-tray-header") {
                    DccTrayHeader(
                        tray = tray,
                        expanded = tray.kind in state.expandedTrayKinds,
                        onToggle = { onIntent(GateIntent.ToggleTray(tray.kind)) },
                    )
                }
                if (tray.kind in state.expandedTrayKinds) {
                    items(tray.items, key = { "tray-item-${it.id}" }, contentType = { "dcc-row" }) { item ->
                        DccKpiRow(
                            item = item,
                            editable = true,
                            pendingFor = pendingFor,
                            onCommit = { value -> onIntent(GateIntent.CommitItem(item.id, DccStatus.fromCommit(value))) },
                            onClear = { onIntent(GateIntent.CommitItem(item.id, null)) },
                            onOpenSheet = { onIntent(GateIntent.CommitItem(item.id, DccStatus.DONE)) },
                        )
                    }
                }
            }
        }

        state.dccShowEmpty -> item(key = "dcc-empty", contentType = "notice") {
            Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = AltusDimens.space5),
                contentAlignment = Alignment.Center,
            ) {
                EmptyState(
                    headline = "Nothing due.",
                    body = "No compliance items are waiting — this ritual is already clear.",
                )
            }
        }

        state.dccColdFailed -> item(key = "dcc-failopen", contentType = "notice") {
            FailOpenNotice(
                body = "Couldn't load compliance — this step is skipped so you're never stuck.",
                onRetry = { onIntent(GateIntent.RetryDcc) },
            )
        }

        else -> item(key = "dcc-skel", contentType = "skeleton") { RailSkeleton() }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer — the single "I'm done — enter"
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun GateFooter(
    state: DailyGateUiState,
    onEnter: () -> Unit,
    onIntent: (GateIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    val hint = when {
        state.allSatisfied -> "Both rituals complete — you're set."
        !state.planSatisfied && !state.dccSatisfied -> "Finish both rituals to enter."
        !state.planSatisfied -> "Finish planning your day to enter."
        else -> "Finish today's compliance to enter."
    }

    // A gentle breathing pulse on the CTA once it unlocks — draws the eye without
    // being noisy; frozen at rest while still locked.
    val ctaScale = if (state.allSatisfied) {
        val transition = rememberInfiniteTransition(label = "cta")
        val s by transition.animateFloat(
            initialValue = 1f,
            targetValue = 1.025f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 1000),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "cta-scale",
        )
        s
    } else {
        1f
    }

    Column(
        modifier = Modifier
            .fillMaxWidth(),
    ) {
        // Soft scrim — content dissolves into the footer instead of a hard edge.
        Box(
            Modifier
                .fillMaxWidth()
                .height(AltusDimens.space4)
                .background(Brush.verticalGradient(listOf(Color.Transparent, tokens.surface))),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(tokens.surface)
                .navigationBarsPadding()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(bottom = AltusDimens.space3),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        ) {
            Text(
                text = hint,
                style = AltusType.label,
                color = if (state.allSatisfied) tokens.success.color else scheme.onSurfaceVariant,
            )
            AltusPrimaryButton(
                text = if (state.allSatisfied) "I'm done — enter" else "Finish both rituals",
                onClick = onEnter,
                enabled = state.allSatisfied,
                modifier = Modifier.scale(ctaScale),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Celebration — konfetti burst when both rituals complete
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun GateConfetti(modifier: Modifier = Modifier) {
    // One-shot burst from just above centre, in the brand palette. Remembered so
    // it emits exactly once per mount (the emitter has a finite duration).
    val party = remember {
        Party(
            speed = 0f,
            maxSpeed = 26f,
            damping = 0.9f,
            spread = 360,
            colors = listOf(
                0xFFE10600.toInt(), // Altus red
                0xFFFFC94E.toInt(), // zest gold
                0xFF16A34A.toInt(), // success green
                0xFF2563EB.toInt(), // info blue
                0xFFFFFFFF.toInt(), // white
            ),
            emitter = Emitter(duration = 150, TimeUnit.MILLISECONDS).max(140),
            position = Position.Relative(0.5, 0.30),
        )
    }
    KonfettiView(modifier = modifier, parties = listOf(party))
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared pieces
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun RitualHeader(eyebrow: String, title: String, satisfied: Boolean) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space4, bottom = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AltusDimens.space1)) {
            Text(text = eyebrow, style = AltusType.caption, color = scheme.onSurfaceVariant)
            Text(text = title, style = AltusType.title2, color = scheme.onSurface)
        }
        if (satisfied) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
                modifier = Modifier
                    .clip(AltusShapeTokens.pill)
                    .background(tokens.success.wash)
                    .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
            ) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = tokens.success.color,
                    modifier = Modifier.size(16.dp),
                )
                Text(text = "Done", style = AltusType.label, color = tokens.success.color)
            }
        }
    }
}

/** The pinned "n / 5" plan meter (mirrors the Plan board's MeterCard, minus the route). */
@Composable
private fun PlanMeterCard(plan: DayPlan, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val gateCleared = plan.satisfied && !plan.needsGoalActuals
    val target = if (plan.minItems <= 0) 1f else (plan.plannedCount.toFloat() / plan.minItems).coerceIn(0f, 1f)
    val fraction by animateFloatAsState(
        targetValue = target,
        animationSpec = AltusTheme.motion.ringSweep,
        label = "GatePlanSweep",
    )
    val trackColor = if (gateCleared) tokens.success.color else scheme.primary
    val nextLine = when {
        gateCleared -> "Planned — this ritual is clear."
        plan.satisfied && plan.needsGoalActuals -> "Log today's progress on your goals to finish."
        else -> "Add ${plan.remaining} more to clear this ritual."
    }

    AltusCard(modifier = modifier, accentKeyline = tokens.accents.goals) {
        Text(text = "COMMITMENT", style = AltusType.caption, color = scheme.onSurfaceVariant)
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
    }
}

/** The DCC compliance ring summary card — the pinned ring + filled/due. */
@Composable
private fun DccMeterCard(state: DailyGateUiState, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    AltusCard(modifier = modifier, accentKeyline = tokens.accents.dcc) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space4),
        ) {
            DccComplianceRing(
                fraction = state.dccFraction,
                complete = state.dccComplete,
                diameter = 56.dp,
                strokeWidth = 6.dp,
                showPercent = true,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AltusDimens.space1)) {
                Text(text = "COMPLIANCE", style = AltusType.caption, color = scheme.onSurfaceVariant)
                Text(
                    text = "${state.dccFilled}/${state.dccDue} filled",
                    style = AltusType.monoData,
                    color = if (state.dccComplete) tokens.success.color else scheme.onSurface,
                )
                Text(
                    text = if (state.dccComplete) "All slots logged — clear." else "Mark each item Done or NA to clear.",
                    style = AltusType.body,
                    color = if (state.dccComplete) tokens.success.color else scheme.onSurfaceVariant,
                )
            }
        }
    }
}

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
        modifier = modifier.fillMaxWidth().imePadding(),
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
            keyboardActions = KeyboardActions(onDone = { if (canAdd) { haptics.commitTick(); onAdd() } }),
        )
        AddChip(
            pending = adding,
            enabled = canAdd,
            onAdd = { haptics.commitTick(); onAdd() },
            modifier = Modifier.padding(bottom = 4.dp),
        )
    }
}

@Composable
private fun AddableRow(
    title: String,
    meta: String?,
    pending: Boolean,
    onAdd: () -> Unit,
) {
    val haptics = currentHaptics()
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowText(title = title, meta = meta, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(AltusDimens.space3))
            AddChip(pending = pending, enabled = !pending, onAdd = { haptics.commitTick(); onAdd() })
        }
        RowDivider()
    }
}

@Composable
private fun PlannedRow(item: PlanItem) {
    val tokens = AltusTheme.tokens
    Column(Modifier.fillMaxWidth()) {
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

@Composable
private fun GoalActualRow(goal: PlannerGoal, onLog: () -> Unit) {
    val tokens = AltusTheme.tokens
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowText(title = goal.displayTitle(), meta = goal.logMetaLine(), modifier = Modifier.weight(1f))
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
private fun RowText(title: String, meta: String?, modifier: Modifier = Modifier) {
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
            Text(text = meta, style = AltusType.label, color = tokens.ink400, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun RowDivider() {
    val tokens = AltusTheme.tokens
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = AltusDimens.screenGutter)
            .height(AltusDimens.hairline)
            .background(tokens.hairline),
    )
}

/** The "+ Add" morph chip — outlined pill that swaps to a spinner while committing. */
@Composable
private fun AddChip(
    pending: Boolean,
    enabled: Boolean,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .height(36.dp)
            .width(76.dp)
            .clip(AltusShapeTokens.pill)
            .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill)
            .tapSettleClickable(enabled = enabled && !pending, withRipple = true, onClickLabel = "Add to today", onClick = onAdd),
        contentAlignment = Alignment.Center,
    ) {
        if (pending) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = scheme.primary)
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    tint = if (enabled) scheme.primary else tokens.ink300,
                    modifier = Modifier.size(16.dp),
                )
                Text(text = "Add", style = AltusType.label, color = if (enabled) scheme.primary else tokens.ink300)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal-actuals sheet (5%-detent slider) — same grammar as the Plan board
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ActualsSheet(draft: ActualsDraft, onIntent: (GateIntent) -> Unit) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val haptics = currentHaptics()
    val sheetState = rememberAltusSheetState()

    AltusBottomSheet(
        state = sheetState,
        onDismissRequest = { onIntent(GateIntent.DismissActuals) },
        peekHeight = 360.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(top = AltusDimens.space3, bottom = AltusDimens.space5),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
        ) {
            Text(text = "Log today's progress", style = AltusType.title2, color = scheme.onSurface)
            Text(text = draft.goal.displayTitle(), style = AltusType.body, color = scheme.onSurfaceVariant)
            Text(
                text = "${draft.pct}%",
                style = AltusType.numeralHero,
                color = if (draft.pct >= 100) tokens.success.color else scheme.primary,
            )
            Slider(
                value = draft.pct.toFloat(),
                onValueChange = { raw ->
                    val next = raw.roundToInt()
                    if (next != draft.pct) haptics.clockTick()
                    onIntent(GateIntent.ActualPctChanged(next))
                },
                valueRange = 0f..100f,
                steps = 19,
                enabled = !draft.submitting,
            )
            AltusTextField(
                value = draft.note,
                onValueChange = { onIntent(GateIntent.ActualNoteChanged(it)) },
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
                onClick = { onIntent(GateIntent.SubmitActual) },
                loading = draft.submitting,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Notices, banner, skeletons
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun FailOpenNotice(body: String, onRetry: () -> Unit) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
        accentKeyline = tokens.warn.color,
    ) {
        Text(text = body, style = AltusType.body, color = MaterialTheme.colorScheme.onSurface)
        Spacer(Modifier.height(AltusDimens.space2))
        AltusGhostButton(text = "Retry", onClick = onRetry, height = 40.dp)
    }
}

@Composable
private fun MessageBanner(message: String?, onShown: () -> Unit, modifier: Modifier = Modifier) {
    if (message == null) return
    val tokens = AltusTheme.tokens
    LaunchedEffect(message) {
        delay(3500)
        onShown()
    }
    Box(modifier = modifier.fillMaxWidth().padding(AltusDimens.screenGutter)) {
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

@Composable
private fun RailSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        repeat(3) {
            Row(
                modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
                    SkeletonLine(width = 200.dp, height = 16.dp)
                    SkeletonLine(width = 120.dp, height = 12.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonBox(modifier = Modifier.size(76.dp, 36.dp), shape = AltusShapeTokens.pill)
            }
        }
    }
}

@Composable
private fun GateSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space6),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
    ) {
        SkeletonLine(width = 240.dp, height = 28.dp)
        SkeletonLine(width = 300.dp, height = 16.dp)
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(140.dp), shape = AltusShapeTokens.card)
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(120.dp), shape = AltusShapeTokens.card)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row copy helpers
// ─────────────────────────────────────────────────────────────────────────────

private fun PlanItem.metaLine(): String? =
    listOfNotNull(client, subject).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { null }

private fun PullableGoal.metaLine(): String? =
    listOfNotNull(targetDone?.let { "Target $it" }, "Weight $weight").joinToString(" · ").ifBlank { null }

private fun PlannerGoal.logMetaLine(): String {
    val progress = "$pctDone% done"
    return if (loggedToday) "$progress · logged today" else progress
}

// Show the goal's actual TARGET as the title (e.g. "Add People's Gives Module"),
// not the client — the client/subject go on the meta line beneath.
private fun PlannerGoal.displayTitle(): String =
    targetDone?.takeIf { it.isNotBlank() }
        ?: subject?.takeIf { it.isNotBlank() }
        ?: client?.takeIf { it.isNotBlank() }
        ?: "Weekly goal"

private fun PullableGoal.displayTitle(): String =
    targetDone?.takeIf { it.isNotBlank() }
        ?: subject?.takeIf { it.isNotBlank() }
        ?: client?.takeIf { it.isNotBlank() }
        ?: "Weekly goal"
