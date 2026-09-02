@file:OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.altuscorp.altus.feature.accounts

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
import com.altuscorp.altus.data.remote.dto.AccountsRowDto
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
 * Admin · Accounts → a normalized register section (Vasa · Shares · IT · SIP ·
 * Bank). Read-only: a stats strip then one card per row with its key/value
 * fields; a row with a link opens it in the browser.
 */
@Composable
fun AccountsSectionScreen(
    onBack: () -> Unit,
    viewModel: AccountsSectionViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier.fillMaxSize().background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = state.title,
            navigationIcon = AccSecIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> SectionSkeleton()
            state.notOnMobile -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState(headline = "Best viewed on the web", body = "This tracker isn't available on mobile yet — open it on the dashboard.")
            }
            state.loadFailed && !state.hasContent -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState(headline = "Couldn't load.", body = "Check your connection and try again.", actionLabel = "Retry", onAction = { viewModel.onIntent(AccountsSectionIntent.Retry) })
            }
            else -> SectionList(state = state)
        }
    }
}

@Composable
private fun SectionList(state: AccountsSectionUiState) {
    val tokens = AltusTheme.tokens
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = AltusDimens.cardGap, bottom = AltusDimens.space8),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(key = "head", contentType = "head") {
            AltusCard(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth(), accentKeyline = tokens.workspaces.accounts.base) {
                Text(state.eyebrow, style = AltusType.caption, color = tokens.workspaces.accounts.base, maxLines = 1)
                Spacer(Modifier.height(AltusDimens.space2))
                Text(state.title, style = AltusType.heading, color = MaterialTheme.colorScheme.onSurface)
                if (state.subtitle.isNotBlank()) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(state.subtitle, style = AltusType.body, color = tokens.ink400)
                }
                if (state.stats.isNotEmpty()) {
                    Spacer(Modifier.height(AltusDimens.space3))
                    Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space6)) {
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
        }

        item(key = "rows-header", contentType = "section-header") {
            SectionHeader(title = "Records", count = "${state.rows.size}", modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap))
        }

        if (state.rows.isEmpty()) {
            item(key = "empty") { EmptyState(headline = "No records.", body = "Nothing recorded in this section yet.") }
        } else {
            items(items = state.rows, key = { it.title + (it.subtitle ?: "") }, contentType = { "row" }) { row ->
                RowCard(row = row, modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
            }
        }
    }
}

@Composable
private fun RowCard(row: AccountsRowDto, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val context = LocalContext.current
    val clickable = row.link != null
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.workspaces.accounts.base,
        onClick = if (clickable) {
            { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, row.link!!.toUri())) } }
        } else null,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(row.title, style = AltusType.heading, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!row.subtitle.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(row.subtitle, style = AltusType.bodyStrong, color = tokens.workspaces.accounts.base, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (clickable) {
                Icon(AccSecIcons.External, contentDescription = "Open link", tint = tokens.ink400, modifier = Modifier.size(18.dp))
            }
        }
        if (row.fields.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space2))
            row.fields.forEach { f ->
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp)) {
                    Text(f.label, style = AltusType.label, color = tokens.ink400, modifier = Modifier.weight(0.4f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(f.value, style = AltusType.label, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(0.6f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun SectionSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize().padding(top = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(120.dp))
        repeat(5) { SkeletonBox(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter).fillMaxWidth().height(88.dp)) }
    }
}

private object AccSecIcons {
    val ArrowLeft: ImageVector by lazy { lucide("AS.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val External: ImageVector by lazy {
        lucide("AS.External", "M15 3h6v6", "M10 14L21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")
    }

    private fun lucide(name: String, vararg paths: String): ImageVector {
        val builder = ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        paths.forEach { d ->
            builder.addPath(
                pathData = addPathNodes(d), fill = null, stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
