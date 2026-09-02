@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.signals

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.altuscorp.altus.ui.designsystem.StatusPill
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.haptics.currentHaptics
import androidx.compose.runtime.snapshotFlow
import kotlinx.collections.immutable.ImmutableList
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * SIGNALS (Employees · PMS) — the signed-in user's own recognition &
 * promotion-signal feed, the personal read-only mirror of the web
 * `/pms/signals` release console.
 *
 * Anatomy, top to bottom:
 *  1. A quiet hero: an EMPLOYEES eyebrow, a `display` title, and a one-line
 *     framing subtitle.
 *  2. A 2-up KPI strip — recognitions received (with the released tally) and
 *     promotion signals (with the flagged tally) — carrying the Employees
 *     workspace keyline (§1.1 keyline only, never text/fill).
 *  3. Two sections — RECOGNITION and PROMOTION SIGNALS — each a sticky-safe
 *     [SectionHeader] eyebrow over card rows (kind/score, a server-driven
 *     [StatusPill], the reason/rationale, and a quiet decided-by footnote),
 *     with a calm per-section empty state.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache and keep
 * the resolved geometry (Signature 8). Pull-to-refresh is evergreen with a
 * CLOCK_TICK when the pull arms.
 */
@Composable
fun SignalsScreen(
    onBack: () -> Unit,
    viewModel: SignalsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    SignalsContent(
        state = state,
        onBack = onBack,
        onIntent = viewModel::onIntent,
    )
}

@Composable
private fun SignalsContent(
    state: SignalsUiState,
    onBack: () -> Unit,
    onIntent: (SignalsIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Signals",
            navigationIcon = SignalsIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> SignalsSkeleton()
            state.loadFailed && !state.hasContent -> SignalsLoadError(
                onRetry = { onIntent(SignalsIntent.Retry) },
            )
            else -> SignalsLedger(
                state = state,
                onRefresh = { onIntent(SignalsIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded ledger ────────────────────────────────────────────────────────────

@Composable
private fun SignalsLedger(
    state: SignalsUiState,
    onRefresh: () -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    val haptics = currentHaptics()

    LaunchedEffect(pullState, haptics) {
        snapshotFlow { pullState.distanceFraction >= 1f }
            .distinctUntilChanged()
            .filter { it }
            .collect { haptics.clockTick() }
    }

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
            item(key = "hero", contentType = "hero") {
                SignalsHero(
                    subtitle = state.subtitle,
                    modifier = Modifier.padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.space2,
                    ),
                )
            }

            item(key = "kpis", contentType = "kpis") {
                KpiRow(
                    kpis = state.kpis,
                    modifier = Modifier.padding(
                        start = AltusDimens.screenGutter,
                        end = AltusDimens.screenGutter,
                        top = AltusDimens.space2,
                    ),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale-banner", contentType = "stale-banner") {
                    StaleBanner(
                        modifier = Modifier.padding(
                            start = AltusDimens.screenGutter,
                            end = AltusDimens.screenGutter,
                            top = AltusDimens.cardGap,
                        ),
                    )
                }
            }

            // ── Recognition ──
            item(key = "recognition-header", contentType = "section-header") {
                SectionHeader(
                    title = "Recognition",
                    count = state.recognitions.size.toString(),
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }
            if (state.recognitions.isEmpty()) {
                item(key = "recognition-empty", contentType = "empty") {
                    EmptyState(
                        headline = "No recognition yet.",
                        body = "As your score crosses the recognition threshold, released kudos appear here.",
                    )
                }
            } else {
                items(
                    items = state.recognitions,
                    key = { "r-${it.id}" },
                    contentType = { "recognition-card" },
                ) { row ->
                    RecognitionCard(
                        row = row,
                        modifier = Modifier.padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space1,
                        ),
                    )
                }
            }

            // ── Promotion signals ──
            item(key = "promotion-header", contentType = "section-header") {
                SectionHeader(
                    title = "Promotion signals",
                    count = state.promotions.size.toString(),
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }
            if (state.promotions.isEmpty()) {
                item(key = "promotion-empty", contentType = "empty") {
                    EmptyState(
                        headline = "No promotion signals.",
                        body = "When you cross the promotion threshold with enough tenure, you're flagged here for review.",
                    )
                }
            } else {
                items(
                    items = state.promotions,
                    key = { "p-${it.id}" },
                    contentType = { "promotion-card" },
                ) { row ->
                    PromotionCard(
                        row = row,
                        modifier = Modifier.padding(
                            horizontal = AltusDimens.screenGutter,
                            vertical = AltusDimens.space1,
                        ),
                    )
                }
            }
        }
    }
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

@Composable
private fun SignalsHero(
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.employees.base
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "EMPLOYEES · PERFORMANCE",
            style = AltusType.caption,
            color = accent,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = "Recognition & promotions",
            style = AltusType.display,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (subtitle.isNotBlank()) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = subtitle,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ─── KPI strip ─────────────────────────────────────────────────────────────────

@Composable
private fun KpiRow(
    kpis: ImmutableList<SignalsKpiUi>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        kpis.forEach { kpi ->
            KpiCard(kpi = kpi, modifier = Modifier.weight(1f))
        }
    }
}

/** One KPI stat card: caption eyebrow, `numeralStat` mono value, quiet caption. */
@Composable
private fun KpiCard(
    kpi: SignalsKpiUi,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier,
        accentKeyline = kpi.accent.color(),
    ) {
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
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Recognition card ───────────────────────────────────────────────────────────

@Composable
private fun RecognitionCard(
    row: RecognitionUi,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.employees.base
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = accent,
    ) {
        Row(verticalAlignment = Alignment.Top) {
            GlyphTile(glyph = SignalsIcons.Award, tint = accent)
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = row.kind,
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = row.meta,
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(AltusDimens.space2))
            StatusPill(display = row.status)
        }
        if (row.reason != null) {
            Spacer(Modifier.height(AltusDimens.space3))
            Text(
                text = row.reason,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (row.footnote != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = row.footnote,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ─── Promotion card ─────────────────────────────────────────────────────────────

@Composable
private fun PromotionCard(
    row: PromotionUi,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.employees.base
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = accent,
    ) {
        Row(verticalAlignment = Alignment.Top) {
            if (row.scoreLabel != null) {
                Text(
                    text = row.scoreLabel,
                    style = AltusType.numeralStat,
                    color = accent,
                    maxLines = 1,
                    modifier = Modifier.width(56.dp),
                )
            } else {
                GlyphTile(glyph = SignalsIcons.TrendingUp, tint = accent)
            }
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Promotion signal",
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (row.eligibleLabel != null) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(
                        text = row.eligibleLabel,
                        style = AltusType.label,
                        color = tokens.ink400,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(AltusDimens.space2))
            StatusPill(display = row.status)
        }
        if (row.rationale != null) {
            Spacer(Modifier.height(AltusDimens.space3))
            Text(
                text = row.rationale,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (row.footnote != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = row.footnote,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** A 40dp accent-tinted glyph bed (§1.1 12%-wash container). */
@Composable
private fun GlyphTile(
    glyph: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(40.dp)
            .clip(RoundedCornerShape(AltusDimens.radiusInput))
            .background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = glyph,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(20.dp),
        )
    }
}

// ─── Degraded states ──────────────────────────────────────────────────────────

/** Quiet warn banner when content is on screen but the reconcile failed. */
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
            text = "Couldn't refresh — showing your last synced signals.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

/** Cold cache + failed fetch: the calm full-screen retry (never a dead end). */
@Composable
private fun SignalsLoadError(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
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
private fun SignalsSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.cardGap,
            ),
    ) {
        // Hero silhouette.
        SkeletonLine(width = 168.dp, height = 12.dp)
        Spacer(Modifier.height(AltusDimens.space3))
        SkeletonLine(width = 240.dp, height = 28.dp)
        Spacer(Modifier.height(AltusDimens.space4))

        // KPI strip silhouette — two half-width cards.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            SkeletonBox(modifier = Modifier.weight(1f).height(96.dp))
            SkeletonBox(modifier = Modifier.weight(1f).height(96.dp))
        }
        Spacer(Modifier.height(AltusDimens.sectionGap))

        // Section-header silhouette.
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonLine(width = 132.dp, height = 12.dp)
        }
        Spacer(Modifier.height(AltusDimens.cardGap))

        // Two card silhouettes.
        repeat(2) {
            SkeletonBox(modifier = Modifier.fillMaxWidth().height(96.dp))
            Spacer(Modifier.height(AltusDimens.cardGap))
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object SignalsIcons {

    /** lucide `arrow-left` — the top-bar back affordance. */
    val ArrowLeft: ImageVector by lazy {
        lucide("Signals.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5")
    }

    /** lucide `award` — recognition. */
    val Award: ImageVector by lazy {
        lucide(
            "Signals.Award",
            "M12 2a6 6 0 1 0 0 12 6 6 0 1 0 0-12",
            "M8.21 13.89 7 22l5-3 5 3-1.21-8.11",
        )
    }

    /** lucide `trending-up` — promotion signal. */
    val TrendingUp: ImageVector by lazy {
        lucide(
            "Signals.TrendingUp",
            "M22 7 13.5 15.5 8.5 10.5 2 17",
            "M16 7h6v6",
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

// ─── Accent resolution (theme-resolved, never a hex here) ────────────────────

@Composable
private fun SignalsAccent.color(): Color {
    val tokens = AltusTheme.tokens
    return when (this) {
        SignalsAccent.Employees -> tokens.workspaces.employees.base
        SignalsAccent.Success -> tokens.success.color
        SignalsAccent.Warn -> tokens.warn.color
        SignalsAccent.Neutral -> tokens.ink400
    }
}
