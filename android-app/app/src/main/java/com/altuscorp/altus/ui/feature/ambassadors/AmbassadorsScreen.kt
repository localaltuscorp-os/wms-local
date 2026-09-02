@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.ambassadors

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
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList

/**
 * AMBASSADORS (Sales workspace) — the "Partner Intelligence" surface, a faithful
 * mobile rendition of the web `/ambassadors` page:
 *
 *  1. A 5-up KPI strip — active partners · referrals · conversion · revenue
 *     driven · commission owed — carrying the Sales workspace keyline.
 *  2. The referral-pipeline funnel (per-stage bars, a quiet "N lost" footer).
 *  3. The score-ranked partner registry: avatar + tier, each partner's referral
 *     / conversion / revenue / commission rollups, full-bleed hairline rows.
 *
 * Cache-first (skeletons only on a true cold cache), evergreen pull-to-refresh,
 * and a calm full-screen retry that is never a dead end (Signature 8).
 */
@Composable
fun AmbassadorsScreen(
    onBack: () -> Unit,
    viewModel: AmbassadorsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    AmbassadorsContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun AmbassadorsContent(
    state: AmbassadorsUiState,
    onBack: () -> Unit,
    onIntent: (AmbassadorsIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Ambassadors",
            navigationIcon = AmbassadorsIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> AmbassadorsSkeleton()
            state.loadFailed && !state.hasContent -> AmbassadorsLoadError(
                onRetry = { onIntent(AmbassadorsIntent.Retry) },
            )
            else -> AmbassadorsLoaded(
                state = state,
                onRefresh = { onIntent(AmbassadorsIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded ──────────────────────────────────────────────────────────────────

@Composable
private fun AmbassadorsLoaded(
    state: AmbassadorsUiState,
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
                    stats = state.kpis,
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

            // ── Referral pipeline funnel ──
            if (state.funnel.isNotEmpty()) {
                sectionHeaderItem("funnel", "Referral pipeline", null)
                item(key = "funnel-card", contentType = "funnel-card") {
                    FunnelCard(
                        funnel = state.funnel,
                        lostCaption = state.lostCaption,
                        modifier = Modifier.padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space1,
                        ),
                    )
                }
            }

            // ── Partner registry (score-ranked) ──
            sectionHeaderItem("partners", "Partners", state.partners.size.toString())
            if (state.partners.isEmpty()) {
                item(key = "partners-empty", contentType = "empty") {
                    EmptyState(
                        headline = "No ambassadors yet.",
                        body = "Partners you register on the web will appear here.",
                    )
                }
            } else {
                items(
                    items = state.partners,
                    key = { "partner-${it.id}" },
                    contentType = { "partner-row" },
                ) { partner ->
                    PartnerRow(partner = partner)
                    HairlineDivider()
                }
            }
        }
    }
}

// ─── Section builder ──────────────────────────────────────────────────────────

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

// ─── KPI strip ─────────────────────────────────────────────────────────────────

@Composable
private fun KpiGrid(
    stats: ImmutableList<AmbKpiUi>,
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
private fun KpiCard(stat: AmbKpiUi, modifier: Modifier = Modifier) {
    AltusCard(modifier = modifier, accentKeyline = accentColor(stat.accent)) {
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
        if (stat.caption != null) {
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
}

// ─── Funnel ─────────────────────────────────────────────────────────────────────

@Composable
private fun FunnelCard(
    funnel: ImmutableList<AmbFunnelUi>,
    lostCaption: String?,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier, accentKeyline = tokens.workspaces.sales.base) {
        funnel.forEachIndexed { index, stage ->
            if (index > 0) Spacer(Modifier.height(AltusDimens.space2))
            FunnelRow(stage = stage)
        }
        if (lostCaption != null) {
            Spacer(Modifier.height(AltusDimens.space3))
            HorizontalDivider(thickness = AltusDimens.hairline, color = tokens.hairline)
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = lostCaption,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun FunnelRow(stage: AmbFunnelUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stage.label,
            style = AltusType.label,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(112.dp),
        )
        Spacer(Modifier.width(AltusDimens.space2))
        Box(
            modifier = Modifier
                .weight(1f)
                .height(20.dp)
                .clip(AltusShapeTokens.pill)
                .background(tokens.sunken),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(stage.fraction.coerceIn(0.02f, 1f))
                    .height(20.dp)
                    .clip(AltusShapeTokens.pill)
                    .background(tokens.workspaces.sales.base),
            )
        }
        Spacer(Modifier.width(AltusDimens.space2))
        Text(
            text = stage.count.toString(),
            style = AltusType.monoData,
            color = tokens.ink400,
            maxLines = 1,
            modifier = Modifier.width(28.dp),
        )
    }
}

// ─── Partner row ─────────────────────────────────────────────────────────────────

@Composable
private fun PartnerRow(partner: AmbPartnerUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(name = partner.name, imageUrl = partner.photoUrl, size = 44.dp)
        Spacer(Modifier.width(AltusDimens.space3))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = partner.name,
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (partner.tierLabel != null) {
                    Spacer(Modifier.width(AltusDimens.space2))
                    TierPill(label = partner.tierLabel)
                }
            }
            Text(
                text = partner.company,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = buildString {
                    append(partner.pipeline)
                    if (partner.commissionCaption != null) {
                        append(" · ")
                        append(partner.commissionCaption)
                    }
                },
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = partner.revenue,
                style = AltusType.monoData,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
            if (partner.score != null) {
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = "score ${partner.score}",
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Quiet tier pill — sunken bed, meta ink (tier is not a success state). */
@Composable
private fun TierPill(label: String, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Text(
        text = label,
        style = AltusType.caption,
        color = tokens.ink400,
        maxLines = 1,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    )
}

// ─── Small parts ────────────────────────────────────────────────────────────────

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
private fun AmbassadorsLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
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
private fun AmbassadorsSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
    ) {
        // KPI silhouette — two full rows + a trailing single.
        repeat(3) { row ->
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
                if (row < 2) {
                    SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
                } else {
                    Spacer(Modifier.weight(1f))
                }
            }
        }

        // Partner rows.
        repeat(6) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp)
                    .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonBox(modifier = Modifier.width(44.dp).height(44.dp))
                Spacer(Modifier.width(AltusDimens.space3))
                Column(Modifier.weight(1f)) {
                    SkeletonLine(width = 168.dp)
                    Spacer(Modifier.height(AltusDimens.space1))
                    SkeletonLine(width = 120.dp, height = 10.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonLine(width = 56.dp)
            }
        }
    }
}

// ─── Accent resolution (no hex in composables) ───────────────────────────────

@Composable
private fun accentColor(accent: AmbAccent): Color {
    val tokens = AltusTheme.tokens
    return when (accent) {
        AmbAccent.Sales -> tokens.workspaces.sales.base
        AmbAccent.Success -> tokens.success.color
        AmbAccent.Warn -> tokens.warn.color
        AmbAccent.Neutral -> tokens.ink400
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object AmbassadorsIcons {
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Ambassadors.ArrowLeft",
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
