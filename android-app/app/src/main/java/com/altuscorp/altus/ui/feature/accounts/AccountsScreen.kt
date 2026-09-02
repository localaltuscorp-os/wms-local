@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.accounts

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
 * Admin · Accounts front door (read-only): one front door to every accounts
 * checklist, compliance tracker and master register — mirrored from the web
 * `/accounts` index (`ACCOUNTS_SECTIONS`) and rendered as a scannable list.
 *
 * Anatomy, top to bottom:
 *  1. An overview card — the Admin/Accounts eyebrow, the module tagline and
 *     three mono stats (live · built · sections), carrying the Accounts
 *     workspace keyline.
 *  2. A [SectionHeader] eyebrow with the section count.
 *  3. One inert card per section: a mono order badge, the title (+ a lock mark
 *     on restricted sections), the blurb and a status pill — Built / Live (both
 *     success green, the earned state) or a quiet Coming pill.
 *
 * Cache paints instantly; skeletons appear only on a true cold cache. Pull-to-
 * refresh reconciles.
 */
@Composable
fun AccountsScreen(
    onBack: () -> Unit,
    onOpenSection: (slug: String) -> Unit = {},
    viewModel: AccountsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    AccountsContent(state = state, onBack = onBack, onIntent = viewModel::onIntent, onOpenSection = onOpenSection)
}

@Composable
private fun AccountsContent(
    state: AccountsUiState,
    onBack: () -> Unit,
    onIntent: (AccountsIntent) -> Unit,
    onOpenSection: (slug: String) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Accounts",
            navigationIcon = AccountsIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> AccountsSkeleton()
            state.loadFailed && !state.hasContent -> AccountsLoadError(
                onRetry = { onIntent(AccountsIntent.Retry) },
            )
            else -> AccountsList(
                state = state,
                onRefresh = { onIntent(AccountsIntent.Refresh) },
                onOpenSection = onOpenSection,
            )
        }
    }
}

// ─── Loaded list ──────────────────────────────────────────────────────────────

/** Sections that have a native detail screen today (the rest stay inert). */
private val NAVIGABLE_SECTIONS = setOf(
    "due-dates",
    "vasa-family-interpersonal",
    "shares-register",
    "income-tax-master-folder",
    "sip-tracker",
    "bank-balance",
    "fno-income",
    "cash-withdrawal",
    "weekly-checklist",
    "monthly-quarterly-annual",
    "cc-tracker",
    "ca-handover",
)

@Composable
private fun AccountsList(
    state: AccountsUiState,
    onRefresh: () -> Unit,
    onOpenSection: (slug: String) -> Unit,
) {
    val pullState = rememberPullToRefreshState()

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
            verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            item(key = "overview", contentType = "overview") {
                OverviewCard(
                    state = state,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale-banner", contentType = "stale-banner") {
                    StaleBanner(modifier = Modifier.padding(horizontal = AltusDimens.screenGutter))
                }
            }

            item(key = "list-header", contentType = "section-header") {
                SectionHeader(
                    title = "Sections",
                    count = "${state.totalCount}",
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            if (state.sections.isEmpty()) {
                item(key = "empty", contentType = "empty") {
                    EmptyState(
                        headline = "No sections yet.",
                        body = "Accounts checklists and compliance trackers will appear here.",
                    )
                }
            } else {
                items(
                    items = state.sections,
                    key = { it.slug },
                    contentType = { "section" },
                ) { section ->
                    SectionCard(
                        section = section,
                        onOpen = if (section.slug in NAVIGABLE_SECTIONS) {
                            { onOpenSection(section.slug) }
                        } else {
                            null
                        },
                        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                    )
                }
            }
        }
    }
}

// ─── Overview card ────────────────────────────────────────────────────────────

@Composable
private fun OverviewCard(
    state: AccountsUiState,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = tokens.workspaces.accounts.base
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = accent,
    ) {
        // Eyebrow — Admin · Accounts, in the workspace accent.
        Text(
            text = "ADMIN · ACCOUNTS",
            style = AltusType.caption,
            color = accent,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = state.title.ifBlank { "Accounts" },
            style = AltusType.heading,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (state.tagline.isNotBlank()) {
            Spacer(Modifier.height(AltusDimens.space1))
            Text(
                text = state.tagline,
                style = AltusType.body,
                color = tokens.ink400,
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Row(modifier = Modifier.fillMaxWidth()) {
            OverviewStat(value = "${state.liveCount}", label = "Live", modifier = Modifier.weight(1f))
            OverviewStat(value = "${state.builtCount}", label = "Built", modifier = Modifier.weight(1f))
            OverviewStat(value = "${state.totalCount}", label = "Sections", modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun OverviewStat(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(modifier = modifier) {
        Text(
            text = value,
            style = AltusType.numeralStat,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Section card ─────────────────────────────────────────────────────────────

@Composable
private fun SectionCard(
    section: AccountsSectionRow,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        onClick = onOpen,
        accentKeyline = tokens.workspaces.accounts.base,
    ) {
        Row(verticalAlignment = Alignment.Top) {
            // Mono order badge — a sunken well, like the web index.
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(AltusShapeTokens.input)
                    .background(tokens.sunken),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = section.orderLabel,
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
            Spacer(Modifier.width(AltusDimens.space3))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = section.title,
                        style = AltusType.heading,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (section.sensitive) {
                        Spacer(Modifier.width(AltusDimens.space2))
                        Icon(
                            imageVector = AccountsIcons.Lock,
                            contentDescription = "Restricted",
                            tint = tokens.danger.color,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = section.blurb,
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(AltusDimens.space2))
                StatusChip(section = section)
            }
            if (onOpen != null) {
                Spacer(Modifier.width(AltusDimens.space2))
                Icon(
                    imageVector = AccountsIcons.ChevronRight,
                    contentDescription = null,
                    tint = tokens.ink400,
                    modifier = Modifier
                        .align(Alignment.CenterVertically)
                        .size(20.dp),
                )
            }
        }
    }
}

/**
 * The registry status pill: Built / Live earn the success wash (both are already
 * real, live surfaces on the web); Coming stays a quiet sunken pill on the ink
 * ladder — never a hex, always a theme token.
 */
@Composable
private fun StatusChip(
    section: AccountsSectionRow,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val earned = section.status != SectionStatus.Coming
    val fg = if (earned) tokens.success.color else tokens.ink400
    val bg = if (earned) tokens.success.wash else tokens.sunken
    Box(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(bg)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    ) {
        Text(
            text = section.statusLabel.uppercase(),
            style = AltusType.caption,
            color = fg,
            maxLines = 1,
        )
    }
}

// ─── Degraded states ──────────────────────────────────────────────────────────

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
            text = "Couldn't refresh — showing the last synced sections.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun AccountsLoadError(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        EmptyState(
            headline = "Couldn't load Accounts.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

// ─── Skeleton (exact resolved geometry) ──────────────────────────────────────

private const val SKELETON_CARDS = 6

@Composable
private fun AccountsSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        SkeletonBox(
            modifier = Modifier
                .padding(horizontal = AltusDimens.screenGutter)
                .fillMaxWidth()
                .height(140.dp),
        )
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
            SkeletonLine(width = 96.dp, height = 12.dp)
            Spacer(Modifier.weight(1f))
            SkeletonLine(width = 24.dp, height = 12.dp)
        }
        repeat(SKELETON_CARDS) {
            SkeletonBox(
                modifier = Modifier
                    .padding(horizontal = AltusDimens.screenGutter)
                    .fillMaxWidth()
                    .height(112.dp),
            )
        }
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object AccountsIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Accounts.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

    /** lucide `chevron-right` — the "opens a section" affordance. */
    val ChevronRight: ImageVector by lazy { lucide("Accounts.ChevronRight", "M9 18l6-6-6-6") }

    /** lucide `lock` — the restricted-section marker. */
    val Lock: ImageVector by lazy {
        lucide(
            "Accounts.Lock",
            "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2z",
            "M7 11V7a5 5 0 0 1 10 0v4",
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
                stroke = SolidColor(Color.Black), // overridden by Icon tint
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
