@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.overtime

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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.resolveStatusColor
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList

/**
 * OVERTIME (Employees workspace) — the signed-in user's own overtime ledger. A
 * faithful mobile rendition of the web `/overtime` page, narrowed to this one
 * person:
 *
 *  1. A 2×2 KPI strip — total · approved · pending · this month — carrying the
 *     Employees workspace keyline, with a thin meter on the approved card.
 *  2. The entries ledger (full-bleed hairline rows): work date + reason/decision
 *     meta left, mono hours + a status pill right.
 *
 * Cache-first (skeletons only on a true cold cache), evergreen pull-to-refresh,
 * and a calm full-screen retry that is never a dead end (Signature 8). Read-only
 * — overtime is filed / approved on the web.
 */
@Composable
fun OvertimeScreen(
    onBack: () -> Unit,
    viewModel: OvertimeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    OvertimeContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun OvertimeContent(
    state: OvertimeUiState,
    onBack: () -> Unit,
    onIntent: (OvertimeIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Overtime",
            navigationIcon = OvertimeIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> OvertimeSkeleton()
            state.loadFailed && !state.hasContent -> OvertimeLoadError(
                onRetry = { onIntent(OvertimeIntent.Retry) },
            )
            else -> OvertimeLoaded(
                state = state,
                onRefresh = { onIntent(OvertimeIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded ──────────────────────────────────────────────────────────────────

@Composable
private fun OvertimeLoaded(
    state: OvertimeUiState,
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
            contentPadding = PaddingValues(
                top = AltusDimens.cardGap,
                bottom = AltusDimens.space12,
            ),
        ) {
            item(key = "subtitle", contentType = "subtitle") {
                Text(
                    text = state.subtitle,
                    style = AltusType.body,
                    color = AltusTheme.tokens.ink400,
                    modifier = Modifier.padding(
                        start = AltusDimens.screenGutter,
                        end = AltusDimens.screenGutter,
                        top = AltusDimens.space3,
                        bottom = AltusDimens.space1,
                    ),
                )
            }

            item(key = "kpis", contentType = "kpis") {
                KpiGrid(
                    kpis = state.kpis,
                    modifier = Modifier.padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.cardGap,
                    ),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale-banner", contentType = "stale-banner") {
                    StaleBanner(
                        modifier = Modifier.padding(
                            start = AltusDimens.screenGutter,
                            end = AltusDimens.screenGutter,
                            top = AltusDimens.space1,
                        ),
                    )
                }
            }

            // ── Entries ledger ──
            item(key = "entries-header", contentType = "section-header") {
                SectionHeader(
                    title = "Entries",
                    count = state.entries.size.toString(),
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }
            if (state.entries.isEmpty()) {
                item(key = "entries-empty", contentType = "empty") {
                    EmptyState(
                        headline = "No overtime yet.",
                        body = "Extra hours you log on the web will appear here.",
                    )
                }
            } else {
                items(
                    items = state.entries,
                    key = { "entry-${it.id}" },
                    contentType = { "entry-row" },
                ) { entry ->
                    EntryRow(entry = entry)
                    HairlineDivider()
                }
            }
        }
    }
}

// ─── KPI strip ─────────────────────────────────────────────────────────────────

@Composable
private fun KpiGrid(
    kpis: ImmutableList<OvertimeKpiUi>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        kpis.chunked(2).forEach { pair ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
            ) {
                pair.forEach { kpi ->
                    KpiCard(kpi = kpi, modifier = Modifier.weight(1f))
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KpiCard(kpi: OvertimeKpiUi, modifier: Modifier = Modifier) {
    val accent = accentColor(kpi.accent)
    AltusCard(modifier = modifier, accentKeyline = accent) {
        Text(
            text = kpi.label.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = kpi.value,
            style = AltusType.numeralStat,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = kpi.caption,
            style = AltusType.label,
            color = AltusTheme.tokens.ink400,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (kpi.progress != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Meter(fraction = kpi.progress, color = accent)
        }
    }
}

/** The thin KPI meter — sunken track, accent fill (min 2% so a nonzero reads). */
@Composable
private fun Meter(fraction: Float, color: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(AltusShapeTokens.pill)
            .background(AltusTheme.tokens.hairline),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0.02f, 1f))
                .height(6.dp)
                .clip(AltusShapeTokens.pill)
                .background(color),
        )
    }
}

// ─── Entry rows ────────────────────────────────────────────────────────────────

@Composable
private fun EntryRow(entry: OvertimeEntryUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = entry.dateLabel,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = entry.meta,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = entry.hoursLabel,
                style = AltusType.monoData,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            Spacer(Modifier.height(AltusDimens.space1))
            StatusChip(label = entry.statusLabel, token = entry.statusToken)
        }
    }
}

/** A local status pill mapped through the DS [resolveStatusColor] vocabulary. */
@Composable
private fun StatusChip(label: String, token: String) {
    val semantic = resolveStatusColor(token)
    Text(
        text = label,
        style = AltusType.label,
        color = semantic.color,
        maxLines = 1,
        modifier = Modifier
            .clip(AltusShapeTokens.pill)
            .background(semantic.wash)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

@Composable
private fun HairlineDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
        thickness = AltusDimens.hairline,
        color = AltusTheme.tokens.hairline,
    )
}

// ─── Degraded states ───────────────────────────────────────────────────────────

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
            text = "Couldn't refresh — showing the last synced figures.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun OvertimeLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

// ─── Skeleton (Signature 8: exact resolved geometry) ─────────────────────────

@Composable
private fun OvertimeSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
    ) {
        Spacer(Modifier.height(AltusDimens.space5))

        // KPI 2×2 silhouette.
        repeat(2) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = AltusDimens.screenGutter,
                        end = AltusDimens.screenGutter,
                        bottom = AltusDimens.cardGap,
                    ),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
            ) {
                SkeletonBox(modifier = Modifier.weight(1f).height(112.dp))
                SkeletonBox(modifier = Modifier.weight(1f).height(112.dp))
            }
        }

        // Section header + ledger rows.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 36.dp)
                .padding(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    top = AltusDimens.space4,
                    bottom = AltusDimens.space2,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonLine(width = 120.dp, height = 12.dp)
            Spacer(Modifier.weight(1f))
            SkeletonLine(width = 32.dp, height = 12.dp)
        }
        repeat(6) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp)
                    .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    SkeletonLine(width = 128.dp)
                    Spacer(Modifier.height(AltusDimens.space1))
                    SkeletonLine(width = 176.dp, height = 10.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonLine(width = 56.dp)
            }
        }
    }
}

// ─── Accent resolution (no hex in composables) ───────────────────────────────

@Composable
private fun accentColor(accent: OvertimeAccent): Color {
    val tokens = AltusTheme.tokens
    return when (accent) {
        OvertimeAccent.Employees -> tokens.workspaces.employees.base
        OvertimeAccent.Success -> tokens.success.color
        OvertimeAccent.Warn -> tokens.warn.color
        OvertimeAccent.Neutral -> tokens.ink400
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object OvertimeIcons {
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Overtime.ArrowLeft",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        )
        listOf("M12 19l-7-7 7-7", "M19 12H5").forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.build()
    }
}
