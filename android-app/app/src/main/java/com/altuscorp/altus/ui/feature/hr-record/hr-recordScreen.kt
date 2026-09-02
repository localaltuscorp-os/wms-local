@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.altuscorp.altus.feature.hrrecord

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.runtime.Composable
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
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusChip
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusTokens
import com.altuscorp.altus.ui.theme.AltusType

/**
 * HR Attendance Record (Employees workspace): the signed-in user's own
 * read-only mirror of the HR "Attendance log" sheet — the owner-scoped
 * counterpart of the web admin page at /attendance/hr-record.
 *
 * Anatomy, top to bottom:
 *  1. An identity card — avatar, name, designation · company, FY + month pills,
 *     and the sheet remark — carrying the attendance module keyline.
 *  2. A month switcher chip row (only when the sheet has more than one month).
 *  3. A seven-card KPI summary of the selected month (Present / Absent / Half /
 *     Weekly-off / Holiday / Total worked / Days-in-month), Present + Total
 *     carrying a share-of-month meter.
 *  4. A Monday-first calendar of the month's verbatim day codes, colour-mapped
 *     semantically, with a legend.
 *  5. The paid-leave entitlement block (DOJ + cycles), when the sheet has one.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache. Read-only
 * by design — nothing here mutates anything. Green means Present/success only.
 */
@Composable
fun HrRecordScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HrRecordViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HrRecordContent(
        state = state,
        onBack = onBack,
        onIntent = viewModel::onIntent,
        modifier = modifier,
    )
}

@Composable
private fun HrRecordContent(
    state: HrRecordUiState,
    onBack: () -> Unit,
    onIntent: (HrRecordIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "HR Record",
            navigationIcon = HrRecordIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> HrRecordSkeleton()
            state.loadFailed && !state.hasContent -> HrRecordLoadError(
                onRetry = { onIntent(HrRecordIntent.Retry) },
            )
            else -> HrRecordBody(state = state, onIntent = onIntent)
        }
    }
}

// ─── Loaded body ──────────────────────────────────────────────────────────────

@Composable
private fun HrRecordBody(
    state: HrRecordUiState,
    onIntent: (HrRecordIntent) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(HrRecordIntent.Refresh) },
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
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "identity", contentType = "identity") {
                IdentityCard(
                    state = state,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale", contentType = "stale") {
                    NoticeBanner(
                        text = "Couldn't refresh — showing the last synced record.",
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            if (state.serverError) {
                item(key = "server-error", contentType = "server-error") {
                    NoticeBanner(
                        text = "Couldn't load the HR record right now. Pull to try again.",
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            if (state.months.size > 1) {
                item(key = "months", contentType = "months") {
                    MonthChipRow(
                        months = state.months,
                        onSelect = { onIntent(HrRecordIntent.SelectMonth(it)) },
                    )
                }
            }

            if (state.showEmpty) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "No HR record yet",
                        body = "The imported sheet has no attendance or paid-leave rows matched to you.",
                        modifier = Modifier.padding(top = AltusDimens.space8),
                    )
                }
            }

            if (state.kpis.isNotEmpty()) {
                item(key = "kpi-header", contentType = "section-header") {
                    SectionHeader(
                        title = state.monthLabel?.let { "Summary · $it" } ?: "Month summary",
                    )
                }
                item(key = "kpis", contentType = "kpis") {
                    KpiGrid(
                        kpis = state.kpis,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            if (state.hasDays) {
                item(key = "grid-header", contentType = "section-header") {
                    SectionHeader(title = "Daily record")
                }
                item(key = "grid", contentType = "grid") {
                    DayGridCard(
                        state = state,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            } else if (state.paidLeave != null && !state.showEmpty && state.kpis.isEmpty()) {
                item(key = "no-months", contentType = "no-months") {
                    NoticeBanner(
                        text = "No monthly attendance on the sheet — only a paid-leave block.",
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }

            state.paidLeave?.let { paid ->
                item(key = "leave-header", contentType = "section-header") {
                    SectionHeader(title = "Paid leave")
                }
                item(key = "leave", contentType = "leave") {
                    PaidLeaveCard(
                        record = paid,
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }
        }
    }
}

// ─── Identity ─────────────────────────────────────────────────────────────────

@Composable
private fun IdentityCard(state: HrRecordUiState, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.accents.attendance,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(name = state.employeeName, size = 56.dp)
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = state.employeeName,
                    style = AltusType.title2,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val meta = listOfNotNull(state.designation, state.companyName).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(
                        text = meta,
                        style = AltusType.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        val pills = listOfNotNull(
            state.fy?.let { "FY $it" },
            state.monthLabel,
        )
        if (pills.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space3))
            Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
                pills.forEach { QuietPill(text = it) }
            }
        }

        state.remark?.let { remark ->
            Spacer(Modifier.height(AltusDimens.space3))
            HorizontalDivider(thickness = AltusDimens.hairline, color = tokens.hairline)
            Spacer(Modifier.height(AltusDimens.space3))
            Text(
                text = remark,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun QuietPill(text: String, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Text(
        text = text,
        style = AltusType.label,
        color = tokens.ink400,
        maxLines = 1,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

// ─── Month switcher ─────────────────────────────────────────────────────────

@Composable
private fun MonthChipRow(
    months: List<HrMonthChip>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = AltusDimens.screenGutter),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        items(months, key = { it.value }, contentType = { "month-chip" }) { chip ->
            AltusChip(
                label = chip.label,
                selected = chip.isSelected,
                onClick = { onSelect(chip.value) },
            )
        }
    }
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────

@Composable
private fun KpiGrid(kpis: List<HrKpi>, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        kpis.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap)) {
                pair.forEach { kpi ->
                    KpiCard(kpi = kpi, modifier = Modifier.weight(1f))
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun KpiCard(kpi: HrKpi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val accent = toneAccent(kpi.tone, tokens)
    AltusCard(
        modifier = modifier,
        accentKeyline = tokens.accents.attendance,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(accent, CircleShape),
            )
            Spacer(Modifier.width(AltusDimens.space2))
            Text(
                text = kpi.label.uppercase(),
                style = AltusType.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
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
        if (kpi.fraction != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            MeterBar(fraction = kpi.fraction, accent = accent)
        }
    }
}

@Composable
private fun MeterBar(fraction: Float, accent: Color, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(4.dp)
                .clip(AltusShapeTokens.pill)
                .background(accent),
        )
    }
}

// ─── Day grid ─────────────────────────────────────────────────────────────────

private val WEEKDAYS = listOf("M", "T", "W", "T", "F", "S", "S")

@Composable
private fun DayGridCard(state: HrRecordUiState, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth()) {
        state.monthLabel?.let {
            Text(
                text = "$it · sheet codes, verbatim",
                style = AltusType.label,
                color = tokens.ink400,
            )
            Spacer(Modifier.height(AltusDimens.space3))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
        ) {
            WEEKDAYS.forEach { w ->
                Text(
                    text = w,
                    style = AltusType.caption,
                    color = tokens.ink400,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space1))

        state.weeks.forEach { week ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 3.dp),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
            ) {
                week.cells.forEach { cell ->
                    Box(modifier = Modifier.weight(1f)) {
                        if (cell != null) DayCell(cell = cell)
                    }
                }
            }
        }

        Spacer(Modifier.height(AltusDimens.space3))
        HorizontalDivider(thickness = AltusDimens.hairline, color = tokens.hairline)
        Spacer(Modifier.height(AltusDimens.space3))
        LegendRow(entries = state.legend)
    }
}

@Composable
private fun DayCell(cell: HrDayCell, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val faint = cell.tone == HrTone.None
    val accent = toneAccent(cell.tone, tokens)
    val bg = if (faint) tokens.sunken else toneWash(cell.tone, tokens)
    Column(
        modifier = modifier
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(AltusDimens.radiusChip))
            .background(bg)
            .padding(horizontal = 5.dp, vertical = 5.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = cell.day.toString(),
            style = AltusType.monoData,
            color = if (faint) tokens.ink300 else MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
        Text(
            text = cell.code,
            style = AltusType.caption,
            color = if (faint) tokens.ink300 else accent,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.End),
        )
    }
}

@Composable
private fun LegendRow(entries: List<HrLegendEntry>, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    androidx.compose.foundation.layout.FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        entries.forEach { entry ->
            val faint = entry.tone == HrTone.None
            val accent = toneAccent(entry.tone, tokens)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(if (faint) tokens.sunken else toneWash(entry.tone, tokens)),
                )
                Spacer(Modifier.width(AltusDimens.space1))
                Text(
                    text = entry.code,
                    style = AltusType.caption,
                    color = if (faint) tokens.ink300 else accent,
                )
                Spacer(Modifier.width(AltusDimens.space1))
                Text(
                    text = entry.label,
                    style = AltusType.label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ─── Paid leave ───────────────────────────────────────────────────────────────

@Composable
private fun PaidLeaveCard(record: HrPaidLeaveUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            record.dojLabel?.let {
                QuietPill(text = "DOJ $it")
                Spacer(Modifier.width(AltusDimens.space2))
            }
            Spacer(Modifier.weight(1f))
            Text(
                text = record.totalLabel,
                style = AltusType.monoData,
                color = tokens.success.color,
                maxLines = 1,
                modifier = Modifier
                    .clip(AltusShapeTokens.pill)
                    .background(tokens.success.wash)
                    .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
            )
        }

        Spacer(Modifier.height(AltusDimens.space3))
        record.cycles.forEachIndexed { index, cycle ->
            LeaveRowItem(cycle = cycle)
            if (index < record.cycles.lastIndex) {
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = AltusDimens.space2),
                    thickness = AltusDimens.hairline,
                    color = tokens.hairline,
                )
            }
        }
    }
}

@Composable
private fun LeaveRowItem(cycle: HrLeaveRow, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = cycle.period,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val sub = listOfNotNull(cycle.status, cycle.remarks.takeIf { it != "—" })
                .joinToString(" · ")
            if (sub.isNotBlank()) {
                Text(
                    text = sub,
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Text(
            text = cycle.leaves,
            style = AltusType.monoData,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

// ─── Degraded / empty states ─────────────────────────────────────────────────

@Composable
private fun NoticeBanner(text: String, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.warn.wash)
            .padding(AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = text, style = AltusType.label, color = tokens.warn.color)
    }
}

@Composable
private fun HrRecordLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
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
private fun HrRecordSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(96.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap)) {
            SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
            SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap)) {
            SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
            SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
        }
        Spacer(Modifier.height(AltusDimens.space1))
        SkeletonLine(width = 160.dp, height = 12.dp)
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(280.dp))
    }
}

// ─── Tone → token colour (no hex; green = Present/success only) ───────────────

private fun toneAccent(tone: HrTone, tokens: AltusTokens): Color = when (tone) {
    HrTone.Present, HrTone.HolidayPresent -> tokens.success.color
    HrTone.Absent -> tokens.danger.color
    HrTone.HalfDay -> tokens.warn.color
    HrTone.Holiday -> tokens.info.color
    HrTone.WeeklyOff -> tokens.ink400
    HrTone.None -> tokens.ink300
}

private fun toneWash(tone: HrTone, tokens: AltusTokens): Color = when (tone) {
    HrTone.Present, HrTone.HolidayPresent -> tokens.success.wash
    HrTone.Absent -> tokens.danger.wash
    HrTone.HalfDay -> tokens.warn.wash
    HrTone.Holiday -> tokens.info.wash
    HrTone.WeeklyOff, HrTone.None -> tokens.sunken
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object HrRecordIcons {
    val ArrowLeft: ImageVector by lazy {
        val builder = ImageVector.Builder(
            name = "HrRecord.ArrowLeft",
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
