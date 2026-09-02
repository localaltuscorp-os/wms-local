@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.outstanding

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
 * OUTSTANDING (Sales workspace) — the receivables dashboard, a faithful mobile
 * rendition of the web `/outstanding` page (default, unfiltered view):
 *
 *  1. A 2×2 KPI strip — total outstanding · overdue · not due · PDC pending —
 *     carrying the Sales workspace keyline.
 *  2. The overdue-by-days buckets, each with a thin balance meter.
 *  3. Month-wise overdue / not-due splits.
 *  4. The responsible-person & billing-entity roll-ups.
 *  5. The PDC-not-received panel, the collections overview, and the two ledgers
 *     (open installments + recent collections), full-bleed hairline rows.
 *
 * Cache-first (skeletons only on a true cold cache), evergreen pull-to-refresh,
 * and a calm full-screen retry that is never a dead end (Signature 8).
 */
@Composable
fun OutstandingScreen(
    onBack: () -> Unit,
    viewModel: OutstandingViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    OutstandingContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun OutstandingContent(
    state: OutstandingUiState,
    onBack: () -> Unit,
    onIntent: (OutstandingIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Outstanding",
            navigationIcon = OutstandingIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> OutstandingSkeleton()
            state.loadFailed && !state.hasContent -> OutstandingLoadError(
                onRetry = { onIntent(OutstandingIntent.Retry) },
            )
            else -> OutstandingLoaded(
                state = state,
                onRefresh = { onIntent(OutstandingIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded ──────────────────────────────────────────────────────────────────

@Composable
private fun OutstandingLoaded(
    state: OutstandingUiState,
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
                        bottom = AltusDimens.space1,
                    ),
                )
            }

            item(key = "kpis", contentType = "kpis") {
                KpiGrid(
                    stats = state.totals,
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

            // ── Overdue buckets ──
            if (state.buckets.isNotEmpty()) {
                sectionHeaderItem("buckets", "Overdue buckets", state.buckets.size.toString())
                items(
                    items = state.buckets,
                    key = { "bucket-${it.id}" },
                    contentType = { "bucket-row" },
                ) { bucket ->
                    BucketRow(bucket = bucket)
                    HairlineDivider()
                }
            }

            // ── Month-wise overdue ──
            monthSection("mo-overdue", "Month-wise overdue", state.monthOverdue, tone = OutstandingAccent.Danger)
            // ── Month-wise not due ──
            monthSection("mo-notdue", "Month-wise not due", state.monthNotDue, tone = OutstandingAccent.Success)

            // ── By responsible ──
            rollupSection("by-emp", "By responsible", state.byEmployee)
            // ── By entity ──
            rollupSection("by-entity", "By entity", state.byEntity)

            // ── PDC not received ──
            if (state.pdc.rows.isNotEmpty()) {
                sectionHeaderItem("pdc", "PDC not received", state.pdc.totalCaption)
                items(
                    items = state.pdc.rows,
                    key = { "pdc-${it.name}" },
                    contentType = { "pdc-row" },
                ) { row ->
                    TwoLineAmountRow(primary = row.name, secondary = row.entries, amount = row.amount)
                    HairlineDivider()
                }
            }

            // ── Collections overview ──
            sectionHeaderItem("collections", "Collections", null)
            item(key = "collections-card", contentType = "collections-card") {
                CollectionsOverviewCard(
                    collections = state.collections,
                    modifier = Modifier.padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.space1,
                    ),
                )
            }

            // ── Open receivables ledger ──
            sectionHeaderItem(
                "entries",
                "Open receivables",
                if (state.entriesTruncated) "${state.entries.size}/${state.entriesTotal}" else state.entriesTotal.toString(),
            )
            if (state.entries.isEmpty()) {
                item(key = "entries-empty", contentType = "empty") {
                    EmptyState(
                        headline = "Nothing outstanding.",
                        body = "Open receivables will appear here.",
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
                if (state.entriesTruncated) {
                    item(key = "entries-more", contentType = "more") {
                        MoreNote(text = "Showing the ${state.entries.size} nearest-due of ${state.entriesTotal}. Open the web dashboard for the full ledger.")
                    }
                }
            }

            // ── Recent collections ledger ──
            sectionHeaderItem(
                "collection-entries",
                "Recent collections",
                if (state.collectionsTruncated) "${state.collectionEntries.size}/${state.collectionEntriesTotal}" else state.collectionEntriesTotal.toString(),
            )
            if (state.collectionEntries.isEmpty()) {
                item(key = "collections-empty", contentType = "empty") {
                    EmptyState(
                        headline = "No collections logged.",
                        body = "Payments received will show up here.",
                    )
                }
            } else {
                items(
                    items = state.collectionEntries,
                    key = { "coll-${it.id}" },
                    contentType = { "collection-row" },
                ) { row ->
                    TwoLineAmountRow(primary = row.client, secondary = row.sub, amount = row.amount, positive = true)
                    HairlineDivider()
                }
                if (state.collectionsTruncated) {
                    item(key = "collections-more", contentType = "more") {
                        MoreNote(text = "Showing the ${state.collectionEntries.size} most-recent of ${state.collectionEntriesTotal}.")
                    }
                }
            }
        }
    }
}

// ─── Section builders ─────────────────────────────────────────────────────────

private fun androidx.compose.foundation.lazy.LazyListScope.sectionHeaderItem(
    id: String,
    title: String,
    count: String?,
) {
    item(key = "header-$id", contentType = "section-header") {
        SectionHeader(
            title = title,
            count = count,
            modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.monthSection(
    id: String,
    title: String,
    rows: ImmutableList<OutstandingMonthUi>,
    tone: OutstandingAccent,
) {
    if (rows.isEmpty()) return
    sectionHeaderItem(id, title, rows.size.toString())
    items(
        items = rows,
        key = { "$id-${it.month}" },
        contentType = { "month-row" },
    ) { row ->
        MonthRow(row = row, tone = tone)
        HairlineDivider()
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.rollupSection(
    id: String,
    title: String,
    rows: ImmutableList<OutstandingRollupUi>,
) {
    if (rows.isEmpty()) return
    sectionHeaderItem(id, title, rows.size.toString())
    items(
        items = rows,
        key = { "$id-${it.name}" },
        contentType = { "rollup-row" },
    ) { row ->
        RollupRow(row = row)
        HairlineDivider()
    }
}

// ─── KPI strip ─────────────────────────────────────────────────────────────────

@Composable
private fun KpiGrid(
    stats: ImmutableList<OutstandingStatUi>,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        stats.chunked(2).forEach { pair ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
            ) {
                pair.forEach { stat ->
                    KpiCard(stat = stat, modifier = Modifier.weight(1f))
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KpiCard(stat: OutstandingStatUi, modifier: Modifier = Modifier) {
    val accent = accentColor(stat.accent)
    AltusCard(modifier = modifier, accentKeyline = accent) {
        Text(
            text = stat.label.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = stat.value,
            style = AltusType.numeralStat,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = stat.caption,
            style = AltusType.label,
            color = AltusTheme.tokens.ink400,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Rows ───────────────────────────────────────────────────────────────────────

@Composable
private fun BucketRow(bucket: OutstandingBucketUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = bucket.label,
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = bucket.count,
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.width(AltusDimens.space3))
            Text(
                text = bucket.amount,
                style = AltusType.monoData,
                color = tokens.danger.color,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(AltusDimens.space2))
        Meter(fraction = bucket.fraction, color = tokens.danger.color)
    }
}

@Composable
private fun MonthRow(row: OutstandingMonthUi, tone: OutstandingAccent, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = row.monthLabel,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            Text(
                text = row.cases,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Text(
            text = row.value,
            style = AltusType.monoData,
            color = accentColor(tone),
            maxLines = 1,
        )
    }
}

@Composable
private fun RollupRow(row: OutstandingRollupUi, modifier: Modifier = Modifier) {
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
                text = row.name,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = row.split,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Text(
            text = row.balance,
            style = AltusType.monoData,
            color = if (row.hasOverdue) tokens.danger.color else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

/** A generic two-line row with a right-aligned mono amount (PDC + collections). */
@Composable
private fun TwoLineAmountRow(
    primary: String,
    secondary: String,
    amount: String,
    modifier: Modifier = Modifier,
    positive: Boolean = false,
) {
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
                text = primary,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = secondary,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Text(
            text = amount,
            style = AltusType.monoData,
            color = if (positive) tokens.success.color else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

@Composable
private fun EntryRow(entry: OutstandingEntryUi, modifier: Modifier = Modifier) {
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
                text = entry.client,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${entry.sub} · ${entry.dueLabel}",
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = entry.amount,
                style = AltusType.monoData,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            Spacer(Modifier.height(AltusDimens.space1))
            StatusChip(label = entry.stateLabel, token = entry.stateToken)
        }
    }
}

// ─── Collections overview card ──────────────────────────────────────────────────

@Composable
private fun CollectionsOverviewCard(
    collections: OutstandingCollectionsUi,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier, accentKeyline = tokens.success.color) {
        Text(
            text = "TOTAL COLLECTED",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = collections.totalCollected,
            style = AltusType.numeralStat,
            color = tokens.success.color,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space3))
        MetaRow(label = "Top mode", value = collections.topMode)
        MetaRow(label = "Top collector", value = collections.topCollector)
        if (collections.byMode.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space3))
            Text(
                text = "BY MODE",
                style = AltusType.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
            Spacer(Modifier.height(AltusDimens.space2))
            collections.byMode.forEach { m ->
                MetaRow(label = m.name, value = m.amount, mono = true)
            }
        }
    }
}

@Composable
private fun MetaRow(label: String, value: String, mono: Boolean = false) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = AltusDimens.space1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = AltusType.body,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(AltusDimens.space3))
        Text(
            text = value,
            style = if (mono) AltusType.monoData else AltusType.bodyStrong,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Small parts ────────────────────────────────────────────────────────────────

/** The thin meter — sunken track, accent fill (min 2% so a nonzero reads). */
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

/** A local status pill mapped through the DS colour vocabulary. */
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
private fun MoreNote(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = AltusType.label,
        color = AltusTheme.tokens.ink400,
        modifier = modifier.padding(
            horizontal = AltusDimens.screenGutter,
            vertical = AltusDimens.space3,
        ),
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
private fun OutstandingLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
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
private fun OutstandingSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
    ) {
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
                SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
                SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
            }
        }

        // Section header + rows.
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
            SkeletonLine(width = 148.dp, height = 12.dp)
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
                    SkeletonLine(width = 180.dp)
                    Spacer(Modifier.height(AltusDimens.space1))
                    SkeletonLine(width = 108.dp, height = 10.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonLine(width = 72.dp)
            }
        }
    }
}

// ─── Accent resolution (no hex in composables) ───────────────────────────────

@Composable
private fun accentColor(accent: OutstandingAccent): Color {
    val tokens = AltusTheme.tokens
    return when (accent) {
        OutstandingAccent.Sales -> tokens.workspaces.sales.base
        OutstandingAccent.Success -> tokens.success.color
        OutstandingAccent.Danger -> tokens.danger.color
        OutstandingAccent.Warn -> tokens.warn.color
        OutstandingAccent.Neutral -> tokens.ink400
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object OutstandingIcons {
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Outstanding.ArrowLeft",
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
