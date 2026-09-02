@file:OptIn(
    ExperimentalSharedTransitionApi::class,
    ExperimentalFoundationApi::class,
)

package com.altuscorp.altus.feature.tasks.detail

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.domain.model.TaskDetail
import com.altuscorp.altus.feature.tasks.detail.components.ActionRail
import com.altuscorp.altus.feature.tasks.detail.components.MetaLedger
import com.altuscorp.altus.feature.tasks.detail.components.TimelineEventRow
import com.altuscorp.altus.navigation.LocalNavAnimatedVisibilityScope
import com.altuscorp.altus.navigation.LocalSharedTransitionScope
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.StatusPill
import com.altuscorp.altus.ui.designsystem.rememberAltusSheetState
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.coroutines.launch

/**
 * S7 Task Detail — the card that became a screen.
 *
 * Entered via `sharedBounds("task-{id}")`: the list card's title + status pill
 * ride the morph into this header. Anatomy, top to bottom:
 *   1. A quiet back row on canvas (the title lives in the header body, not a bar).
 *   2. Header — mono `#1042` eyebrow, `title-1` title, status pill + priority
 *      dot, "Assigned by Manan · Created 12 Jun". The status pill SHAKES 4dp
 *      twice on a 409 optimistic-lock conflict (never a modal apology).
 *   3. [MetaLedger] — the 2-col hairline grid (Client/Subject/Due/Doer/…).
 *   4. Description block (only when present).
 *   5. [ActionRail] — pinned above the fold as a sticky header: primary
 *      transition filled + remaining as ghost chips → status sheet.
 *   6. [TimelineEventRow] thread — hairline-spined, status-coloured nodes,
 *      optimistic comments at 60% opacity.
 *   7. A docked composer, `imePadding()`, optimistic send.
 *
 * Reads are cache-first so the body paints instantly behind the morph; a
 * reconcile fires on entry. Mutations are optimistic fire-and-forget through
 * the outbox — the screen only NARRATES a permanent refusal (shake + haptic +
 * snackbar); the repository already reverted the cache.
 */
@Composable
fun TaskDetailScreen(
    taskId: String,
    onBack: () -> Unit,
    viewModel: TaskDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = currentHaptics()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    // The optimistic-lock conflict shake: a single Animatable retargeted on
    // every ConflictShake, translated into the status pill via a lambda so the
    // 4dp wobble never recomposes the header (§1.5 — any tap mid-animation
    // retargets the same Animatable, never queues).
    val pillShake = remember { Animatable(0f) }

    LaunchedEffect(viewModel, haptics) {
        viewModel.effects.collect { effect ->
            when (effect) {
                TaskDetailEffect.ConflictShake -> {
                    haptics.gateUhUh()
                    pillShake.animateTo(
                        targetValue = 0f,
                        animationSpec = keyframes {
                            durationMillis = 300
                            0f at 0
                            4f at 40
                            -4f at 90
                            4f at 140
                            -3f at 190
                            2f at 240
                            0f at 300
                        },
                    )
                    scope.launch {
                        snackbarHostState.showSnackbar("Task changed elsewhere — refreshed")
                    }
                }

                is TaskDetailEffect.MutationRejected -> {
                    haptics.gateUhUh()
                    scope.launch { snackbarHostState.showSnackbar(effect.message) }
                }
            }
        }
    }

    TaskDetailContent(
        taskId = taskId,
        state = state,
        snackbarHostState = snackbarHostState,
        pillShakeProvider = { pillShake.value },
        onBack = onBack,
        onIntent = viewModel::onIntent,
    )
}

@Composable
private fun TaskDetailContent(
    taskId: String,
    state: TaskDetailUiState,
    snackbarHostState: SnackbarHostState,
    pillShakeProvider: () -> Float,
    onBack: () -> Unit,
    onIntent: (TaskDetailIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            BackRow(onBack = onBack)

            // The content area takes the remaining height so the docked composer
            // stays pinned to the visible bottom (a fillMaxSize child of a Column
            // measures against the FULL height, not what's left — hence weight).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                when {
                    state.showSkeleton -> DetailSkeleton()

                    state.notFound -> GoneState(onBack = onBack)

                    state.loadFailed -> EmptyState(
                        headline = "Couldn't load.",
                        body = "Check your connection and try again.",
                        actionLabel = "Retry",
                        onAction = { onIntent(TaskDetailIntent.Refresh) },
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = AltusDimens.space8),
                    )

                    state.detail != null -> LoadedDetail(
                        taskId = taskId,
                        detail = state.detail,
                        pendingMutations = state.pendingMutations,
                        composerText = state.composerText,
                        canSend = state.canSend,
                        pillShakeProvider = pillShakeProvider,
                        onIntent = onIntent,
                    )
                }
            }
        }

        // Snackbars float above the docked composer.
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .imePadding()
                .padding(bottom = 96.dp),
        ) { data ->
            Snackbar(
                snackbarData = data,
                containerColor = tokens.topMost,
                contentColor = MaterialTheme.colorScheme.onSurface,
            )
        }

        // Status sheet: presence-controlled decision surface (Part 3, rule 3).
        val sheetFor = state.statusSheetFor
        if (sheetFor != null && state.detail != null) {
            StatusChangeSheet(
                targetLabel = state.detail.displayFor(sheetFor).label,
                onDismiss = { onIntent(TaskDetailIntent.DismissStatusSheet) },
                onConfirm = { note ->
                    onIntent(TaskDetailIntent.CommitStatus(status = sheetFor, note = note))
                },
            )
        }
    }
}

// ─── Loaded body ──────────────────────────────────────────────────────────────

@Composable
private fun LoadedDetail(
    taskId: String,
    detail: TaskDetail,
    pendingMutations: Int,
    composerText: String,
    canSend: Boolean,
    pillShakeProvider: () -> Float,
    onIntent: (TaskDetailIntent) -> Unit,
) {
    val hasRail = detail.allowedTransitions.isNotEmpty()

    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = PaddingValues(bottom = AltusDimens.space8),
        ) {
            item(key = "header", contentType = "header") {
                DetailHeader(
                    taskId = taskId,
                    detail = detail,
                    pillShakeProvider = pillShakeProvider,
                )
            }

            item(key = "meta", contentType = "meta") {
                MetaLedger(
                    detail = detail,
                    modifier = Modifier.padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.cardGap,
                    ),
                )
            }

            // The task description is now the hero headline in the header
            // (mirrors web sir's changes #11), so it is no longer repeated
            // here as a separate body block.

            // The rail pins above the fold; the thread scrolls beneath it.
            if (hasRail) {
                stickyHeader(key = "rail", contentType = "rail") {
                    ActionRail(
                        transitions = detail.allowedTransitions,
                        displayFor = detail::displayFor,
                        pendingMutations = pendingMutations,
                        onCommitPrimary = { status ->
                            onIntent(TaskDetailIntent.CommitStatus(status = status, note = null))
                        },
                        onOpenSheet = { status ->
                            onIntent(TaskDetailIntent.OpenStatusSheet(status))
                        },
                    )
                }
            }

            item(key = "activity-header", contentType = "section-header") {
                SectionHeader(
                    title = "Activity",
                    count = detail.timeline.size.toString(),
                    modifier = Modifier.padding(
                        top = AltusDimens.sectionGap - AltusDimens.cardGap,
                    ),
                )
            }

            if (detail.timeline.isEmpty()) {
                item(key = "activity-empty", contentType = "activity-empty") {
                    Text(
                        text = "No activity yet.",
                        style = AltusType.body,
                        color = AltusTheme.tokens.ink400,
                        modifier = Modifier.padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space3,
                        ),
                    )
                }
            } else {
                val firstId = detail.timeline.first().id
                val lastId = detail.timeline.last().id
                items(
                    items = detail.timeline,
                    key = { it.id },
                    contentType = { "timeline-event" },
                ) { event ->
                    TimelineEventRow(
                        event = event,
                        displayFor = detail::displayFor,
                        isFirst = event.id == firstId,
                        isLast = event.id == lastId,
                    )
                }
            }
        }

        if (detail.canComment) {
            Composer(
                value = composerText,
                canSend = canSend,
                onChange = { onIntent(TaskDetailIntent.ComposerChanged(it)) },
                onSend = { onIntent(TaskDetailIntent.SendComment) },
            )
        }
    }
}

// ─── Header ───────────────────────────────────────────────────────────────────

@Composable
private fun DetailHeader(
    taskId: String,
    detail: TaskDetail,
    pillShakeProvider: () -> Float,
) {
    val tokens = AltusTheme.tokens

    // sharedBounds: the list card grows into this header (keys `task-{id}`,
    // Part 3). Degrades to a plain header when the scopes are absent (e.g. a
    // deep-link entry with no originating card).
    val sharedScope = LocalSharedTransitionScope.current
    val animatedScope = LocalNavAnimatedVisibilityScope.current
    val sharedModifier = if (sharedScope != null && animatedScope != null) {
        with(sharedScope) {
            Modifier.sharedBounds(
                rememberSharedContentState(key = "task-$taskId"),
                animatedVisibilityScope = animatedScope,
            )
        }
    } else {
        Modifier
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(sharedModifier)
            .padding(
                horizontal = AltusDimens.screenGutter,
                vertical = AltusDimens.space2,
            ),
    ) {
        // Mono eyebrow — the friendly task number.
        Text(
            text = detail.taskNo?.let { "#$it" } ?: "TASK",
            style = AltusType.monoData,
            color = tokens.ink400,
        )
        Spacer(Modifier.height(AltusDimens.space1))

        // HERO = the task itself (its description = the work to do), NOT the
        // client name. The form writes the client into both `title` and
        // `client`, so we surface the description first and give the client its
        // own labelled field below — exactly like the web task detail (sir's
        // changes #11). Short headlines get the big display size; long/multi-
        // line descriptions drop to a comfortable reading size so a paragraph
        // never shouts.
        val clientName = detail.client?.trim()?.takeIf { it.isNotEmpty() }
            ?: detail.title.trim().takeIf { it.isNotEmpty() }
        val headline = detail.description?.trim()?.takeIf { it.isNotEmpty() }
            ?: detail.subject?.trim()?.takeIf { it.isNotEmpty() }
            ?: clientName
            ?: "Untitled task"
        val headlineShort = headline.length <= 96 && !headline.contains('\n')
        Text(
            text = headline,
            style = if (headlineShort) AltusType.title1 else AltusType.title2,
            color = MaterialTheme.colorScheme.onSurface,
        )

        if (clientName != null && clientName != headline) {
            Spacer(Modifier.height(AltusDimens.space3))
            Text(
                text = "CLIENT",
                style = AltusType.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = clientName,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))

        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusPill(
                display = detail.displayFor(detail.status),
                modifier = Modifier.graphicsLayer { translationX = pillShakeProvider() },
            )
            Spacer(Modifier.width(AltusDimens.space3))
            PriorityDot(priority = detail.priority)
        }

        val attribution = attributionLine(detail)
        if (attribution != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = attribution,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** "Assigned by Manan · Created 12 Jun" from whatever attribution the task has. */
private fun attributionLine(detail: TaskDetail): String? {
    val by = (detail.initiatorName ?: detail.creatorName)?.takeIf { it.isNotBlank() }
    val created = detail.createdAt?.let { DateFormat.dateSmart(it) }
    return when {
        by != null && created != null -> "Assigned by $by · Created $created"
        by != null -> "Assigned by $by"
        created != null -> "Created $created"
        else -> null
    }
}

/**
 * Priority = a 6dp dot, never a word (S6/S7). Colour rides the semantic ladder
 * ("not green needs attention"); low priority stays quiet. All theme-derived.
 */
@Composable
private fun PriorityDot(priority: String) {
    val tokens = AltusTheme.tokens
    val color = when (priority.lowercase()) {
        "urgent", "critical" -> tokens.danger.color
        "high" -> tokens.warn.color
        "medium", "normal" -> tokens.ink400
        else -> tokens.ink300
    }
    Box(
        modifier = Modifier
            .size(6.dp)
            .semantics { contentDescription = "Priority: $priority" }
            .background(color, CircleShape),
    )
}

// ─── Composer ───────────────────────────────────────────────────────────────────

/**
 * Docked raised composer bar: `imePadding()` lifts it above the keyboard; the
 * send affordance is a filled circular control. The optimistic timeline node
 * (60% opacity → solid) is owned by [TimelineEventRow]; this bar only submits.
 */
@Composable
private fun Composer(
    value: String,
    canSend: Boolean,
    onChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(tokens.raised)
            .navigationBarsPadding()
            .imePadding()
            .padding(
                horizontal = AltusDimens.screenGutter,
                vertical = AltusDimens.space3,
            ),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        AltusTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.weight(1f),
            placeholder = "Add a comment…",
            singleLine = false,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                imeAction = ImeAction.Send,
            ),
            keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                onSend = { if (canSend) onSend() },
            ),
        )
        SendButton(enabled = canSend, onClick = onSend)
    }
}

@Composable
private fun SendButton(
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val container = if (enabled) scheme.primary else tokens.ink300
    Box(
        modifier = Modifier
            .size(AltusDimens.touchMin)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .tapSettleClickable(enabled = enabled, withRipple = true, onClickLabel = "Send") {
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = TaskDetailIcons.Send,
            contentDescription = "Send comment",
            tint = scheme.onPrimary,
            modifier = Modifier.size(20.dp),
        )
    }
}

// ─── Top back row ───────────────────────────────────────────────────────────────

@Composable
private fun BackRow(onBack: () -> Unit) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(AltusDimens.touchMin)
                .clip(AltusShapeTokens.pill)
                .tapSettleClickable(withRipple = true, onClickLabel = "Back") { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = TaskDetailIcons.ArrowLeft,
                contentDescription = "Back",
                tint = tokens.ink400,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

// ─── Gone state ─────────────────────────────────────────────────────────────────

/** 403/404 — reassigned away or deleted. A designed end, never endless shimmer. */
@Composable
private fun GoneState(onBack: () -> Unit) {
    EmptyState(
        headline = "This task is gone.",
        body = "It was reassigned or removed. It's no longer visible to you.",
        actionLabel = "Back to tasks",
        onAction = onBack,
        modifier = Modifier.padding(top = AltusDimens.space8),
    )
}

// ─── Status-change sheet ─────────────────────────────────────────────────────────

@Composable
private fun StatusChangeSheet(
    targetLabel: String,
    onDismiss: () -> Unit,
    onConfirm: (note: String?) -> Unit,
) {
    val sheetState = rememberAltusSheetState()
    var note by rememberSaveable(targetLabel) { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    AltusBottomSheet(
        state = sheetState,
        onDismissRequest = onDismiss,
        peekHeight = 300.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    top = AltusDimens.space3,
                    bottom = AltusDimens.space5,
                ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
        ) {
            Text(
                text = "Move to $targetLabel",
                style = AltusType.title2,
                color = MaterialTheme.colorScheme.onSurface,
            )
            AltusTextField(
                value = note,
                onValueChange = { note = it },
                modifier = Modifier.fillMaxWidth(),
                label = "Note (optional)",
                placeholder = "Add context for this change…",
                singleLine = false,
            )
            AltusPrimaryButton(
                text = "Move to $targetLabel",
                onClick = {
                    onConfirm(note.trim().takeIf { it.isNotEmpty() })
                    scope.launch { sheetState.hide() }
                },
            )
        }
    }
}

// ─── Skeleton (Signature 8: exact resolved geometry) ────────────────────────────

@Composable
private fun DetailSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
    ) {
        SkeletonLine(width = 56.dp, height = 12.dp)
        Spacer(Modifier.height(AltusDimens.space3))
        SkeletonLine(width = 240.dp, height = 24.dp)
        Spacer(Modifier.height(AltusDimens.space4))
        Row(verticalAlignment = Alignment.CenterVertically) {
            SkeletonLine(width = 88.dp, height = 20.dp)
            Spacer(Modifier.width(AltusDimens.space3))
            SkeletonBox(modifier = Modifier.size(6.dp), shape = CircleShape)
        }
        Spacer(Modifier.height(AltusDimens.space3))
        SkeletonLine(width = 200.dp, height = 12.dp)

        Spacer(Modifier.height(AltusDimens.cardGap))
        // Meta ledger silhouette — three 2-col rows.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(216.dp),
        )

        Spacer(Modifier.height(AltusDimens.sectionGap))
        // Action rail silhouette.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = AltusShapeTokens.pill,
        )

        Spacer(Modifier.height(AltusDimens.sectionGap))
        SkeletonLine(width = 120.dp, height = 12.dp)
        Spacer(Modifier.height(AltusDimens.space4))
        repeat(3) {
            Row(modifier = Modifier.padding(vertical = AltusDimens.space2)) {
                SkeletonBox(modifier = Modifier.size(8.dp), shape = CircleShape)
                Spacer(Modifier.width(AltusDimens.space3))
                Column {
                    SkeletonLine(width = 140.dp, height = 12.dp)
                    Spacer(Modifier.height(AltusDimens.space2))
                    SkeletonLine(width = 220.dp)
                }
            }
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ─────────────

private object TaskDetailIcons {

    /** lucide `arrow-left`. */
    val ArrowLeft: ImageVector by lazy {
        lucide("TaskDetail.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5")
    }

    /** lucide `send` — the composer submit glyph. */
    val Send: ImageVector by lazy {
        lucide("TaskDetail.Send", "M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z")
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
