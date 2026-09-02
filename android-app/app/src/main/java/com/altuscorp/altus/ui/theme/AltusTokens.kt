package com.altuscorp.altus.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * Everything M3 has no role for (§1.1): the deep hero surface, zest, module
 * accents, the semantic four with washes, the extra ink steps, the explicit
 * surface ladder, and the motion token set.
 *
 * Read via [AltusTheme.tokens] — never a raw hex in a composable.
 */

/** Module accent set — 3dp keylines & 12%-alpha glyph tints only, never text, never fills. */
@Immutable
data class ModuleAccents(
    val tasks: Color,
    val dcc: Color,
    val attendance: Color,
    val goals: Color,
    val dash: Color,
)

/** One workspace's hub-card colour pair: [base] accent → [deep] gradient end. */
@Immutable
data class WorkspaceAccent(val base: Color, val deep: Color)

/**
 * The seven front-door workspace colours (mirror of the web hub's MODULE_THEME).
 * Solid-colour hub cards only — the one place vivid module colour becomes a full
 * fill; everywhere else the module accents stay 3dp keylines / 12% tints.
 */
@Immutable
data class WorkspaceAccents(
    val wms: WorkspaceAccent,
    val employees: WorkspaceAccent,
    val sales: WorkspaceAccent,
    val marketing: WorkspaceAccent,
    val training: WorkspaceAccent,
    val accounts: WorkspaceAccent,
    val admin: WorkspaceAccent,
)

/** A semantic role paired with its wash. */
@Immutable
data class SemanticColor(val color: Color, val wash: Color)

/** Everything M3 has no role for. */
@Immutable
data class AltusTokens(
    val isDark: Boolean,
    // Hero surface inside the current mode.
    val deep: Color,
    val onDeep: Color,
    val onDeepSecondary: Color,
    // Celebration only — never a control, never text, never persistent.
    val zest: Color,
    // Extra ink steps beyond onSurface/onSurfaceVariant.
    val ink400: Color,
    val ink300: Color,
    // Explicit surface ladder (dark elevation-by-lightness; light wells/sheets).
    val canvas: Color,
    val surface: Color,
    val sunken: Color,
    val raised: Color,
    val topMost: Color,
    val hairline: Color,
    val primaryPressed: Color,
    // Semantic four (M3 only carries error).
    val success: SemanticColor,
    val warn: SemanticColor,
    val danger: SemanticColor,
    val info: SemanticColor,
    // Module accents.
    val accents: ModuleAccents,
    // Workspace hub-card colours (the front-door launcher).
    val workspaces: WorkspaceAccents,
    // Motion token set (commit-morph et al.).
    val motion: AltusMotion,
)

/** Shared across both modes — the vivid brand colours read on any canvas. */
internal val HubWorkspaceAccents = WorkspaceAccents(
    wms = WorkspaceAccent(WsWms, WsWmsDeep),
    employees = WorkspaceAccent(WsEmployees, WsEmployeesDeep),
    sales = WorkspaceAccent(WsSales, WsSalesDeep),
    marketing = WorkspaceAccent(WsMarketing, WsMarketingDeep),
    training = WorkspaceAccent(WsTraining, WsTrainingDeep),
    accounts = WorkspaceAccent(WsAdmin, WsAdminDeep),
    admin = WorkspaceAccent(WsAdmin, WsAdminDeep),
)

internal val LightTokens = AltusTokens(
    isDark = false,
    deep = DeepLight,
    onDeep = OnDeepLight,
    onDeepSecondary = OnDeepSecondaryLight,
    zest = ZestLight,
    ink400 = Ink400Light,
    ink300 = Ink300Light,
    canvas = CanvasLight,
    surface = SurfaceLight,
    sunken = SunkenLight,
    raised = RaisedLight,
    topMost = RaisedLight,
    hairline = HairlineLight,
    primaryPressed = EvergreenPressedLight,
    success = SemanticColor(SuccessLight, SuccessWashLight),
    warn = SemanticColor(WarnLight, WarnWashLight),
    danger = SemanticColor(DangerLight, DangerWashLight),
    info = SemanticColor(InfoLight, InfoWashLight),
    accents = ModuleAccents(
        tasks = AccentTasksLight,
        dcc = AccentDccLight,
        attendance = AccentAttendanceLight,
        goals = AccentGoalsLight,
        dash = AccentDashLight,
    ),
    workspaces = HubWorkspaceAccents,
    motion = AltusMotion.Default,
)

internal val DarkTokens = AltusTokens(
    isDark = true,
    deep = DeepDark,
    onDeep = OnDeepDark,
    onDeepSecondary = OnDeepSecondaryDark,
    zest = ZestDark,
    ink400 = Ink400Dark,
    ink300 = Ink300Dark,
    canvas = CanvasDark,
    surface = SurfaceDark,
    sunken = SunkenDark,
    raised = RaisedDark,
    topMost = TopMostDark,
    hairline = HairlineDark,
    primaryPressed = EvergreenPressedDark,
    success = SemanticColor(SuccessDark, SuccessWashDark),
    warn = SemanticColor(WarnDark, WarnWashDark),
    danger = SemanticColor(DangerDark, DangerWashDark),
    info = SemanticColor(InfoDark, InfoWashDark),
    accents = ModuleAccents(
        tasks = AccentTasksDark,
        dcc = AccentDccDark,
        attendance = AccentAttendanceDark,
        goals = AccentGoalsDark,
        dash = AccentDashDark,
    ),
    workspaces = HubWorkspaceAccents,
    motion = AltusMotion.Default,
)
