@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.accounts

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
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * Admin · Accounts → Due Dates Checklist (read-only). A phone-first take on the
 * web tracker table: a summary card (total · paid · pending) then one clean card
 * per item — compliance title, code chip, frequency/period meta, the due date and
 * a Paid / Pending status pill (paid earns the success wash). Cache paints first;
 * pull-to-refresh reconciles.
 */
@Composable
fun AccountsDueDatesScreen(
    onBack: () -> Unit,
    viewModel: AccountsDueViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Due Dates",
            navigationIcon = DueIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> DueSkeleton()
            state.loadFailed && !state.hasContent -> DueLoadError(onRetry = { viewModel.onIntent(AccountsDueIntent.Retry) })
            else -> DueList(state = state, onRefresh = { viewModel.onIntent(AccountsDueIntent.Refresh) })
        }
    }
}

@Composable
private fun DueList(
    state: AccountsDueUiState,
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
            contentPadding = PaddingValues(top = AltusDimens.cardGap, bottom = AltusDimens.space8),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "summary", contentType = "summary") {
                DueSummaryCard(state = state, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
            }

            item(key = "items-header", contentType = "section-header") {
                SectionHeader(
                    title = "Items",
                    count = "${state.total}",
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            if (state.items.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "No due items.",
                        body = "Recurring bills and statutory items will appear here.",
                    )
                }
            } else {
                items(items = state.items, key = { it.id }, contentType = { "due-item" }) { row ->
                    DueItemCard(row = row, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                }
            }
        }
    }
}

@Composable
private fun DueSummaryCard(state: AccountsDueUiState, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.accounts.base
    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = accent) {
        Text(text = "ADMIN · ACCOUNTS", style = AltusType.caption, color = accent, maxLines = 1)
        Spacer(Modifier.height(AltusDimens.space2))
        Text(text = state.title, style = AltusType.heading, color = MaterialTheme.colorScheme.onSurface)
        if (state.tagline.isNotBlank()) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(text = state.tagline, style = AltusType.body, color = tokens.ink400)
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(modifier = Modifier.fillMaxWidth()) {
            DueStat(value = "${state.total}", label = "Total", color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            DueStat(value = "${state.paid}", label = "Paid", color = tokens.success.color, modifier = Modifier.weight(1f))
            DueStat(value = "${state.pending}", label = "Pending", color = tokens.warn.color, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun DueStat(value: String, label: String, color: Color, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier) {
        Text(text = value, style = AltusType.numeralStat, color = color, maxLines = 1)
        Spacer(Modifier.height(AltusDimens.space1))
        Text(text = label.uppercase(), style = AltusType.caption, color = tokens.ink400, maxLines = 1)
    }
}

@Composable
private fun DueItemCard(row: DueItemRow, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = tokens.workspaces.accounts.base) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                if (row.code != null) {
                    Text(text = row.code, style = AltusType.monoData, color = tokens.ink400, maxLines = 1)
                    Spacer(Modifier.height(2.dp))
                }
                Text(
                    text = row.title,
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (row.meta.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(text = row.meta, style = AltusType.label, color = tokens.ink400, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(AltusDimens.space2))
            DueStatusPill(paid = row.paid)
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(verticalAlignment = Alignment.CenterVertically) {
            DueMeta(label = "Due", value = row.dueDate ?: "—", modifier = Modifier.weight(1f))
            DueMeta(
                label = if (row.paid) "Paid" else "Status",
                value = row.paidLine ?: "Pending",
                valueColor = if (row.paid) tokens.success.color else tokens.warn.color,
                modifier = Modifier.weight(1f),
            )
        }
        if (row.notes != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(text = row.notes, style = AltusType.label, color = tokens.ink400, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun DueMeta(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier) {
        Text(text = label.uppercase(), style = AltusType.caption, color = tokens.ink400, maxLines = 1)
        Spacer(Modifier.height(2.dp))
        Text(text = value, style = AltusType.bodyStrong, color = valueColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun DueStatusPill(paid: Boolean, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val fg = if (paid) tokens.success.color else tokens.warn.color
    val bg = if (paid) tokens.success.wash else tokens.warn.wash
    Box(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(bg)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    ) {
        Text(text = if (paid) "PAID" else "PENDING", style = AltusType.caption, color = fg, maxLines = 1)
    }
}

// ─── Degraded / loading states ─────────────────────────────────────────────────

@Composable
private fun DueLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load Due Dates.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

@Composable
private fun DueSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(top = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(140.dp))
        repeat(5) {
            SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(120.dp))
        }
    }
}

// ─── Screen-local iconography ──────────────────────────────────────────────────

private object DueIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Due.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

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
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
