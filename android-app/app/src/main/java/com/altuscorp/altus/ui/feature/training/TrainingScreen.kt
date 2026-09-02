@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.training

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.LocalUriHandler
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
import com.altuscorp.altus.ui.designsystem.resolveStatusColor
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList

/**
 * TRAINING CENTRE (Training workspace) — the signed-in user's material library
 * plus their personalised induction path. A faithful mobile rendition of the web
 * `/training` page, narrowed to this one person:
 *
 *  1. A 1–2-up summary strip — watched-of-library, and (when they have one) the
 *     induction-path meter — carrying the Training workspace keyline.
 *  2. The user's induction path (when present): step rows with watch + test state.
 *  3. A facet row — subject chips + an "Induction" toggle (mirrors the web
 *     filters) — then the material library as full-bleed hairline rows: a leading
 *     glyph, subject + LOS + file, meta, and watched / induction / archived pills.
 *
 * A video material opens its link; a stored file is watched on the web (this
 * screen is read-only — material is authored and tests are taken there). Cache-
 * first (skeletons only on a true cold cache), evergreen pull-to-refresh, and a
 * calm full-screen retry that is never a dead end (Signature 8).
 */
@Composable
fun TrainingScreen(
    onBack: () -> Unit,
    viewModel: TrainingViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    TrainingContent(state = state, onBack = onBack, onIntent = viewModel::onIntent)
}

@Composable
private fun TrainingContent(
    state: TrainingUiState,
    onBack: () -> Unit,
    onIntent: (TrainingIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = "Training Centre",
            navigationIcon = TrainingIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> TrainingSkeleton()
            state.loadFailed && !state.hasContent -> TrainingLoadError(
                onRetry = { onIntent(TrainingIntent.Retry) },
            )
            else -> TrainingLoaded(state = state, onIntent = onIntent)
        }
    }
}

// ─── Loaded ──────────────────────────────────────────────────────────────────

@Composable
private fun TrainingLoaded(
    state: TrainingUiState,
    onIntent: (TrainingIntent) -> Unit,
) {
    val pullState = rememberPullToRefreshState()

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = { onIntent(TrainingIntent.Refresh) },
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
                        bottom = AltusDimens.space1,
                    ),
                )
            }

            item(key = "kpis", contentType = "kpis") {
                KpiStrip(
                    kpis = state.kpis,
                    modifier = Modifier.padding(
                        horizontal = AltusDimens.screenGutter,
                        vertical = AltusDimens.cardGap,
                    ),
                )
            }

            if (state.refreshFailed) {
                item(key = "stale-banner", contentType = "stale-banner") {
                    StaleBanner(
                        modifier = Modifier.padding(
                            start = AltusDimens.screenGutter,
                            end = AltusDimens.screenGutter,
                            top = AltusDimens.space1,
                        ),
                    )
                }
            }

            // ── Induction path ──
            if (state.hasInduction) {
                item(key = "induction-header", contentType = "section-header") {
                    SectionHeader(
                        title = "Your induction path",
                        count = state.induction.size.toString(),
                        modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                    )
                }
                items(
                    items = state.induction,
                    key = { "ind-${it.id}" },
                    contentType = { "induction-row" },
                ) { item ->
                    InductionRow(item = item)
                    HairlineDivider()
                }
            }

            // ── Material library ──
            item(key = "library-header", contentType = "section-header") {
                SectionHeader(
                    title = "Material library",
                    count = if (state.hasFilters) {
                        "${state.materials.size}/${state.totalMaterials}"
                    } else {
                        state.materials.size.toString()
                    },
                    modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.cardGap),
                )
            }

            item(key = "facets", contentType = "facets") {
                FacetRow(state = state, onIntent = onIntent)
            }

            if (state.materials.isEmpty()) {
                item(key = "library-empty", contentType = "empty") {
                    EmptyState(
                        headline = if (state.hasFilters) "No material matches." else "No material yet.",
                        body = if (state.hasFilters) {
                            "Try clearing a filter to see the rest of the library."
                        } else {
                            "Training material added on the web appears here."
                        },
                    )
                }
            } else {
                items(
                    items = state.materials,
                    key = { "mat-${it.id}" },
                    contentType = { "material-row" },
                ) { material ->
                    MaterialRow(material = material)
                    HairlineDivider()
                }
            }
        }
    }
}

// ─── Facet row (subject chips + induction toggle) ────────────────────────────

@Composable
private fun FacetRow(
    state: TrainingUiState,
    onIntent: (TrainingIntent) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space2,
                bottom = AltusDimens.space2,
            ),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        AltusChip(
            label = "All",
            selected = state.subjectFilter == null,
            onClick = { onIntent(TrainingIntent.SelectSubject(null)) },
        )
        state.subjects.forEach { subject ->
            AltusChip(
                label = subject,
                selected = state.subjectFilter == subject,
                onClick = {
                    onIntent(
                        TrainingIntent.SelectSubject(
                            if (state.subjectFilter == subject) null else subject,
                        ),
                    )
                },
            )
        }
        AltusChip(
            label = "Induction",
            selected = state.inductionOnly,
            onClick = { onIntent(TrainingIntent.ToggleInductionOnly) },
        )
    }
}

// ─── Summary strip ───────────────────────────────────────────────────────────

@Composable
private fun KpiStrip(
    kpis: ImmutableList<TrainingKpiUi>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        kpis.forEach { kpi ->
            KpiCard(kpi = kpi, modifier = Modifier.weight(1f))
        }
        if (kpis.size == 1) Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun KpiCard(kpi: TrainingKpiUi, modifier: Modifier = Modifier) {
    val accent = accentColor(kpi.accent)
    AltusCard(modifier = modifier, accentKeyline = accent) {
        Text(
            text = kpi.label.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
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
            color = AltusTheme.tokens.ink400,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (kpi.progress != null) {
            Spacer(Modifier.height(AltusDimens.space2))
            Meter(fraction = kpi.progress, color = accent)
        }
    }
}

/** The thin meter — sunken track, accent fill (min 2% so a nonzero reads). */
@Composable
private fun Meter(fraction: Float, color: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(AltusShapeTokens.pill)
            .background(AltusTheme.tokens.hairline),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0.02f, 1f))
                .height(6.dp)
                .clip(AltusShapeTokens.pill)
                .background(color),
        )
    }
}

// ─── Induction rows ──────────────────────────────────────────────────────────

@Composable
private fun InductionRow(item: TrainingInductionUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val uriHandler = LocalUriHandler.current
    val onOpen: (() -> Unit)? = item.videoUrl?.let { url -> { uriHandler.openUri(url) } }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onOpen != null) Modifier.clickableRow(onOpen) else Modifier)
            .heightIn(min = 64.dp)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphBadge(glyph = item.glyph)
        Spacer(Modifier.width(AltusDimens.space3))
        Column(Modifier.weight(1f)) {
            Text(
                text = item.title,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = item.statusLine,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        if (item.complete) {
            StatePill(label = "Complete", token = "green")
        } else {
            StatePill(label = "In progress", token = "amber")
        }
    }
}

// ─── Material rows ───────────────────────────────────────────────────────────

@Composable
private fun MaterialRow(material: TrainingMaterialUi, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val uriHandler = LocalUriHandler.current
    val onOpen: (() -> Unit)? = material.videoUrl?.let { url -> { uriHandler.openUri(url) } }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onOpen != null) Modifier.clickableRow(onOpen) else Modifier)
            .heightIn(min = 68.dp)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphBadge(glyph = material.glyph)
        Spacer(Modifier.width(AltusDimens.space3))
        Column(Modifier.weight(1f)) {
            Text(
                text = material.title,
                style = AltusType.bodyStrong,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (material.los != null) {
                Text(
                    text = material.los,
                    style = AltusType.label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = material.meta,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(AltusDimens.space3))
        Column(horizontalAlignment = Alignment.End) {
            when {
                material.archived -> StatePill(label = "Archived", token = "slate")
                material.watchedByMe -> StatePill(label = "Watched", token = "green")
                material.partOfInduction -> StatePill(label = "Induction", token = "purple")
                else -> Text(
                    text = material.fileLabel,
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** A small tinted leading glyph badge — video / pdf in Training accent, xls in
 *  success green, doc in ink (mirrors the web MaterialsTable icon colours). */
@Composable
private fun GlyphBadge(glyph: TrainingGlyph, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val tint = when (glyph) {
        TrainingGlyph.Video, TrainingGlyph.Pdf -> tokens.workspaces.training.base
        TrainingGlyph.Xls -> tokens.success.color
        TrainingGlyph.Doc -> tokens.ink400
    }
    val icon = when (glyph) {
        TrainingGlyph.Video -> TrainingIcons.Film
        TrainingGlyph.Pdf -> TrainingIcons.FileText
        TrainingGlyph.Xls -> TrainingIcons.Table
        TrainingGlyph.Doc -> TrainingIcons.FileText
    }
    Box(
        modifier = modifier
            .size(38.dp)
            .clip(AltusShapeTokens.input)
            .background(tint.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(19.dp),
        )
    }
}

/** A small status pill mapped through the DS colour vocabulary. */
@Composable
private fun StatePill(label: String, token: String) {
    val semantic = resolveStatusColor(token)
    Text(
        text = label,
        style = AltusType.label,
        color = semantic.color,
        maxLines = 1,
        modifier = Modifier
            .clip(AltusShapeTokens.pill)
            .background(semantic.wash)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
    )
}

@Composable
private fun HairlineDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
        thickness = AltusDimens.hairline,
        color = AltusTheme.tokens.hairline,
    )
}

/** Row-level press affordance with a ripple (list rows keep the ripple, per DS). */
private fun Modifier.clickableRow(onClick: () -> Unit): Modifier =
    this.clickable(onClickLabel = "Open", onClick = onClick)

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
            text = "Couldn't refresh — showing the last synced library.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

@Composable
private fun TrainingLoadError(onRetry: () -> Unit, modifier: Modifier = Modifier) {
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
private fun TrainingSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(top = AltusDimens.cardGap),
    ) {
        // Subtitle line.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter),
        ) {
            SkeletonLine(width = 240.dp, height = 12.dp)
        }

        Spacer(Modifier.height(AltusDimens.space4))

        // 2-up summary silhouette.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            SkeletonBox(modifier = Modifier.weight(1f).height(112.dp))
            SkeletonBox(modifier = Modifier.weight(1f).height(112.dp))
        }

        Spacer(Modifier.height(AltusDimens.space5))

        // Facet chips.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AltusDimens.screenGutter),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        ) {
            repeat(4) { SkeletonBox(modifier = Modifier.width(72.dp).height(36.dp)) }
        }

        Spacer(Modifier.height(AltusDimens.space4))

        // Material rows.
        repeat(6) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 68.dp)
                    .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SkeletonBox(modifier = Modifier.size(38.dp))
                Spacer(Modifier.width(AltusDimens.space3))
                Column(Modifier.weight(1f)) {
                    SkeletonLine(width = 168.dp)
                    Spacer(Modifier.height(AltusDimens.space1))
                    SkeletonLine(width = 108.dp, height = 10.dp)
                }
                Spacer(Modifier.width(AltusDimens.space3))
                SkeletonLine(width = 64.dp)
            }
        }
    }
}

// ─── Accent resolution (no hex in composables) ───────────────────────────────

@Composable
private fun accentColor(accent: TrainingAccent): Color {
    val tokens = AltusTheme.tokens
    return when (accent) {
        TrainingAccent.Training -> tokens.workspaces.training.base
        TrainingAccent.Success -> tokens.success.color
        TrainingAccent.Neutral -> tokens.ink400
    }
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object TrainingIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Training.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

    /** lucide `film`. */
    val Film: ImageVector by lazy {
        lucide(
            "Training.Film",
            "M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
            "M7 2v20",
            "M17 2v20",
            "M2 12h20",
            "M2 7h5",
            "M2 17h5",
            "M17 17h5",
            "M17 7h5",
        )
    }

    /** lucide `file-text`. */
    val FileText: ImageVector by lazy {
        lucide(
            "Training.FileText",
            "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
            "M14 2v5h5",
            "M10 9H8",
            "M16 13H8",
            "M16 17H8",
        )
    }

    /** lucide `table`. */
    val Table: ImageVector by lazy {
        lucide(
            "Training.Table",
            "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
            "M3 9h18",
            "M3 15h18",
            "M12 3v18",
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
