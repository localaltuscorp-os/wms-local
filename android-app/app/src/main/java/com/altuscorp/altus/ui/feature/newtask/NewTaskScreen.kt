package com.altuscorp.altus.feature.tasks.newtask

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.domain.model.PriorityOption
import com.altuscorp.altus.domain.model.TaskFormOptions
import com.altuscorp.altus.ui.designsystem.AltusChip
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
import java.time.LocalDate
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.toImmutableList

/**
 * S6 New Task — the keyboard-first pushed form. Title autofocuses the moment
 * the pick-lists resolve; Enter on the title advances straight into the doer
 * decision; every pick-list is a bottom sheet; the 56dp Create pill is the one
 * commit and morphs label→spinner in place (`commit-morph`, width held).
 *
 * States kept as honest as the happy path: cold cache → skeleton in the exact
 * final geometry; cold cache + failed fetch → retry state; submit failure →
 * inline danger-wash banner + "uh-uh", the draft never lost.
 */
@Composable
fun NewTaskScreen(
    onBack: () -> Unit,
    onCreated: (taskId: String) -> Unit,
    viewModel: NewTaskViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = currentHaptics()
    val tokens = AltusTheme.tokens

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is NewTaskEffect.Created -> {
                    haptics.commitTick()
                    onCreated(effect.taskId)
                }

                NewTaskEffect.ValidationFailed -> haptics.gateUhUh()
                NewTaskEffect.SubmitFailed -> haptics.gateUhUh()
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
            NewTaskHeader(onBack = onBack)

            val options = state.options
            when {
                state.showColdError -> Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyState(
                        headline = "Couldn't load the form",
                        body = state.optionsError,
                        actionLabel = "Retry",
                        onAction = { viewModel.onIntent(NewTaskIntent.RetryOptions) },
                    )
                }

                options == null -> NewTaskSkeleton(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )

                else -> NewTaskForm(
                    state = state,
                    options = options,
                    onIntent = viewModel::onIntent,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            }
        }

        NewTaskSheetHost(state = state, onIntent = viewModel::onIntent)
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun NewTaskHeader(onBack: () -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val backInteraction = remember { MutableInteractionSource() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = AltusDimens.space2),
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
                imageVector = NewTaskIcons.ArrowLeft,
                contentDescription = "Back",
                tint = scheme.onSurface,
                modifier = Modifier.size(24.dp),
            )
        }
        Spacer(Modifier.size(AltusDimens.space2))
        Text(
            text = "New task",
            style = AltusType.title1,
            color = scheme.onSurface,
        )
    }
}

// ─── The form ────────────────────────────────────────────────────────────────

@Composable
private fun NewTaskForm(
    state: NewTaskUiState,
    options: TaskFormOptions,
    onIntent: (NewTaskIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val focusManager = LocalFocusManager.current
    val titleFocus = remember { FocusRequester() }
    val descriptionFocus = remember { FocusRequester() }
    val today = remember { LocalDate.now() }

    // Keyboard-first: the title owns focus the moment the form resolves.
    LaunchedEffect(Unit) { titleFocus.requestFocus() }

    Column(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = AltusDimens.screenGutter)
                .padding(top = AltusDimens.space2, bottom = AltusDimens.space6),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space5),
        ) {
            AltusTextField(
                value = state.title,
                onValueChange = { onIntent(NewTaskIntent.TitleChanged(it)) },
                label = "Title",
                placeholder = "What needs doing?",
                error = state.titleError,
                focusRequester = titleFocus,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(
                    onNext = {
                        // Enter advances into the next open decision.
                        if (state.doer == null) {
                            focusManager.clearFocus()
                            onIntent(NewTaskIntent.SheetRequested(NewTaskSheet.Doer))
                        } else {
                            descriptionFocus.requestFocus()
                        }
                    },
                ),
            )

            PickField(
                label = "Doer",
                value = state.doer?.name,
                placeholder = "Who will do this",
                error = state.doerError,
                onClick = { onIntent(NewTaskIntent.SheetRequested(NewTaskSheet.Doer)) },
            )

            PrioritySection(
                priorities = options.priorities,
                selected = state.priority,
                error = state.priorityError,
                onPick = { onIntent(NewTaskIntent.PriorityPicked(it)) },
            )

            PickField(
                label = "Due date",
                value = state.dueDate?.let { dueDayLabel(it, today) },
                placeholder = "When it's due",
                error = state.dueError,
                onClick = { onIntent(NewTaskIntent.SheetRequested(NewTaskSheet.Due)) },
            )

            PickField(
                label = "Subject",
                value = state.subject,
                placeholder = "Optional",
                onClick = { onIntent(NewTaskIntent.SheetRequested(NewTaskSheet.Subject)) },
            )

            PickField(
                label = "Initiator",
                value = state.initiator?.name,
                placeholder = "Defaults to you",
                onClick = { onIntent(NewTaskIntent.SheetRequested(NewTaskSheet.Initiator)) },
            )

            AltusTextField(
                value = state.description,
                onValueChange = { onIntent(NewTaskIntent.DescriptionChanged(it)) },
                label = "Description",
                placeholder = "Optional context for the doer",
                singleLine = false,
                focusRequester = descriptionFocus,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = ImeAction.Default,
                ),
            )
        }

        // Commit bar — pinned, rides above the IME with the screen's imePadding.
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
                text = "Create task",
                onClick = { onIntent(NewTaskIntent.Submit) },
                loading = state.submitting,
            )
        }
    }
}

// ─── Pick field (sheet-backed input) ─────────────────────────────────────────

/**
 * A pick-list field in the exact [AltusTextField] geometry (caption label,
 * 52dp sunken well, hairline → danger on error) whose decision opens a sheet.
 */
@Composable
private fun PickField(
    label: String,
    value: String?,
    placeholder: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    enabled: Boolean = true,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }

    Column(modifier = modifier) {
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = AltusDimens.space2),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 52.dp)
                .tapSettle(interactionSource, enabled = enabled)
                .clip(AltusShapeTokens.input)
                .background(tokens.sunken)
                .border(
                    width = AltusDimens.hairline,
                    color = if (error != null) tokens.danger.color else tokens.hairline,
                    shape = AltusShapeTokens.input,
                )
                .clickable(
                    interactionSource = interactionSource,
                    indication = ripple(),
                    enabled = enabled,
                    role = Role.Button,
                    onClickLabel = label,
                    onClick = onClick,
                )
                .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = value ?: placeholder,
                style = AltusType.body,
                color = when {
                    !enabled -> tokens.ink300
                    value == null -> tokens.ink300
                    else -> scheme.onSurface
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = NewTaskIcons.ChevronDown,
                contentDescription = null,
                tint = scheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        if (error != null) {
            Text(
                text = error,
                style = AltusType.label,
                color = tokens.danger.color,
                modifier = Modifier.padding(top = AltusDimens.space1),
            )
        }
    }
}

// ─── Priority chips ──────────────────────────────────────────────────────────

@Composable
private fun PrioritySection(
    priorities: ImmutableList<PriorityOption>,
    selected: PriorityOption?,
    error: String?,
    onPick: (PriorityOption) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()
    Column(modifier = modifier) {
        Text(
            text = "PRIORITY",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = AltusDimens.space2),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        ) {
            priorities.forEach { priority ->
                AltusChip(
                    label = priority.label,
                    selected = priority.value == selected?.value,
                    onClick = {
                        haptics.commitTick()
                        onPick(priority)
                    },
                )
            }
        }
        if (error != null) {
            Text(
                text = error,
                style = AltusType.label,
                color = tokens.danger.color,
                modifier = Modifier.padding(top = AltusDimens.space1),
            )
        }
    }
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

@Composable
private fun NewTaskSheetHost(
    state: NewTaskUiState,
    onIntent: (NewTaskIntent) -> Unit,
) {
    val options = state.options ?: return
    val dismiss = { onIntent(NewTaskIntent.SheetRequested(null)) }

    when (state.activeSheet) {
        NewTaskSheet.Doer -> {
            val rows = remember(options) {
                options.employees.map { PickerRow(it.id, it.name) }.toImmutableList()
            }
            OptionPickerSheet(
                title = "Who will do this",
                rows = rows,
                selectedId = state.doer?.id,
                searchPlaceholder = "Search people",
                onPick = { row ->
                    options.employees.firstOrNull { it.id == row.id }
                        ?.let { onIntent(NewTaskIntent.DoerPicked(it)) }
                },
                onDismiss = dismiss,
            )
        }

        NewTaskSheet.Initiator -> {
            val rows = remember(options) {
                options.employees.map { PickerRow(it.id, it.name) }.toImmutableList()
            }
            OptionPickerSheet(
                title = "Initiator",
                rows = rows,
                selectedId = state.initiator?.id,
                searchPlaceholder = "Search people",
                onPick = { row ->
                    options.employees.firstOrNull { it.id == row.id }
                        ?.let { onIntent(NewTaskIntent.InitiatorPicked(it)) }
                },
                onDismiss = dismiss,
            )
        }

        NewTaskSheet.Subject -> {
            val rows = remember(options) {
                options.subjects.map { PickerRow(it, it) }.toImmutableList()
            }
            OptionPickerSheet(
                title = "Subject",
                rows = rows,
                selectedId = state.subject,
                searchPlaceholder = "Search subjects",
                clearLabel = "No subject",
                onClear = { onIntent(NewTaskIntent.SubjectPicked(null)) },
                onPick = { row -> onIntent(NewTaskIntent.SubjectPicked(row.id)) },
                onDismiss = dismiss,
            )
        }

        NewTaskSheet.Due -> DueDateSheet(
            selected = state.dueDate,
            onPick = { onIntent(NewTaskIntent.DuePicked(it)) },
            onDismiss = dismiss,
        )

        null -> Unit
    }
}

// ─── Skeleton (Signature 8: exact final geometry) ────────────────────────────

@Composable
private fun NewTaskSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space2, bottom = AltusDimens.space4),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space5),
    ) {
        SkeletonField() // Title
        SkeletonField() // Doer
        Column {
            SkeletonLine(width = 64.dp, height = 12.dp)
            Spacer(Modifier.height(AltusDimens.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
                repeat(3) {
                    SkeletonBox(
                        modifier = Modifier.size(84.dp, 36.dp),
                        shape = AltusShapeTokens.chip,
                    )
                }
            }
        }
        SkeletonField() // Due date
        SkeletonField() // Subject
        SkeletonField() // Initiator
        SkeletonField() // Description
        Spacer(Modifier.weight(1f))
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(AltusDimens.actionPrimary),
            shape = AltusShapeTokens.pill,
        )
    }
}

@Composable
private fun SkeletonField(modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        SkeletonLine(width = 72.dp, height = 12.dp)
        Spacer(Modifier.height(AltusDimens.space2))
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = AltusShapeTokens.input,
        )
    }
}
