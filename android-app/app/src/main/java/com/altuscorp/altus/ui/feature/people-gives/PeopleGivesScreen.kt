@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.peoplegives

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * PEOPLE GIVES (Sales workspace) — the referral network: who can introduce Altus
 * to whom. A faithful mobile rendition of the web `/people-gives` page:
 *
 *  1. A search field (introducer · company · prospect · notes) + a horizontal
 *     business-category filter chip row — the phone-native form of the web
 *     table's toolbar.
 *  2. A count line, then the introduction ledger — one card per introduction,
 *     carrying the Sales workspace keyline: introducer → prospect at company,
 *     the nature of business, and the reference / category / salesperson meta.
 *
 * Cache-first (skeletons only on a true cold cache), evergreen pull-to-refresh,
 * and a calm full-screen retry (Signature 8). Read-only — introductions are
 * logged on the web.
 */
@Composable
fun PeopleGivesScreen(
    onBack: () -> Unit,
    viewModel: PeopleGivesViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    PeopleGivesContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun PeopleGivesContent(
    state: PeopleGivesUiState,
    onBack: () -> Unit,
    onIntent: (PeopleGivesIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "People Gives",
            navigationIcon = PeopleGivesIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> PeopleGivesSkeleton()
            state.loadFailed && !state.hasContent -> PeopleGivesLoadError(
                onRetry = { onIntent(PeopleGivesIntent.Retry) },
            )
            else -> PeopleGivesLoaded(state = state, onIntent = onIntent)
        }
    }
}

// ─── Loaded ──────────────────────────────────────────────────────────────────

@Composable
private fun PeopleGivesLoaded(
    state: PeopleGivesUiState,
    onIntent: (PeopleGivesIntent) -> Unit,
) {
    val pullState = rememberPullToRefreshState()

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(PeopleGivesIntent.Refresh) },
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
            item(key = "subtitle", contentType = "subtitle") {
                Text(
                    text = state.subtitle,
                    style = AltusType.body,
                    color = AltusTheme.tokens.ink400,
                    modifier = Modifier.padding(
                        start = AltusDimens.screenGutter,
                        end = AltusDimens.screenGutter,
                        top = AltusDimens.space3,
                        bottom = AltusDimens.space3,
                    ),
                )
            }

            item(key = "search", contentType = "search") {
                AltusTextField(
                    value = state.query,
                    onValueChange = { onIntent(PeopleGivesIntent.SearchChanged(it)) },
                    placeholder = "Search introducer, company, prospect, notes…",
                    leadingIcon = PeopleGivesIcons.Search,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            if (state.categories.isNotEmpty()) {
                item(key = "categories", contentType = "categories") {
                    CategoryChips(
                        categories = state.categories,
                        selected = state.selectedCategory,
                        onSelect = { onIntent(PeopleGivesIntent.CategorySelected(it)) },
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

            item(key = "count-header", contentType = "section-header") {
                SectionHeader(
                    title = "Introductions",
                    count = countLabel(state),
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            if (state.introductions.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = if (state.isFiltered) "No matches." else "No introductions yet.",
                        body = if (state.isFiltered) {
                            "Try a different search or clear the category filter."
                        } else {
                            "References logged on the web will appear here."
                        },
                    )
                }
            } else {
                items(
                    items = state.introductions,
                    key = { it.id },
                    contentType = { "intro-card" },
                ) { intro ->
                    IntroCard(
                        intro = intro,
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

/** "12" unfiltered · "3 / 12" while a search or category filter is active. */
private fun countLabel(state: PeopleGivesUiState): String =
    if (state.isFiltered) "${state.introductions.size} / ${state.total}" else state.total.toString()

// ─── Category filter chips ───────────────────────────────────────────────────

@Composable
private fun CategoryChips(
    categories: kotlinx.collections.immutable.ImmutableList<String>,
    selected: String?,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = AltusDimens.screenGutter),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        AltusChip(
            label = "All",
            selected = selected == null,
            onClick = { onSelect(null) },
        )
        categories.forEach { category ->
            AltusChip(
                label = category,
                selected = selected == category,
                onClick = { onSelect(if (selected == category) null else category) },
            )
        }
    }
}

// ─── Introduction card ───────────────────────────────────────────────────────

@Composable
private fun IntroCard(intro: PeopleGivesIntroUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.sales.base

    AltusCard(modifier = modifier.fillMaxWidth(), accentKeyline = accent) {
        // Header: introducer + received date.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = "INTRODUCER",
                    style = AltusType.caption,
                    color = tokens.ink400,
                    maxLines = 1,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = intro.introducerName,
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (intro.introducerCell != null) {
                    Text(
                        text = intro.introducerCell,
                        style = AltusType.label,
                        color = tokens.ink400,
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.width(AltusDimens.space3))
            Text(
                text = intro.receivedOnLabel,
                style = AltusType.monoData,
                color = tokens.ink400,
                maxLines = 1,
            )
        }

        Spacer(Modifier.height(AltusDimens.space3))

        // Prospect — the door this reference opens.
        Text(
            text = "CAN INTRODUCE US TO",
            style = AltusType.caption,
            color = accent,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = intro.prospectCompany,
            style = AltusType.bodyStrong,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = prospectLine(intro),
            style = AltusType.label,
            color = tokens.ink400,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        if (intro.natureOfBusiness.isNotBlank()) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = intro.natureOfBusiness,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }

        // Meta chip row: reference source · category · salesperson.
        val chips = buildList {
            intro.referenceSource?.let { add(it to MetaTone.Sales) }
            intro.businessCategory?.let { add(it to MetaTone.Neutral) }
            intro.salesPerson?.let { add(it to MetaTone.Success) }
        }
        if (chips.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space3))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                chips.forEach { (label, tone) -> MetaChip(label = label, tone = tone) }
            }
        }

        if (intro.reminderLabel != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = "Reminder · ${intro.reminderLabel}",
                style = AltusType.label,
                color = tokens.warn.color,
                maxLines = 1,
            )
        }
    }
}

/** "Anita Rao · CFO" — prospect contact then designation, both optional. */
private fun prospectLine(intro: PeopleGivesIntroUi): String =
    listOfNotNull(
        intro.prospectName.takeIf { it.isNotBlank() && it != "—" },
        intro.designation,
    ).joinToString(" · ").ifBlank { "—" }

// ─── Meta chips (the web table's Badge, in the DS colour vocabulary) ─────────

private enum class MetaTone { Sales, Neutral, Success }

@Composable
private fun MetaChip(label: String, tone: MetaTone, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val (bg, fg) = when (tone) {
        MetaTone.Sales -> tokens.workspaces.sales.base.copy(alpha = 0.12f) to tokens.workspaces.sales.deep
        MetaTone.Neutral -> tokens.sunken to tokens.ink400
        MetaTone.Success -> tokens.success.wash to tokens.success.color
    }
    Text(
        text = label,
        style = AltusType.label,
        color = fg,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(bg)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

// ─── Degraded states ─────────────────────────────────────────────────────────

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
            text = "Couldn't refresh — showing the last synced network.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun PeopleGivesLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
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
private fun PeopleGivesSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space5,
            ),
    ) {
        // Search field silhouette.
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(52.dp))
        Spacer(Modifier.height(AltusDimens.cardGap))

        // Category chip row.
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            repeat(4) { SkeletonBox(modifier = Modifier.width(76.dp).height(36.dp)) }
        }
        Spacer(Modifier.height(AltusDimens.space5))

        // Intro cards.
        repeat(4) {
            SkeletonBox(modifier = Modifier.fillMaxWidth().height(150.dp))
            Spacer(Modifier.height(AltusDimens.cardGap))
        }
        // A trailing line so the silhouette resolves like the real ledger.
        SkeletonLine(width = 140.dp, height = 12.dp)
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object PeopleGivesIcons {
    val ArrowLeft: ImageVector by lazy { lucide("PeopleGives.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

    /** lucide `search`. */
    val Search: ImageVector by lazy {
        lucide("PeopleGives.Search", "M21 21l-4.35-4.35", "M11 19a8 8 0 100-16 8 8 0 000 16z")
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
                stroke = SolidColor(Color.Black), // overridden by tint where used
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
