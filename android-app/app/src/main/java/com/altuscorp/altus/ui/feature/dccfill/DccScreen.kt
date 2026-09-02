@file:OptIn(ExperimentalFoundationApi::class)

package com.altuscorp.altus.feature.dcc

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.expandVertically
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusSheetValue
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonCircle
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.rememberAltusSheetState
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * S5 — THE DCC FILL BOARD, the flagship loop.
 *
 * A collapsing header carrying the screen title, the 7-day date-chip selector
 * and the **pinned compliance ring** (Signature 3, "the ring that hears
 * everything") — the ring sweeps forward on every commit anywhere below and
 * feeds the Day Ring's DCC segment. The scrolling body is a sticky-section
 * [LazyColumn]: simple KPI rows carry the tri-state
 * [com.altuscorp.altus.ui.designsystem.CommitControl], participant KPIs unfold
 * to a bulk bar + per-person roster wave, and the weekly / monthly / ad-hoc
 * trays sit in sunken beds below. Every commit is optimistic through the
 * repository outbox; a refusal lands as a [DccEvent.Revert] the screen turns
 * into the "uh-uh" + a Retry snackbar. When today crosses to 100% the pinned
 * ring seals (the full Day Seal is reserved for the Day Ring) and an inset
 * banner offers the one-tap route to clock out.
 *
 * Matches the NavHost's expected signature (`initialDate`, `onOpenPunch`); the
 * ViewModel reads the same `date` arg from its [androidx.lifecycle.SavedStateHandle].
 */
@Composable
fun DccScreen(
    initialDate: String?,
    onOpenPunch: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DccViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val onIntent = viewModel::onIntent

    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()
    val snackbarHostState = remember { SnackbarHostState() }

    // One-shot effects → haptics + Retry snackbar / the 100% heavy-click.
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is DccEvent.Revert -> {
                    haptics.gateUhUh()
                    val result = snackbarHostState.showSnackbar(
                        message = event.message,
                        actionLabel = "Retry",
                    )
                    if (result == SnackbarResult.ActionPerformed) onIntent(DccIntent.Refresh)
                }

                DccEvent.DayComplete -> haptics.daySeal()
            }
        }
    }

    // The item whose numeric / note sheet is open (null = closed).
    var sheetItem by remember { mutableStateOf<DccKpiRowUi?>(null) }

    // Board scroll hoisted here so the header collapses (and the pinned ring
    // shrinks to 48dp) as the board scrolls under it.
    val listState = rememberLazyListState()
    val collapsed by remember {
        derivedStateOf {
            listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 8
        }
    }

    Box(modifier = modifier.fillMaxSize().background(tokens.canvas)) {
        Column(modifier = Modifier.fillMaxSize()) {
            DccHeader(
                state = state,
                onSelectDay = { onIntent(DccIntent.SelectDay(it)) },
                collapsed = collapsed,
            )

            DccBody(
                state = state,
                listState = listState,
                pendingFor = viewModel::pending,
                onIntent = onIntent,
                onOpenSheet = { item -> if (state.editable) sheetItem = item },
                onClockOut = onOpenPunch,
                onRetry = { onIntent(DccIntent.Refresh) },
            )
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }

    val currentSheetItem = sheetItem
    if (currentSheetItem != null) {
        DccNumericEntrySheet(
            item = currentSheetItem,
            onDismiss = { sheetItem = null },
            onSave = { value, note ->
                onIntent(
                    DccIntent.SaveValue(
                        itemId = currentSheetItem.id,
                        status = DccStatus.DONE,
                        value = value.ifBlank { null },
                        note = note.ifBlank { null },
                    ),
                )
                sheetItem = null
            },
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header — collapsing title + owner line, pinned ring, 7-day chips
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DccHeader(
    state: DccUiState,
    onSelectDay: (String) -> Unit,
    collapsed: Boolean,
) {
    val tokens = AltusTheme.tokens
    val ringSize by animateDpAsState(
        targetValue = if (collapsed) AltusDimens.dccRingPinned else AltusDimens.dccRing,
        label = "DccPinnedRingSize",
    )

    val subtitle = when {
        !state.isToday && state.dateLabel != null -> "${state.dateLabel} · read-only"
        state.ownerName.isNotBlank() -> state.ownerName
        else -> null
    }

    Column(modifier = Modifier.fillMaxWidth().statusBarsPadding()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(AltusDimens.space1),
            ) {
                Text(
                    text = state.title,
                    style = AltusType.title1,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                )
                AnimatedVisibility(
                    visible = subtitle != null && !collapsed,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    Text(
                        text = subtitle.orEmpty(),
                        style = AltusType.caption,
                        color = tokens.ink400,
                        maxLines = 1,
                    )
                }
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "${state.filled}/${state.due}",
                    style = AltusType.monoData,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                )
                Text(text = "FILLED", style = AltusType.caption, color = tokens.ink400)
            }

            DccComplianceRing(
                fraction = state.fraction,
                complete = state.isComplete,
                diameter = ringSize,
                strokeWidth = 6.dp,
                showPercent = true,
                percentStyle = AltusType.monoData,
            )
        }

        DccDateChips(chips = state.chips, onSelect = onSelectDay)

        Spacer(Modifier.height(AltusDimens.space2))
        Box(
            Modifier
                .fillMaxWidth()
                .height(AltusDimens.hairline)
                .background(tokens.hairline),
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Body — skeletons / empty / error / the sticky-section board
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DccBody(
    state: DccUiState,
    listState: LazyListState,
    pendingFor: (String) -> kotlinx.coroutines.flow.Flow<Int>,
    onIntent: (DccIntent) -> Unit,
    onOpenSheet: (DccKpiRowUi) -> Unit,
    onClockOut: () -> Unit,
    onRetry: () -> Unit,
) {
    val hasContent =
        state.sections.isNotEmpty() || state.participants.isNotEmpty() || state.trays.isNotEmpty()

    when {
        state.isLoading && !hasContent -> DccSkeletonList()

        !hasContent && state.showEmpty -> EmptyState(
            headline = "Nothing due today.",
            body = "No compliance items are assigned for this day.",
            modifier = Modifier.fillMaxWidth(),
        )

        !hasContent && state.loadError != null -> EmptyState(
            headline = "Couldn't load",
            body = state.loadError,
            actionLabel = "Retry",
            onAction = onRetry,
            modifier = Modifier.fillMaxWidth(),
        )

        else -> DccBoardList(
            state = state,
            listState = listState,
            pendingFor = pendingFor,
            onIntent = onIntent,
            onOpenSheet = onOpenSheet,
            onClockOut = onClockOut,
        )
    }
}

@Composable
private fun DccBoardList(
    state: DccUiState,
    listState: LazyListState,
    pendingFor: (String) -> kotlinx.coroutines.flow.Flow<Int>,
    onIntent: (DccIntent) -> Unit,
    onOpenSheet: (DccKpiRowUi) -> Unit,
    onClockOut: () -> Unit,
) {
    val editable = state.editable

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            top = AltusDimens.space2,
            bottom = AltusDimens.space12,
        ),
    ) {
        // Offline / partial-refresh notice above the board (cache is still shown).
        if (state.loadError != null) {
            item(key = "load-notice", contentType = "notice") {
                Text(
                    text = state.loadError,
                    style = AltusType.label,
                    color = AltusTheme.tokens.warn.color,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space2,
                        ),
                )
            }
        }

        // 100% reward — inset banner + one-tap route to clock out (today only).
        if (state.isComplete && state.isToday) {
            item(key = "complete-banner", contentType = "banner") {
                DccCompleteBanner(onClockOut = onClockOut)
            }
        }

        // Daily sections with sticky headers.
        state.sections.forEach { section ->
            stickyHeader(key = "sec-${section.key}", contentType = "section-header") {
                SectionHeader(title = section.title, count = section.count)
            }
            items(
                items = section.items,
                key = { "kpi-${it.id}" },
                contentType = { "kpi" },
            ) { item ->
                DccKpiRow(
                    item = item,
                    editable = editable,
                    pendingFor = pendingFor,
                    onCommit = { value ->
                        onIntent(DccIntent.CommitItem(item.id, DccStatus.fromCommit(value)))
                    },
                    onClear = { onIntent(DccIntent.CommitItem(item.id, null)) },
                    onOpenSheet = { onOpenSheet(item) },
                )
            }
        }

        // Participant-roster KPIs.
        if (state.participants.isNotEmpty()) {
            stickyHeader(key = "participants-header", contentType = "section-header") {
                SectionHeader(
                    title = "Participants",
                    count = state.participants.size.toString(),
                )
            }
            items(
                items = state.participants,
                key = { "part-${it.id}" },
                contentType = { "participant" },
            ) { participant ->
                DccParticipantCard(
                    participant = participant,
                    expanded = state.expandedParticipantIds.contains(participant.id),
                    editable = editable,
                    onToggle = { onIntent(DccIntent.ToggleParticipant(participant.id)) },
                    onBulk = { status ->
                        onIntent(DccIntent.BulkParticipants(participant.id, status))
                    },
                    onCommitSubject = { subjectId, status ->
                        onIntent(DccIntent.CommitParticipant(participant.id, subjectId, status))
                    },
                )
            }
        }

        // Weekly / monthly / ad-hoc trays.
        if (state.trays.isNotEmpty()) {
            stickyHeader(key = "trays-header", contentType = "section-header") {
                SectionHeader(title = "Recurring")
            }
            state.trays.forEach { tray ->
                val trayExpanded = state.expandedTrayKinds.contains(tray.kind)
                item(key = "tray-${tray.kind}", contentType = "tray-header") {
                    DccTrayHeader(
                        tray = tray,
                        expanded = trayExpanded,
                        onToggle = { onIntent(DccIntent.ToggleTray(tray.kind)) },
                    )
                }
                if (trayExpanded) {
                    items(
                        items = tray.items,
                        key = { "tray-kpi-${it.id}" },
                        contentType = { "kpi" },
                    ) { item ->
                        DccKpiRow(
                            item = item,
                            editable = editable,
                            pendingFor = pendingFor,
                            onCommit = { value ->
                                onIntent(DccIntent.CommitItem(item.id, DccStatus.fromCommit(value)))
                            },
                            onClear = { onIntent(DccIntent.CommitItem(item.id, null)) },
                            onOpenSheet = { onOpenSheet(item) },
                        )
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 100% completion banner (S5 reward — not the full Day Seal)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DccCompleteBanner(onClockOut: () -> Unit) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2)
            .background(tokens.success.wash, AltusShapeTokens.card)
            .padding(AltusDimens.cardPadding),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Text(
            text = "Day complete",
            style = AltusType.title2,
            color = tokens.success.color,
        )
        Text(
            text = "Every item is filled — you're clear to clock out.",
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurface,
        )
        AltusGhostButton(
            text = "Clock out →",
            onClick = onClockOut,
            contentColor = tokens.success.color,
            modifier = Modifier.padding(top = AltusDimens.space1),
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric / note entry sheet (value-type KPIs — S5)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DccNumericEntrySheet(
    item: DccKpiRowUi,
    onDismiss: () -> Unit,
    onSave: (value: String, note: String) -> Unit,
) {
    val tokens = AltusTheme.tokens
    val sheetState = rememberAltusSheetState(initialTarget = AltusSheetValue.Peek)

    var value by rememberSaveable(item.id) { mutableStateOf(item.value.orEmpty()) }
    var note by rememberSaveable(item.id) { mutableStateOf(item.note.orEmpty()) }
    val valueFocus = remember { FocusRequester() }

    LaunchedEffect(item.id) { runCatching { valueFocus.requestFocus() } }

    AltusBottomSheet(
        state = sheetState,
        onDismissRequest = onDismiss,
        peekHeight = 340.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    top = AltusDimens.space3,
                    bottom = AltusDimens.space6,
                ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space4),
        ) {
            Text(
                text = item.title,
                style = AltusType.title2,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (item.meta != null) {
                Text(text = item.meta, style = AltusType.monoData, color = tokens.ink400)
            }

            AltusTextField(
                value = value,
                onValueChange = { value = it },
                label = "Value",
                placeholder = "0",
                focusRequester = valueFocus,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Decimal,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions.Default,
            )

            AltusTextField(
                value = note,
                onValueChange = { note = it },
                label = "Note",
                placeholder = "Optional",
                singleLine = false,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onSave(value, note) }),
            )

            AltusPrimaryButton(
                text = "Save",
                onClick = { onSave(value, note) },
                fillMaxWidth = true,
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons that keep their word (Signature 8) — exact resolved geometry
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun DccSkeletonList() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = AltusDimens.space3),
    ) {
        // Section eyebrow.
        SkeletonLine(
            width = 160.dp,
            modifier = Modifier.padding(
                horizontal = AltusDimens.screenGutter,
                vertical = AltusDimens.space2,
            ),
        )
        repeat(6) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.space2,
                    ),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                ) {
                    SkeletonLine(width = 200.dp)
                    SkeletonLine(width = 120.dp, height = 12.dp)
                }
                SkeletonBox(
                    modifier = Modifier
                        .height(36.dp)
                        .width(72.dp),
                    shape = AltusShapeTokens.pill,
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space4))
        SkeletonCircle(
            diameter = AltusDimens.dccRing,
            modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
        )
    }
}
