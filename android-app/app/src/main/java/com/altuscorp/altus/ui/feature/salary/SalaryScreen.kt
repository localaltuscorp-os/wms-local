@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.salary

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
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
import com.altuscorp.altus.ui.designsystem.AltusChip
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
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
 * Salary (Employees workspace): the signed-in user's own payslip.
 *
 * Anatomy, top to bottom:
 *  1. A net-pay hero card carrying the Employees/attendance module keyline
 *     (§1.1, keyline only) — eyebrow + month, the `numeralHero` net figure, and
 *     a quiet designation · company line.
 *  2. A horizontal "recent months" chip row (the month selector) when more than
 *     one payslip exists.
 *  3. A "Breakdown" ledger — the pay ladder from CTC down to net, deductions
 *     shown with a leading "−", the net line emphasised above a hairline.
 *  4. A "Days on sheet" card — the sheet's own attendance figures (never the
 *     app's punch ledger; matched to the web page's disclaimer).
 *  5. An optional remarks note.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache. Pull to
 * refresh is evergreen with a CLOCK_TICK when the pull arms.
 */
@Composable
fun SalaryScreen(
    onBack: () -> Unit,
    viewModel: SalaryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    SalaryContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun SalaryContent(
    state: SalaryUiState,
    onBack: () -> Unit,
    onIntent: (SalaryIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Salary",
            navigationIcon = SalaryIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> SalarySkeleton()
            state.loadFailed && !state.hasContent -> SalaryLoadError(
                onRetry = { onIntent(SalaryIntent.Retry) },
            )
            !state.hasContent -> SalaryEmpty()
            else -> SalaryLedger(state = state, onIntent = onIntent)
        }
    }
}

// ─── Loaded ledger ────────────────────────────────────────────────────────────

@Composable
private fun SalaryLedger(
    state: SalaryUiState,
    onIntent: (SalaryIntent) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    val haptics = currentHaptics()
    val selected = state.selected

    LaunchedEffect(pullState, haptics) {
        snapshotFlow { pullState.distanceFraction >= 1f }
            .distinctUntilChanged()
            .filter { it }
            .collect { haptics.clockTick() }
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(SalaryIntent.Refresh) },
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
            if (selected != null) {
                item(key = "hero", contentType = "hero") {
                    NetPayHero(
                        month = selected,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            if (state.months.size > 1) {
                item(key = "months", contentType = "months") {
                    MonthChips(
                        state = state,
                        onSelect = { onIntent(SalaryIntent.SelectMonth(it)) },
                        modifier = Modifier.padding(top = AltusDimens.cardGap),
                    )
                }
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

            if (selected != null) {
                item(key = "breakdown-header", contentType = "section-header") {
                    SectionHeader(
                        title = "Breakdown",
                        count = selected.netPayLabel,
                        modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                    )
                }
                item(key = "breakdown", contentType = "breakdown") {
                    BreakdownCard(
                        month = selected,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }

                item(key = "days-header", contentType = "section-header") {
                    SectionHeader(
                        title = "Days on sheet",
                        count = "${selected.daysWorkedLabel}/${selected.finalWorkingDaysLabel}",
                        modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                    )
                }
                item(key = "days", contentType = "days") {
                    DaysCard(
                        month = selected,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }

                val remarks = selected.remarks
                if (remarks != null) {
                    item(key = "remarks", contentType = "remarks") {
                        RemarksCard(
                            text = remarks,
                            modifier = Modifier.padding(
                                start = AltusDimens.screenGutter,
                                end = AltusDimens.screenGutter,
                                top = AltusDimens.cardGap,
                            ),
                        )
                    }
                }
            }
        }
    }
}

// ─── Net-pay hero ─────────────────────────────────────────────────────────────

@Composable
private fun NetPayHero(
    month: SalaryMonthUi,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.accents.attendance,
    ) {
        Text(
            text = "NET PAY · ${month.monthLabel.uppercase()}",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = month.netPayLabel,
            style = AltusType.numeralHero,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (month.metaLine != null) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = month.metaLine,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// ─── Month chips (the recent-months selector) ────────────────────────────────

@Composable
private fun MonthChips(
    state: SalaryUiState,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val activeKey = state.selected?.key
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = AltusDimens.screenGutter),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        state.months.forEach { month ->
            AltusChip(
                label = month.shortLabel,
                selected = month.key == activeKey,
                onClick = { onSelect(month.key) },
            )
        }
    }
}

// ─── Breakdown ledger ─────────────────────────────────────────────────────────

@Composable
private fun BreakdownCard(
    month: SalaryMonthUi,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth()) {
        month.breakdown.forEachIndexed { index, line ->
            if (line.kind == SalaryLineKind.Net) {
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = AltusDimens.space2),
                    thickness = AltusDimens.hairline,
                    color = tokens.hairline,
                )
            } else if (index > 0) {
                Spacer(Modifier.height(AltusDimens.space1))
            }
            BreakdownRow(line = line)
        }
    }
}

@Composable
private fun BreakdownRow(line: SalaryLine) {
    val tokens = AltusTheme.tokens
    val isNet = line.kind == SalaryLineKind.Net
    val labelColor = when (line.kind) {
        SalaryLineKind.Net -> MaterialTheme.colorScheme.onSurface
        SalaryLineKind.Deduction -> tokens.ink400
        SalaryLineKind.Component -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val valueColor = if (line.kind == SalaryLineKind.Deduction) tokens.ink400
    else MaterialTheme.colorScheme.onSurface

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = line.label,
            style = if (isNet) AltusType.bodyStrong else AltusType.body,
            color = labelColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(AltusDimens.space3))
        Text(
            text = line.value,
            style = if (isNet) AltusType.numeralStat else AltusType.monoData,
            color = valueColor,
            maxLines = 1,
        )
    }
}

// ─── Days on sheet ────────────────────────────────────────────────────────────

@Composable
private fun DaysCard(
    month: SalaryMonthUi,
    modifier: Modifier = Modifier,
) {
    AltusCard(modifier = modifier.fillMaxWidth()) {
        DaysRow(label = "Present", value = month.presentLabel)
        Spacer(Modifier.height(AltusDimens.space1))
        DaysRow(label = "Absent", value = month.absentLabel)
        Spacer(Modifier.height(AltusDimens.space1))
        DaysRow(label = "Half-day", value = month.halfDayLabel)
        Spacer(Modifier.height(AltusDimens.space1))
        DaysRow(label = "Weekly off", value = month.weeklyOffLabel)
        Spacer(Modifier.height(AltusDimens.space1))
        DaysRow(label = "Final working days", value = month.finalWorkingDaysLabel)
    }
}

@Composable
private fun DaysRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 32.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(AltusDimens.space3))
        Text(text = value, style = AltusType.monoData, color = MaterialTheme.colorScheme.onSurface)
    }
}

// ─── Remarks ──────────────────────────────────────────────────────────────────

@Composable
private fun RemarksCard(text: String, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "REMARKS",
            style = AltusType.caption,
            color = tokens.ink400,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = text,
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

// ─── Degraded / empty states ──────────────────────────────────────────────────

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
            text = "Couldn't refresh — showing the last synced payslip.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun SalaryEmpty(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "No payslips yet.",
            body = "Your monthly payslips appear here once payroll is imported.",
        )
    }
}

@Composable
private fun SalaryLoadError(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
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
private fun SalarySkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
    ) {
        // Net-pay hero silhouette.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .height(120.dp),
        )

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
            SkeletonLine(width = 120.dp, height = 12.dp)
            Spacer(Modifier.weight(1f))
            SkeletonLine(width = 64.dp, height = 12.dp)
        }

        // Breakdown card silhouette.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter)
                .height(220.dp),
        )
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object SalaryIcons {
    /** lucide `arrow-left` — the top-bar back affordance. */
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "Salary.ArrowLeft",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        )
        listOf("M12 19l-7-7 7-7", "M19 12H5").forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(Color.Black), // overridden by Icon tint
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        builder.build()
    }
}
