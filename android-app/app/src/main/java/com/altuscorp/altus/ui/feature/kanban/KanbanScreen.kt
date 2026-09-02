package com.altuscorp.altus.feature.kanban

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.semantics.Role
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
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.resolveStatusColor
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList

/**
 * WMS Kanban — the owner-scoped status board (the mobile rendition of the web
 * `/tasks/kanban`). A horizontally-scrolling rail of status columns, each a
 * vertical list of read-only cards; a card taps through to its detail.
 *
 * Altus red on light, design-system components throughout. Column headers carry
 * the server status pill + a mono count; overdue cards earn a danger keyline.
 * Cache paints instantly (skeletons only on a true cold cache); a top-bar
 * refresh reconciles and a quiet banner narrates a failed reconcile.
 */
@Composable
fun KanbanScreen(
    onBack: () -> Unit,
    onOpenTask: (id: String) -> Unit,
    viewModel: KanbanViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Kanban",
            navigationIcon = KanbanIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
            actions = {
                RefreshAction(
                    spinning = state.isRefreshing,
                    onClick = { viewModel.onIntent(KanbanIntent.Refresh) },
                )
            },
        )

        KanbanBody(
            state = state,
            onIntent = viewModel::onIntent,
            onOpenTask = onOpenTask,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )
    }
}

/**
 * WMS Kanban as a WMS-shell PAGE — the content-only host used by the
 * [com.altuscorp.altus.feature.wms.WmsShell] "Kanban" pill. Identical board to
 * the standalone [KanbanScreen] but WITHOUT the top app bar (the shell's pill
 * bar is the chrome) and WITHOUT [Modifier.statusBarsPadding] (the shell owns
 * the status-bar inset). A quiet inline refresh affordance replaces the
 * top-bar action so a stuck reconcile is still one tap to retry. Its
 * `@HiltViewModel` scopes to the shell's back-stack entry, so pill round-trips
 * swap the view without re-fetching.
 */
@Composable
fun WmsKanbanScreen(
    onOpenTask: (id: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: KanbanViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    top = AltusDimens.space3,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Board",
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            RefreshAction(
                spinning = state.isRefreshing,
                onClick = { viewModel.onIntent(KanbanIntent.Refresh) },
            )
        }

        KanbanBody(
            state = state,
            onIntent = viewModel::onIntent,
            onOpenTask = onOpenTask,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )
    }
}

/** Cold-skeleton / cold-error / warm-board state switch, shared by both hosts. */
@Composable
private fun KanbanBody(
    state: KanbanUiState,
    onIntent: (KanbanIntent) -> Unit,
    onOpenTask: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    when {
        state.isLoading && !state.hasContent -> BoardSkeleton(modifier = modifier)

        state.loadFailed && !state.hasContent -> Box(
            modifier = modifier,
            contentAlignment = Alignment.Center,
        ) {
            EmptyState(
                headline = "Couldn't load the board.",
                body = "Check your connection and try again.",
                actionLabel = "Retry",
                onAction = { onIntent(KanbanIntent.Retry) },
            )
        }

        !state.hasContent -> Box(
            modifier = modifier,
            contentAlignment = Alignment.Center,
        ) {
            EmptyState(
                headline = "No board yet.",
                body = "Your tasks will group into status columns here.",
            )
        }

        else -> Column(modifier = modifier) {
            if (state.refreshFailed) {
                StaleBanner(
                    modifier = Modifier.padding(
                        start = AltusDimens.screenGutter,
                        end = AltusDimens.screenGutter,
                        top = AltusDimens.space2,
                    ),
                )
            }
            BoardRail(
                columns = state.columns,
                onOpenTask = onOpenTask,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

// ─── Board rail ────────────────────────────────────────────────────────────────

private val COLUMN_WIDTH = 300.dp

@Composable
private fun BoardRail(
    columns: ImmutableList<KanbanColumn>,
    onOpenTask: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space3,
                bottom = AltusDimens.space6,
            ),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        columns.forEach { column ->
            ColumnView(
                column = column,
                onOpenTask = onOpenTask,
                modifier = Modifier
                    .width(COLUMN_WIDTH)
                    .fillMaxHeight(),
            )
        }
    }
}

@Composable
private fun ColumnView(
    column: KanbanColumn,
    onOpenTask: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val semantic = resolveStatusColor(column.display.color)

    Column(modifier = modifier) {
        // Column header — colour dot + server label + mono count.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = AltusDimens.space2),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(semantic.color),
            )
            Text(
                text = column.display.label,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = column.count.toString(),
                style = AltusType.monoData,
                color = tokens.ink400,
            )
        }

        if (column.cards.isEmpty()) {
            EmptyColumnHint()
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentPadding = PaddingValues(bottom = AltusDimens.space4),
                verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
            ) {
                items(
                    items = column.cards,
                    key = { it.id },
                    contentType = { "kanban-card" },
                ) { card ->
                    CardView(card = card, onOpen = { onOpenTask(card.id) })
                }
            }
        }
    }
}

/** A quiet sunken well when a column has no cards. */
@Composable
private fun EmptyColumnHint(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.card)
            .background(tokens.sunken)
            .padding(vertical = AltusDimens.space5),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "No tasks",
            style = AltusType.label,
            color = tokens.ink400,
        )
    }
}

// ─── Card ──────────────────────────────────────────────────────────────────────

@Composable
private fun CardView(
    card: KanbanCard,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens

    AltusCard(
        onClick = onOpen,
        accentKeyline = if (card.isOverdue) tokens.danger.color else null,
        modifier = modifier.fillMaxWidth(),
        padding = AltusDimens.space4,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            // Row 1 — mono number + priority dot.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = card.numberLabel,
                    style = AltusType.monoData,
                    color = tokens.ink400,
                )
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(priorityDotColor(card.priority)),
                )
            }

            // Row 2 — the task title.
            Text(
                text = card.title,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            // Row 3 — client · subject + due phrase.
            if (card.meta.isNotEmpty() || card.duePhrase.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                ) {
                    if (card.meta.isNotEmpty()) {
                        Text(
                            text = card.meta,
                            style = AltusType.label,
                            color = tokens.ink400,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    } else {
                        Spacer(Modifier.weight(1f))
                    }
                    if (card.duePhrase.isNotEmpty()) {
                        Text(
                            text = card.duePhrase,
                            style = AltusType.label,
                            color = duePhraseColor(card.duePhase),
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

// ─── Degraded + skeleton states ──────────────────────────────────────────────

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
            text = "Couldn't refresh — showing the last synced board.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

private const val SKELETON_COLUMNS = 3
private const val SKELETON_CARDS = 3

@Composable
private fun BoardSkeleton(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxSize()
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space3,
            ),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        repeat(SKELETON_COLUMNS) {
            Column(modifier = Modifier.width(COLUMN_WIDTH)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = AltusDimens.space3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SkeletonLine(width = 120.dp, height = 14.dp)
                    Spacer(Modifier.weight(1f))
                    SkeletonLine(width = 20.dp, height = 14.dp)
                }
                repeat(SKELETON_CARDS) {
                    SkeletonBox(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(96.dp)
                            .padding(bottom = AltusDimens.cardGap),
                    )
                }
            }
        }
    }
}

// ─── Top-bar refresh affordance ──────────────────────────────────────────────

@Composable
private fun RefreshAction(
    spinning: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (spinning) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .size(AltusDimens.touchMin)
            .clip(CircleShape)
            .clickable(
                interactionSource = interaction,
                indication = ripple(bounded = false),
                enabled = !spinning,
                role = Role.Button,
                onClickLabel = "Refresh board",
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = KanbanIcons.Refresh,
            contentDescription = "Refresh board",
            tint = tint,
            modifier = Modifier.size(22.dp),
        )
    }
}

// ─── Colour resolvers (theme-derived, never a hex) ──────────────────────────

@Composable
private fun priorityDotColor(priority: String): Color {
    val tokens = AltusTheme.tokens
    return when (priority.lowercase()) {
        "urgent", "critical", "high", "p1" -> tokens.danger.color
        "medium", "normal", "p2" -> tokens.warn.color
        "low", "p3" -> tokens.info.color
        else -> tokens.ink300
    }
}

@Composable
private fun duePhraseColor(phase: EffectiveDue.DuePhase): Color {
    val tokens = AltusTheme.tokens
    return when (phase) {
        EffectiveDue.DuePhase.OVERDUE -> tokens.danger.color
        EffectiveDue.DuePhase.TODAY, EffectiveDue.DuePhase.SOON -> tokens.warn.color
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

// ─── Screen-local iconography (Lucide, 2dp stroke, round caps) ───────────────

private object KanbanIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Kanban.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val Refresh: ImageVector by lazy {
        lucide(
            "Kanban.Refresh",
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
