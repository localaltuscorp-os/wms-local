@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.attreport

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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
 * Admin · Employees → Att Report (read-only). The org-wide monthly attendance
 * summary: a month navigator + roll-up hero (present · absent · half-day · paid
 * leave · late) then one compact card per employee with their payable days and
 * P / A / H-D / PL / late chips. Direct-fetch; ← / → page the month.
 */
@Composable
fun AttReportScreen(
    onBack: () -> Unit,
    viewModel: AttReportViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Att Report",
            navigationIcon = AttReportIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> AttReportSkeleton()
            state.loadFailed && !state.hasContent -> AttReportError(onRetry = { viewModel.onIntent(AttReportIntent.Retry) })
            else -> AttReportList(state = state, onIntent = viewModel::onIntent)
        }
    }
}

@Composable
private fun AttReportList(
    state: AttReportUiState,
    onIntent: (AttReportIntent) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = AltusDimens.cardGap, bottom = AltusDimens.space8),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(key = "hero", contentType = "hero") {
            HeroCard(state = state, onIntent = onIntent, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
        }

        item(key = "people-header", contentType = "section-header") {
            SectionHeader(
                title = "People",
                count = "${state.peopleCount}",
                modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
            )
        }

        if (state.people.isEmpty()) {
            item(key = "empty", contentType = "empty") {
                EmptyState(headline = "No records.", body = "No attendance was graded for this month.")
            }
        } else {
            items(items = state.people, key = { it.id }, contentType = { "person" }) { row ->
                PersonCard(row = row, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
            }
        }
    }
}

@Composable
private fun HeroCard(
    state: AttReportUiState,
    onIntent: (AttReportIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.employees.base
    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = accent) {
        Text(text = "EMPLOYEES · ATT REPORT", style = AltusType.caption, color = accent, maxLines = 1)
        Spacer(Modifier.height(AltusDimens.space2))
        // Month navigator.
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onIntent(AttReportIntent.PrevMonth) }) {
                Icon(AttReportIcons.ChevronLeft, contentDescription = "Previous month", tint = tokens.ink400, modifier = Modifier.size(22.dp))
            }
            Text(
                text = state.monthLabel,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { onIntent(AttReportIntent.NextMonth) }) {
                Icon(AttReportIcons.ChevronRight, contentDescription = "Next month", tint = tokens.ink400, modifier = Modifier.size(22.dp))
            }
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(modifier = Modifier.fillMaxWidth()) {
            HeroStat(value = "${state.present}", label = "Present", color = tokens.success.color, modifier = Modifier.weight(1f))
            HeroStat(value = "${state.absent}", label = "Absent", color = tokens.danger.color, modifier = Modifier.weight(1f))
            HeroStat(value = "${state.halfDay}", label = "Half", color = tokens.warn.color, modifier = Modifier.weight(1f))
            HeroStat(value = "${state.paidLeave}", label = "Paid Lv", color = tokens.info.color, modifier = Modifier.weight(1f))
            HeroStat(value = "${state.late}", label = "Late", color = tokens.warn.color, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun HeroStat(value: String, label: String, color: Color, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier) {
        Text(text = value, style = AltusType.numeralStat, color = color, maxLines = 1)
        Spacer(Modifier.height(2.dp))
        Text(text = label.uppercase(), style = AltusType.caption, color = tokens.ink400, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun PersonCard(row: AttReportPersonRow, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = tokens.workspaces.employees.base) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = row.name,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(AltusDimens.space2))
            // Payable-day count — the headline number.
            Box(
                modifier = Modifier
                    .clip(AltusShapeTokens.pill)
                    .background(tokens.success.wash)
                    .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
            ) {
                Text(text = "${row.payable} days", style = AltusType.caption, color = tokens.success.color, maxLines = 1)
            }
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(modifier = Modifier.fillMaxWidth()) {
            MiniStat(value = "${row.present}", label = "P", modifier = Modifier.weight(1f))
            MiniStat(value = "${row.absent}", label = "A", color = if (row.absent > 0) tokens.danger.color else null, modifier = Modifier.weight(1f))
            MiniStat(value = "${row.halfDay}", label = "H/D", modifier = Modifier.weight(1f))
            MiniStat(value = "${row.paidLeave}", label = "PL", modifier = Modifier.weight(1f))
            MiniStat(value = "${row.late}", label = "Late", color = if (row.late > 0) tokens.warn.color else null, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun MiniStat(value: String, label: String, modifier: Modifier = Modifier, color: Color? = null) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier) {
        Text(
            text = value,
            style = AltusType.bodyStrong,
            color = color ?: MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
        Text(text = label.uppercase(), style = AltusType.caption, color = tokens.ink400, maxLines = 1)
    }
}

// ─── Loading / error states ────────────────────────────────────────────────────

@Composable
private fun AttReportError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load the report.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

@Composable
private fun AttReportSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(top = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(150.dp))
        repeat(6) {
            SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(96.dp))
        }
    }
}

// ─── Screen-local iconography ──────────────────────────────────────────────────

private object AttReportIcons {
    val ArrowLeft: ImageVector by lazy { lucide("AttReport.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val ChevronLeft: ImageVector by lazy { lucide("AttReport.ChevronLeft", "M15 18l-6-6 6-6") }
    val ChevronRight: ImageVector by lazy { lucide("AttReport.ChevronRight", "M9 18l6-6-6-6") }

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
