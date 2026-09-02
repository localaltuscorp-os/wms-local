@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.wgdashboard

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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
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
import com.altuscorp.altus.data.remote.dto.WgScoreRowDto
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
 * WMS · Weekly Goals dashboard — a team weekly-score gradient hero + a ranked
 * per-person list (score-toned badges). Read-only.
 */
@Composable
fun WgDashboardScreen(
    onBack: () -> Unit,
    viewModel: WgDashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(modifier = Modifier.fillMaxSize().background(tokens.canvas)) {
        AltusTopAppBar(
            title = "Weekly Goals",
            navigationIcon = WgIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> WgSkeleton()
            state.loadFailed && !state.hasContent -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState(headline = "Couldn't load.", body = "Check your connection and try again.", actionLabel = "Retry", onAction = { viewModel.onIntent(WgDashboardIntent.Retry) })
            }
            else -> WgList(state = state)
        }
    }
}

@Composable
private fun WgList(state: WgDashboardUiState) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = AltusDimens.space4, bottom = AltusDimens.space12),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(key = "hero", contentType = "hero") {
            TeamScoreHero(weekLabel = state.weekLabel, teamScore = state.teamScore, count = state.peopleCount, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
        }
        item(key = "people-header", contentType = "section-header") {
            SectionHeader(title = "Team", count = "${state.peopleCount}", modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap))
        }
        if (state.people.isEmpty()) {
            item(key = "empty") { EmptyState(headline = "No goals this week.", body = "Weekly scores will appear here once goals are set.") }
        } else {
            itemsIndexed(items = state.people, key = { _, p -> p.employeeId }, contentType = { _, _ -> "person" }) { i, p ->
                PersonRow(rank = i + 1, person = p, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
            }
        }
    }
}

@Composable
private fun TeamScoreHero(weekLabel: String, teamScore: Int, count: Int, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = modifier.fillMaxWidth().clip(AltusShapeTokens.card)
            .background(Brush.linearGradient(listOf(scheme.primary, tokens.deep)))
            .padding(AltusDimens.space5),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("TEAM SCORE · $weekLabel".uppercase(), style = AltusType.caption, color = tokens.onDeepSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(AltusDimens.space2))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("$teamScore", style = AltusType.numeralHero, color = tokens.onDeep, maxLines = 1)
                    Text("%", style = AltusType.display, color = tokens.onDeep.copy(alpha = 0.85f), modifier = Modifier.padding(start = 4.dp, bottom = 8.dp))
                }
            }
            Text("$count people", style = AltusType.monoData, color = tokens.onDeepSecondary, maxLines = 1)
        }
    }
}

@Composable
private fun PersonRow(rank: Int, person: WgScoreRowDto, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val tone = when {
        person.score >= 100 -> tokens.success.color
        person.score >= 60 -> tokens.warn.color
        else -> tokens.danger.color
    }
    AltusCard(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("#$rank", style = AltusType.monoData, color = tokens.ink400, modifier = Modifier.width(34.dp))
            Column(Modifier.weight(1f)) {
                Text(person.name, style = AltusType.heading, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${person.goals} goal${if (person.goals == 1) "" else "s"}", style = AltusType.monoData, color = tokens.ink400, maxLines = 1)
            }
            Box(
                modifier = Modifier.clip(AltusShapeTokens.pill).background(tone.copy(alpha = 0.14f)).padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
            ) {
                Text("${person.score}%", style = AltusType.bodyStrong, color = tone, maxLines = 1)
            }
        }
    }
}

@Composable
private fun WgSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize().padding(top = AltusDimens.space4),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(120.dp))
        repeat(6) { SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(72.dp)) }
    }
}

private object WgIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Wg.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

    private fun lucide(name: String, vararg paths: String): ImageVector {
        val builder = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        paths.forEach { d ->
            builder.addPath(pathData = addPathNodes(d), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
        }
        return builder.build()
    }
}
