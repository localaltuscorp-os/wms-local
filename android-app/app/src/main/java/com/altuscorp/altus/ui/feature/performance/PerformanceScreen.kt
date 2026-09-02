@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.performance

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
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
import com.altuscorp.altus.ui.designsystem.SkeletonCircle
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.SemanticColor

/**
 * Performance (PMS) — the signed-in user's own 5-pillar score, the native
 * rendition of the web `/pms/[employeeId]` detail page scoped to self.
 *
 * Anatomy, top to bottom:
 *  1. Identity hero — avatar + name + department·tenure, a band chip, and the
 *     big score ring (band-coloured: green Strong / amber On track / red Needs
 *     focus, matching the web bands).
 *  2. A promotion banner (eligible or not) with the engine's rationale.
 *  3. "Score breakdown · 5 pillars" — one card per pillar with a weighted rate
 *     bar (brand-red fill on the light track), its hint, and the sub-signal
 *     rates.
 *  4. Monthly 360 reviews, personal goals, and recognition/promotion signals.
 *
 * Read-only: cache paints instantly (skeletons only on a true cold cache),
 * pull-to-refresh reconciles. The Employees accent rides as a 3dp keyline only.
 */
@Composable
fun PerformanceScreen(
    onBack: () -> Unit,
    viewModel: PerformanceViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    PerformanceContentView(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun PerformanceContentView(
    state: PerformanceUiState,
    onBack: () -> Unit,
    onIntent: (PerformanceIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Performance",
            navigationIcon = PerformanceIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> PerformanceSkeleton()
            state.loadFailed && !state.hasContent -> PerformanceLoadError(
                onRetry = { onIntent(PerformanceIntent.Retry) },
            )
            state.content != null -> PerformanceBody(
                content = state.content,
                isRefreshing = state.isRefreshing,
                refreshFailed = state.refreshFailed,
                onRefresh = { onIntent(PerformanceIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded body ──────────────────────────────────────────────────────────────

@Composable
private fun PerformanceBody(
    content: PerformanceContent,
    isRefreshing: Boolean,
    refreshFailed: Boolean,
    onRefresh: () -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    val tokens = AltusTheme.tokens

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        state = pullState,
        modifier = Modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pullState,
                isRefreshing = isRefreshing,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = tokens.raised,
                color = MaterialTheme.colorScheme.primary,
            )
        },
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.cardGap,
                bottom = AltusDimens.space12,
            ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "hero", contentType = "hero") {
                HeroCard(content = content)
            }

            if (refreshFailed) {
                item(key = "stale", contentType = "stale") { StaleBanner() }
            }

            item(key = "promotion", contentType = "promotion") {
                PromotionBanner(content = content)
            }

            item(key = "pillars-header", contentType = "header") {
                InlineSectionHeader(title = "Score breakdown · 5 pillars", count = null)
            }
            items(
                items = content.pillars,
                key = { "pillar-${it.key}" },
                contentType = { "pillar" },
            ) { pillar ->
                PillarCard(pillar = pillar)
            }

            item(key = "reviews-header", contentType = "header") {
                InlineSectionHeader(title = "Monthly 360 reviews", count = "${content.reviewCount}")
            }
            if (content.reviews.isEmpty()) {
                item(key = "reviews-empty", contentType = "note") {
                    QuietNote(text = "No monthly reviews recorded yet.")
                }
            } else {
                items(
                    items = content.reviews,
                    key = { "review-${it.id}" },
                    contentType = { "review" },
                ) { review ->
                    ReviewCard(review = review)
                }
            }

            item(key = "goals-header", contentType = "header") {
                InlineSectionHeader(title = "Personal goals", count = "${content.personalGoals.size}")
            }
            if (content.personalGoals.isEmpty()) {
                item(key = "goals-empty", contentType = "note") {
                    QuietNote(text = "No personal goals captured yet.")
                }
            } else {
                items(
                    items = content.personalGoals,
                    key = { "goal-${it.id}" },
                    contentType = { "goal" },
                ) { goal ->
                    GoalCard(goal = goal)
                }
            }

            item(key = "signals-header", contentType = "header") {
                InlineSectionHeader(title = "Signals", count = "${content.signals.size}")
            }
            if (content.signals.isEmpty()) {
                item(key = "signals-empty", contentType = "note") {
                    QuietNote(text = "No recognition or promotion signals yet.")
                }
            } else {
                items(
                    items = content.signals,
                    key = { "signal-${it.id}" },
                    contentType = { "signal" },
                ) { signal ->
                    SignalCard(signal = signal)
                }
            }
        }
    }
}

// ─── Hero (identity + score ring) ────────────────────────────────────────────

@Composable
private fun HeroCard(content: PerformanceContent) {
    val tokens = AltusTheme.tokens
    val band = bandSemantic(content.band)
    AltusCard(
        modifier = Modifier.fillMaxWidth(),
        accentKeyline = tokens.workspaces.employees.base,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(name = content.name, imageUrl = content.avatarUrl, size = 48.dp)
                    Spacer(Modifier.width(AltusDimens.space3))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = content.name,
                            style = AltusType.title2,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${content.department} · ${content.tenureLabel}",
                            style = AltusType.label,
                            color = tokens.ink400,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Spacer(Modifier.height(AltusDimens.space3))
                BandChip(label = content.bandLabel, semantic = band)
            }
            Spacer(Modifier.width(AltusDimens.space4))
            ScoreRing(score = content.score, band = band)
        }
    }
}

/** The score ring: a light track + a band-coloured sweep, mono score + band. */
@Composable
private fun ScoreRing(score: Int, band: SemanticColor) {
    val tokens = AltusTheme.tokens
    val fraction = (score.coerceIn(0, 100)) / 100f
    Box(
        modifier = Modifier.size(104.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val strokePx = 10.dp.toPx()
            val inset = strokePx / 2f
            val arcSize = Size(size.width - strokePx, size.height - strokePx)
            val topLeft = Offset(inset, inset)
            val style = Stroke(width = strokePx, cap = StrokeCap.Round)
            drawArc(
                color = tokens.hairline,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = style,
            )
            if (fraction > 0f) {
                drawArc(
                    color = band.color,
                    startAngle = -90f,
                    sweepAngle = 360f * fraction,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = style,
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "$score",
                style = AltusType.numeralStat,
                color = band.color,
                maxLines = 1,
            )
            Text(
                text = "/ 100",
                style = AltusType.caption,
                color = tokens.ink400,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun BandChip(label: String, semantic: SemanticColor) {
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

// ─── Promotion banner ─────────────────────────────────────────────────────────

@Composable
private fun PromotionBanner(content: PerformanceContent) {
    val tokens = AltusTheme.tokens
    val eligible = content.promotionEligible
    AltusCard(
        modifier = Modifier.fillMaxWidth(),
        accentKeyline = if (eligible) tokens.success.color else null,
        containerColor = if (eligible) tokens.success.wash else tokens.surface,
    ) {
        Text(
            text = if (eligible) "Eligible for a promotion review" else "Not yet promotion-eligible",
            style = AltusType.heading,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = content.promotionRationale,
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ─── Pillar card ──────────────────────────────────────────────────────────────

@Composable
private fun PillarCard(pillar: PillarRow) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = Modifier.fillMaxWidth(),
        accentKeyline = tokens.workspaces.employees.base,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = pillar.name,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(AltusDimens.space2))
            Text(
                text = "wt ${pillar.weightLabel}",
                style = AltusType.monoData,
                color = tokens.ink400,
                maxLines = 1,
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Text(
                text = pillar.ratePct ?: "No data",
                style = AltusType.monoData,
                color = if (pillar.rate == null) tokens.ink300 else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(AltusDimens.space2))
        RateBar(rate = pillar.rate)
        if (pillar.hint != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = pillar.hint,
                style = AltusType.label,
                color = tokens.ink400,
            )
        }
        if (pillar.subSignals.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space3))
            pillar.subSignals.forEachIndexed { index, sub ->
                if (index > 0) Spacer(Modifier.height(AltusDimens.space1))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = sub.label,
                        style = AltusType.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = sub.ratePct,
                        style = AltusType.monoData,
                        color = tokens.ink400,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** A thin rounded meter: light track + brand-red fill (null rate = empty). */
@Composable
private fun RateBar(rate: Float?) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken),
    ) {
        if (rate != null && rate > 0f) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(rate.coerceIn(0f, 1f))
                    .height(8.dp)
                    .clip(AltusShapeTokens.pill)
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
    }
}

// ─── Review card ──────────────────────────────────────────────────────────────

@Composable
private fun ReviewCard(review: ReviewRow) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = review.relationLabel.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = review.reviewerName,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${review.period} · ${review.scope}",
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space5)) {
            RatingCell(label = "Attitude", value = review.attitude)
            RatingCell(label = "Behaviour", value = review.behaviour)
            RatingCell(label = "Skill", value = review.skill)
        }
        if (review.changeTags.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space3))
            review.changeTags.forEachIndexed { index, tag ->
                if (index > 0) Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = "· $tag",
                    style = AltusType.label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (review.explanation != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = review.explanation,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RatingCell(label: String, value: Int?) {
    val tokens = AltusTheme.tokens
    Column {
        Text(
            text = label,
            style = AltusType.label,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
        Text(
            text = if (value == null) "—" else "$value/5",
            style = AltusType.monoData,
            color = if (value == null) tokens.ink300 else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Goal card ────────────────────────────────────────────────────────────────

@Composable
private fun GoalCard(goal: GoalRow) {
    val tokens = AltusTheme.tokens
    val badgeColor = when {
        goal.done -> tokens.success.color
        goal.dropped -> tokens.ink300
        else -> MaterialTheme.colorScheme.primary
    }
    AltusCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(badgeColor),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = goal.badge,
                    style = AltusType.label,
                    color = MaterialTheme.colorScheme.onPrimary,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.width(AltusDimens.space3))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = goal.title,
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (goal.detail != null) {
                    Text(
                        text = goal.detail,
                        style = AltusType.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = goal.meta.uppercase(),
                    style = AltusType.caption,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
        }
    }
}

// ─── Signal card ──────────────────────────────────────────────────────────────

@Composable
private fun SignalCard(signal: SignalRow) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = signal.title,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(AltusDimens.space2))
            Text(
                text = signal.statusLabel.uppercase(),
                style = AltusType.caption,
                color = tokens.ink400,
                maxLines = 1,
                modifier = Modifier
                    .clip(AltusShapeTokens.pill)
                    .background(tokens.sunken)
                    .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
            )
        }
        if (signal.body != null) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = signal.body,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!signal.meta.isNullOrBlank()) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = signal.meta,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

@Composable
private fun InlineSectionHeader(title: String, count: String?) {
    SectionHeader(
        title = title,
        count = count,
        containerColor = AltusTheme.tokens.canvas,
        modifier = Modifier.padding(top = AltusDimens.space3),
    )
}

@Composable
private fun QuietNote(text: String) {
    AltusCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = text,
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StaleBanner() {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.warn.wash)
            .padding(AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Couldn't refresh — showing your last synced score.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun PerformanceLoadError(onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

// ─── Band colour ──────────────────────────────────────────────────────────────

@Composable
private fun bandSemantic(band: ScoreBand): SemanticColor {
    val tokens = AltusTheme.tokens
    return when (band) {
        ScoreBand.Strong -> tokens.success
        ScoreBand.OnTrack -> tokens.warn
        ScoreBand.NeedsFocus -> tokens.danger
    }
}

// ─── Skeleton (Signature 8: exact resolved geometry) ─────────────────────────

@Composable
private fun PerformanceSkeleton() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.cardGap,
            ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        // Hero silhouette: identity block + score ring.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .clip(AltusShapeTokens.card)
                .background(AltusTheme.tokens.surface)
                .padding(AltusDimens.cardPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SkeletonCircle(diameter = 48.dp)
                    Spacer(Modifier.width(AltusDimens.space3))
                    Column {
                        SkeletonLine(width = 140.dp)
                        Spacer(Modifier.height(AltusDimens.space1))
                        SkeletonLine(width = 96.dp, height = 10.dp)
                    }
                }
                Spacer(Modifier.height(AltusDimens.space4))
                SkeletonLine(width = 88.dp, height = 22.dp)
            }
            Spacer(Modifier.width(AltusDimens.space4))
            SkeletonCircle(diameter = 104.dp)
        }

        repeat(3) {
            SkeletonBox(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(96.dp),
            )
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object PerformanceIcons {
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Performance.ArrowLeft",
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
