@file:OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.altuscorp.altus.feature.teamdashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.altuscorp.altus.data.remote.dto.TeamPersonDto
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/** Admin team dashboard (overtime · reimbursements): a stats strip then a ranked people list. */
@Composable
fun TeamDashboardScreen(
    onBack: () -> Unit,
    viewModel: TeamDashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(modifier = Modifier.fillMaxSize().background(tokens.canvas)) {
        AltusTopAppBar(
            title = state.title.ifBlank { "Dashboard" },
            navigationIcon = TdIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> TdSkeleton()
            state.loadFailed && !state.hasContent -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState(headline = "Couldn't load.", body = "Check your connection and try again.", actionLabel = "Retry", onAction = { viewModel.onIntent(TeamDashboardIntent.Retry) })
            }
            else -> TdList(state = state)
        }
    }
}

@Composable
private fun TdList(state: TeamDashboardUiState) {
    val tokens = AltusTheme.tokens
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = AltusDimens.cardGap, bottom = AltusDimens.space8),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(key = "stats", contentType = "stats") {
            AltusCard(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth()) {
                if (state.periodLabel.isNotBlank()) {
                    Text(state.periodLabel.uppercase(), style = AltusType.caption, color = tokens.ink400, maxLines = 1)
                    Spacer(Modifier.height(AltusDimens.space2))
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space6), verticalArrangement = Arrangement.spacedBy(AltusDimens.space3)) {
                    state.stats.forEach { s ->
                        Column {
                            Text(s.value, style = AltusType.numeralStat, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                            Spacer(Modifier.height(AltusDimens.space1))
                            Text(s.label.uppercase(), style = AltusType.caption, color = tokens.ink400, maxLines = 1)
                        }
                    }
                }
            }
        }
        item(key = "people-header", contentType = "section-header") {
            SectionHeader(title = "People", count = "${state.people.size}", modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap))
        }
        if (state.people.isEmpty()) {
            item(key = "empty") { EmptyState(headline = "No records.", body = "Nothing to show for this period.") }
        } else {
            itemsIndexed(items = state.people, key = { i, p -> "$i-${p.name}" }, contentType = { _, _ -> "person" }) { i, p ->
                PersonRow(rank = i + 1, person = p, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
            }
        }
    }
}

@Composable
private fun PersonRow(rank: Int, person: TeamPersonDto, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("#$rank", style = AltusType.monoData, color = tokens.ink400, modifier = Modifier.width(34.dp))
            Column(Modifier.weight(1f)) {
                Text(person.name, style = AltusType.heading, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (person.secondary.isNotBlank()) {
                    Text(person.secondary, style = AltusType.monoData, color = tokens.ink400, maxLines = 1)
                }
            }
            Text(person.primary, style = AltusType.bodyStrong, color = tokens.workspaces.employees.base, maxLines = 1)
        }
    }
}

@Composable
private fun TdSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize().padding(top = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(96.dp))
        repeat(6) { SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(72.dp)) }
    }
}

private object TdIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Td.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

    private fun lucide(name: String, vararg paths: String): ImageVector {
        val builder = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        paths.forEach { d ->
            builder.addPath(pathData = addPathNodes(d), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
        }
        return builder.build()
    }
}
