package com.altuscorp.altus.feature.hub

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AuroraBackground
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusTokens
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.WorkspaceAccent
import com.altuscorp.altus.ui.theme.ambientShadow

/**
 * THE HUB — the app's front door and home tab (mirrors the web `/hub`).
 *
 * A launcher grid of the seven workspace cards. Each card is a SOLID module
 * colour (the one place vivid module colour becomes a full fill, §1.1) reading
 * `AltusTheme.tokens.workspaces`, carrying the workspace's label, a one-line
 * tagline and an "Enter workspace" chip. Tapping a card raises
 * [onOpenWorkspace]; the NavHost maps the workspace to its landing screen
 * (WMS → the daily loop, Employees → attendance, the rest → their per-workspace
 * module list). The screen is a dumb render of an [Immutable] [HubUiState].
 */
@Composable
fun HubScreen(
    onOpenWorkspace: (HubWorkspace) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HubViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HubContent(state = state, onOpenWorkspace = onOpenWorkspace, modifier = modifier)
}

@Composable
private fun HubContent(
    state: HubUiState,
    onOpenWorkspace: (HubWorkspace) -> Unit,
    modifier: Modifier = Modifier,
) {
    val statusInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

    Box(modifier = modifier.fillMaxSize()) {
    AuroraBackground(Modifier.fillMaxSize())
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AltusDimens.screenGutter,
            end = AltusDimens.screenGutter,
            top = statusInset + AltusDimens.space4,
            bottom = AltusDimens.space12,
        ),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        item(
            span = { GridItemSpan(maxLineSpan) },
            key = "hub-header",
            contentType = "header",
        ) {
            HubHeader(greetingName = state.greetingName)
        }

        items(
            items = HubWorkspace.entries.filter { it != HubWorkspace.Accounts },
            key = { it.slug },
            contentType = { "workspace" },
        ) { workspace ->
            WorkspaceCard(
                workspace = workspace,
                onClick = { onOpenWorkspace(workspace) },
            )
        }
    }
    }
}

// ─── Header ──────────────────────────────────────────────────────────────────

@Composable
private fun HubHeader(greetingName: String, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = AltusDimens.space4),
    ) {
        Text(
            text = "ALTUS / WORKSPACES",
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = if (greetingName.isBlank()) "Welcome back" else "Welcome back, $greetingName",
            style = AltusType.display,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = "Choose your workspace to get started",
            style = AltusType.body,
            color = tokens.ink400,
        )
    }
}

// ─── Workspace card ──────────────────────────────────────────────────────────

/**
 * One solid-colour workspace card: a base→deep diagonal gradient bed with a
 * translucent glyph chip, the workspace label, its tagline, and an "Enter
 * workspace" pill. `tap-settle` press physics and the ambient lift come from the
 * shared modifiers; content is always white on the vivid fill.
 */
@Composable
private fun WorkspaceCard(
    workspace: HubWorkspace,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = workspace.accent(AltusTheme.tokens)
    val shape = AltusShapeTokens.hero

    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = CARD_HEIGHT)
            .tapSettleClickable(withRipple = false, onClickLabel = "Open ${workspace.label}", onClick = onClick)
            .ambientShadow(shape)
            .clip(shape)
            .background(Brush.linearGradient(listOf(accent.base, accent.deep)))
            .padding(AltusDimens.space4),
    ) {
        Box(
            modifier = Modifier
                .size(GLYPH_CONTAINER)
                .clip(AltusShapeTokens.input)
                .background(Color.White.copy(alpha = GLYPH_TINT_ALPHA)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = workspace.glyph(),
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(GLYPH_ICON),
            )
        }

        Spacer(Modifier.weight(1f))

        Text(
            text = workspace.label,
            style = AltusType.title2,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = workspace.tagline,
            style = AltusType.label,
            color = Color.White.copy(alpha = 0.90f),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space3))
        EnterPill(accent = accent)
    }
}

/** The white "Enter workspace →" affordance, text tinted the card's deep accent. */
@Composable
private fun EnterPill(accent: WorkspaceAccent, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(Color.White)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        Text(
            text = "Enter",
            style = AltusType.label,
            fontWeight = FontWeight.SemiBold,
            color = accent.deep,
        )
        Icon(
            imageVector = HubIcons.ArrowRight,
            contentDescription = null,
            tint = accent.deep,
            modifier = Modifier.size(14.dp),
        )
    }
}

// ─── Workspace identity (mirror of lib/workspaces.ts + lib/module-theme.ts) ──

/**
 * The seven front-door workspaces, in hub display order. Slug, label and tagline
 * mirror `WORKSPACE_LABEL` + `MODULE_THEME`; the colour is resolved from
 * [AltusTokens.workspaces] (never a raw hex). The NavHost owns the slug →
 * landing-route mapping.
 */
enum class HubWorkspace(val slug: String, val label: String, val tagline: String) {
    // Mirrors the web hub's SIX workspace cards, in order. Accounts is NOT a
    // top-level card — it lives inside Admin (the web Admin card → Accounts).
    Wms("wms", "WMS", "The work dashboard — tasks, goals & the daily loop."),
    Admin("admin", "Admin", "Accounts, compliance & the control room."),
    Employees("employees", "Employees", "Attendance, leave, salary & the team roster."),
    Sales("sales", "Sales", "Collections, references & breakthroughs."),
    Marketing("marketing", "Marketing", "Campaigns, reach & lead generation."),
    Training("training", "Training", "Material library, tests, induction & feedback."),
    Accounts("accounts", "Accounts", "Compliance, checklists & master registers.");

    fun accent(tokens: AltusTokens): WorkspaceAccent = when (this) {
        Wms -> tokens.workspaces.wms
        Employees -> tokens.workspaces.employees
        Sales -> tokens.workspaces.sales
        Marketing -> tokens.workspaces.marketing
        Training -> tokens.workspaces.training
        Admin -> tokens.workspaces.admin
        Accounts -> tokens.workspaces.accounts
    }

    fun glyph(): ImageVector = when (this) {
        Wms -> HubIcons.LayoutGrid
        Employees -> HubIcons.Users
        Sales -> HubIcons.TrendingUp
        Marketing -> HubIcons.Megaphone
        Training -> HubIcons.GraduationCap
        Admin -> HubIcons.ShieldCheck
        Accounts -> HubIcons.ShieldCheck
    }

    companion object {
        fun fromSlug(slug: String?): HubWorkspace? = entries.firstOrNull { it.slug == slug }
    }
}

// ─── Dimensions ───────────────────────────────────────────────────────────────

private val CARD_HEIGHT = 168.dp
private val GLYPH_CONTAINER = 44.dp
private val GLYPH_ICON = 24.dp
private const val GLYPH_TINT_ALPHA = 0.20f

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object HubIcons {

    /** lucide `arrow-right`. */
    val ArrowRight: ImageVector by lazy {
        lucide("Hub.ArrowRight", "M5 12h14", "M12 5l7 7-7 7")
    }

    /** lucide `layout-grid` (WMS). */
    val LayoutGrid: ImageVector by lazy {
        lucide("Hub.LayoutGrid", "M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z")
    }

    /** lucide `users` (Employees). */
    val Users: ImageVector by lazy {
        lucide(
            "Hub.Users",
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            "M16 3.13a4 4 0 0 1 0 7.75",
        )
    }

    /** lucide `trending-up` (Sales). */
    val TrendingUp: ImageVector by lazy {
        lucide("Hub.TrendingUp", "M22 7l-8.5 8.5-5-5L2 17", "M16 7h6v6")
    }

    /** lucide `megaphone` (Marketing). */
    val Megaphone: ImageVector by lazy {
        lucide(
            "Hub.Megaphone",
            "M3 11l18-5v12L3 14v-3z",
            "M11.6 16.8a3 3 0 1 1-5.8-1.6",
        )
    }

    /** lucide `graduation-cap` (Training). */
    val GraduationCap: ImageVector by lazy {
        lucide(
            "Hub.GraduationCap",
            "M22 10L12 5 2 10l10 5 10-5z",
            "M6 12v5c0 1 2 3 6 3s6-2 6-3v-5",
        )
    }

    /** lucide `shield-check` (Accounts / Admin). */
    val ShieldCheck: ImageVector by lazy {
        lucide(
            "Hub.ShieldCheck",
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "M9 12l2 2 4-4",
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
                stroke = SolidColor(Color.Black), // always overridden by Icon tint
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
