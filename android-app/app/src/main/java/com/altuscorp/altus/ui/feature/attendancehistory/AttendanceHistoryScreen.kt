@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.attendance

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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import com.altuscorp.altus.ui.designsystem.SkeletonCircle
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * Attendance History (S2 note): the quiet punch ledger.
 *
 * Anatomy, top to bottom:
 *  1. Two half-width stat cards — days present (mono `x/14`) and devices
 *     enrolled — carrying the attendance module keyline (§1.1, keyline only,
 *     never text/fill).
 *  2. A sticky-safe [SectionHeader] eyebrow with the mono presence count.
 *  3. Full-bleed 64dp hairline ledger rows (S3/S10 row grammar): presence dot,
 *     day label + quiet meta line, mono `in → out` value right.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache and keep
 * the exact resolved geometry (Signature 8). Pull-to-refresh is evergreen with
 * a CLOCK_TICK when the pull arms (S2).
 */
@Composable
fun AttendanceHistoryScreen(
    onBack: () -> Unit,
    viewModel: AttendanceHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    AttendanceHistoryContent(
        state = state,
        onBack = onBack,
        onIntent = viewModel::onIntent,
    )
}

@Composable
private fun AttendanceHistoryContent(
    state: AttendanceHistoryUiState,
    onBack: () -> Unit,
    onIntent: (AttendanceHistoryIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Attendance",
            navigationIcon = AttendanceHistoryIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> HistorySkeleton()
            state.loadFailed && !state.hasContent -> HistoryLoadError(
                onRetry = { onIntent(AttendanceHistoryIntent.Retry) },
            )
            else -> HistoryLedger(
                state = state,
                onRefresh = { onIntent(AttendanceHistoryIntent.Refresh) },
            )
        }
    }
}

// ─── Loaded ledger ────────────────────────────────────────────────────────────

@Composable
private fun HistoryLedger(
    state: AttendanceHistoryUiState,
    onRefresh: () -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    val haptics = currentHaptics()

    // CLOCK_TICK the moment the pull crosses the arm threshold (§1.6).
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
                bottom = AltusDimens.space8,
            ),
        ) {
            item(key = "stats", contentType = "stats") {
                StatsRow(
                    state = state,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
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

            item(key = "log-header", contentType = "section-header") {
                SectionHeader(
                    title = "Punch log · last ${state.windowDays} days",
                    count = "${state.daysPresent}/${state.windowDays}",
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            if (state.days.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "No punches yet.",
                        body = "Your daily clock-ins will appear here.",
                    )
                }
            } else {
                itemsIndexed(
                    items = state.days,
                    key = { _, day -> day.key },
                    contentType = { _, _ -> "punch-day" },
                ) { index, day ->
                    PunchDayRowItem(
                        day = day,
                        showDivider = index < state.days.lastIndex,
                    )
                }
            }
        }
    }
}

// ─── Stats (days present + devices) ───────────────────────────────────────────

@Composable
private fun StatsRow(
    state: AttendanceHistoryUiState,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        StatCard(
            eyebrow = "Days present",
            value = "${state.daysPresent}",
            suffix = "/${state.windowDays}",
            meta = "of the last ${state.windowDays} days",
            modifier = Modifier.weight(1f),
        )
        StatCard(
            eyebrow = "Devices",
            value = "${state.devicesEnrolled}",
            suffix = null,
            meta = if (state.biometricExempt) "Biometric exempt" else "Biometric required",
            modifier = Modifier.weight(1f),
        )
    }
}

/** S2 stat-card grammar: caption eyebrow, `numeral-stat` mono count, quiet meta. */
@Composable
private fun StatCard(
    eyebrow: String,
    value: String,
    suffix: String?,
    meta: String,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier,
        accentKeyline = tokens.accents.attendance,
    ) {
        Text(
            text = eyebrow.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Row {
            Text(
                text = value,
                style = AltusType.numeralStat,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.alignByBaseline(),
            )
            if (suffix != null) {
                Text(
                    text = suffix,
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    modifier = Modifier
                        .alignByBaseline()
                        .padding(start = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = meta,
            style = AltusType.label,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Ledger rows ──────────────────────────────────────────────────────────────

/**
 * One full-bleed hairline ledger row (S3 status-ledger anatomy): presence dot,
 * day + meta left, mono `in → out` right. `heightIn` (not fixed height) so
 * fontScale 1.3× never truncates.
 */
@Composable
private fun PunchDayRowItem(
    day: PunchDayRow,
    showDivider: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens

    val dotColor = when (day.presence) {
        PunchPresence.Complete -> tokens.success.color
        PunchPresence.Open -> MaterialTheme.colorScheme.primary
        PunchPresence.MissingOut -> tokens.warn.color
        PunchPresence.Absent -> tokens.ink300
    }
    val metaColor = when (day.presence) {
        PunchPresence.Complete -> MaterialTheme.colorScheme.onSurfaceVariant
        PunchPresence.Open -> MaterialTheme.colorScheme.primary
        PunchPresence.MissingOut -> tokens.warn.color
        PunchPresence.Absent -> tokens.ink400
    }
    val valueColor = if (day.presence == PunchPresence.Absent) {
        tokens.ink300
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(
                    horizontal = AltusDimens.screenGutter,
                    vertical = AltusDimens.space2,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(dotColor, CircleShape),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = day.dayLabel,
                    style = if (day.isToday) AltusType.bodyStrong else AltusType.body,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = day.metaLabel,
                    style = AltusType.label,
                    color = metaColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(AltusDimens.space3))
            Text(
                text = day.punchLabel,
                style = AltusType.monoData,
                color = valueColor,
                maxLines = 1,
            )
        }
        if (showDivider) {
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                thickness = AltusDimens.hairline,
                color = tokens.hairline,
            )
        }
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
            text = "Couldn't refresh — showing the last synced ledger.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

/** Cold cache + failed fetch: the calm full-screen retry (never a dead end). */
@Composable
private fun HistoryLoadError(
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

private const val SKELETON_ROWS = 9

@Composable
private fun HistorySkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
    ) {
        // Stats row silhouette — two half-width cards.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            SkeletonBox(
                modifier = Modifier
                    .weight(1f)
                    .height(112.dp),
            )
            SkeletonBox(
                modifier = Modifier
                    .weight(1f)
                    .height(112.dp),
            )
        }

        // Section-header silhouette.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 36.dp)
                .padding(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    top = AltusDimens.sectionGap - AltusDimens.cardGap,
                    bottom = AltusDimens.space2,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonLine(width = 168.dp, height = 12.dp)
            Spacer(Modifier.weight(1f))
            SkeletonLine(width = 44.dp, height = 12.dp)
        }

        // Ledger-row silhouettes — dot, day + meta lines, mono value.
        repeat(SKELETON_ROWS) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 64.dp)
                    .padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.space2,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonCircle(diameter = 8.dp)
                Spacer(Modifier.width(AltusDimens.space3))
                Column(Modifier.weight(1f)) {
                    SkeletonLine(width = 112.dp)
                    Spacer(Modifier.height(AltusDimens.space1))
                    SkeletonLine(width = 84.dp, height = 10.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonLine(width = 96.dp)
            }
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object AttendanceHistoryIcons {

    /** lucide `arrow-left` — the top-bar back affordance. */
    val ArrowLeft: ImageVector by lazy {
        lucide(
            name = "AttendanceHistory.ArrowLeft",
            "M12 19l-7-7 7-7",
            "M19 12H5",
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
