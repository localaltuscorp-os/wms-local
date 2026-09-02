@file:OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.altuscorp.altus.feature.indexhub

import android.content.Intent
import androidx.core.net.toUri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.data.remote.dto.IndexLinkDto
import com.altuscorp.altus.data.remote.dto.IndexSectionDto
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * Marketing · Index Hub (read-only). A curated directory of campaign / reach /
 * lead-gen links grouped into sections; each link opens in the browser.
 */
@Composable
fun IndexHubScreen(
    onBack: () -> Unit,
    viewModel: IndexHubViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Index Hub",
            navigationIcon = IndexHubIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> IndexHubSkeleton()
            state.loadFailed && !state.hasContent -> IndexHubError(onRetry = { viewModel.onIntent(IndexHubIntent.Retry) })
            state.sections.isEmpty() -> EmptyState(headline = "No links yet.", body = "Campaign and lead-gen links will appear here.")
            else -> IndexHubList(sections = state.sections)
        }
    }
}

@Composable
private fun IndexHubList(sections: List<IndexSectionDto>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AltusDimens.screenGutter,
            end = AltusDimens.screenGutter,
            top = AltusDimens.space4,
            bottom = AltusDimens.space12,
        ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        items(items = sections, key = { it.id }, contentType = { "section" }) { section ->
            SectionCard(section = section)
        }
    }
}

@Composable
private fun SectionCard(section: IndexSectionDto) {
    val tokens = AltusTheme.tokens
    val context = LocalContext.current
    AltusCard(modifier = Modifier.fillMaxWidth(), accentKeyline = tokens.workspaces.marketing.base) {
        Text(
            text = section.title.ifBlank { "Section" },
            style = AltusType.heading,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (section.links.isEmpty()) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(text = "No links.", style = AltusType.label, color = tokens.ink400)
        } else {
            Spacer(Modifier.height(AltusDimens.space3))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                section.links.forEach { link ->
                    LinkChip(link = link, onOpen = {
                        runCatching {
                            context.startActivity(Intent(Intent.ACTION_VIEW, link.url.toUri()))
                        }
                    })
                }
            }
        }
    }
}

@Composable
private fun LinkChip(link: IndexLinkDto, onOpen: () -> Unit) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.marketing.base
    Row(
        modifier = Modifier
            .clip(AltusShapeTokens.pill)
            .background(accent.copy(alpha = 0.10f))
            .clickable(onClick = onOpen)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = link.label.ifBlank { link.url },
            style = AltusType.bodyStrong,
            color = accent,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(AltusDimens.space1))
        Icon(IndexHubIcons.External, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
    }
}

// ─── States ───────────────────────────────────────────────────────────────────

@Composable
private fun IndexHubError(onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load the Index Hub.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

@Composable
private fun IndexHubSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize().padding(AltusDimens.screenGutter),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        repeat(4) { SkeletonBox(modifier = Modifier.fillMaxWidth().height(96.dp)) }
    }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

private object IndexHubIcons {
    val ArrowLeft: ImageVector by lazy { lucide("IH.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val External: ImageVector by lazy {
        lucide("IH.External", "M15 3h6v6", "M10 14L21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")
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
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
