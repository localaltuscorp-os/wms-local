package com.altuscorp.altus.ui.theme

import androidx.compose.ui.graphics.Color

// ─────────────────────────────────────────────────────────────────────────────
// Altus brand palette — faithful to the web app (wms.mananvasa.com).
// Brand = Altus red #E10600. Surfaces are LIGHT (warm paper + white), the way
// the web renders. Green is demoted to the "Done / success" semantic only.
//
// Token NAMES are kept from the original design system so every ColorScheme role
// and every screen re-skins from here without edits — only the values changed
// from evergreen-green → Altus red, dark → light-first.
// ─────────────────────────────────────────────────────────────────────────────

// ── LIGHT (the primary experience — matches the web) ──
val EvergreenLight = Color(0xFFE10600)          // primary — CTAs, active state, brand
val EvergreenPressedLight = Color(0xFFA80400)   // primary pressed (Altus red deep)
val MintLight = Color(0xFFFCE4E2)               // primaryContainer — selected chips, brand wash
val OnMintLight = Color(0xFF7A0402)             // onPrimaryContainer
val DeepLight = Color(0xFFB00400)               // hero bed — the web's red gradient cards
val OnDeepLight = Color(0xFFFFF5F4)             // primary text on the red hero
val OnDeepSecondaryLight = Color(0xFFF3B9B5)    // secondary text on the red hero
val ZestLight = Color(0xFFFFC94E)               // rare celebration accent (warm gold)
val CanvasLight = Color(0xFFF7F7F6)             // background — warm paper, never pure white
val SurfaceLight = Color(0xFFFFFFFF)            // cards
val SunkenLight = Color(0xFFF1F1EF)             // surfaceContainerLow — input wells, tray beds
val RaisedLight = Color(0xFFFFFFFF)             // surfaceContainerHigh — sheets, dialogs
val HairlineLight = Color(0xFFE7E5E2)           // outlineVariant — 1dp borders
val Ink900Light = Color(0xFF1A1614)             // onSurface — primary text
val Ink600Light = Color(0xFF57514E)             // onSurfaceVariant — secondary text
val Ink400Light = Color(0xFF857E7A)             // meta text (the text floor)
val Ink300Light = Color(0xFFB3ADA9)             // disabled/placeholder, non-text only
val SuccessLight = Color(0xFF16A34A)            // done / success — the demoted green
val SuccessWashLight = Color(0xFFE7F6EC)
val WarnLight = Color(0xFFB45309)
val WarnWashLight = Color(0xFFFBF0DD)
val DangerLight = Color(0xFFC81E1E)             // overdue / destructive (distinct deep red)
val DangerWashLight = Color(0xFFFBE7E7)
val InfoLight = Color(0xFF2563EB)
val InfoWashLight = Color(0xFFE6EDFD)
// Module accents — the web hub's per-workspace colours (distinct, vivid).
val AccentTasksLight = Color(0xFF3B5BDB)        // WMS
val AccentDccLight = Color(0xFF7048E8)          // DCC / Employees deep
val AccentAttendanceLight = Color(0xFF0CA678)   // Attendance
val AccentGoalsLight = Color(0xFFE8590C)        // Goals / Sales
val AccentDashLight = Color(0xFFE10600)         // brand red

// ── Workspace hub colours (mirror lib/module-theme.ts MODULE_THEME) ──
// The seven front-door workspace cards. `base` is the card accent, `deep` the
// gradient end + text-on-tint. Mode-neutral: the same vivid brand colours read
// on both light and dark canvases (the web hub has no dark variant), so these
// feed both token sets. WMS keeps the Altus-red identity; Accounts inherits
// Admin's indigo (they read as one module).
val WsWms = Color(0xFFE10600)
val WsWmsDeep = Color(0xFFA80400)
val WsAdmin = Color(0xFF4F46E5)
val WsAdminDeep = Color(0xFF3730A3)
val WsEmployees = Color(0xFF16A34A)
val WsEmployeesDeep = Color(0xFF15803D)
val WsSales = Color(0xFF7C3AED)
val WsSalesDeep = Color(0xFF5B21B6)
val WsMarketing = Color(0xFFEA7A17)
val WsMarketingDeep = Color(0xFFC2620F)
val WsTraining = Color(0xFF2563EB)
val WsTrainingDeep = Color(0xFF1D4ED8)

val ShadowInk = Color(0xFF3A1512)

// ── DARK (kept for system-dark phones; still Altus-red-branded) ──
val CanvasDark = Color(0xFF14100F)              // background (L0)
val SurfaceDark = Color(0xFF1E1817)             // cards (L1)
val SunkenDark = Color(0xFF191413)              // surfaceContainerLow
val RaisedDark = Color(0xFF261F1D)              // surfaceContainerHigh — sheets (L2)
val TopMostDark = Color(0xFF2E2523)             // menus/dialogs (L3)
val EvergreenDark = Color(0xFFFF6B62)           // primary (lightened red for dark)
val EvergreenPressedDark = Color(0xFFF5564C)    // primary pressed
val MintDark = Color(0xFF4A1512)                // primaryContainer
val OnMintDark = Color(0xFFFFD9D5)              // onPrimaryContainer
val OnEvergreenDark = Color(0xFF3A0100)         // text/icons on the dark-mode primary
val DeepDark = Color(0xFF5A0E0A)
val OnDeepDark = Color(0xFFFFECEA)
val OnDeepSecondaryDark = Color(0xFFD9A9A5)
val ZestDark = Color(0xFFFFD36B)
val Ink900Dark = Color(0xFFF2EAE8)             // onSurface
val Ink600Dark = Color(0xFFB6ABA8)             // onSurfaceVariant
val Ink400Dark = Color(0xFF8A7F7C)             // tertiary / meta floor
val Ink300Dark = Color(0xFF635A57)             // disabled/placeholder
val HairlineDark = Color(0xFF352C2A)           // outlineVariant
val SuccessDark = Color(0xFF4CC47A)
val SuccessWashDark = Color(0xFF16321F)
val WarnDark = Color(0xFFE0A94E)
val WarnWashDark = Color(0xFF3A2F1B)
val DangerDark = Color(0xFFF07070)
val DangerWashDark = Color(0xFF3A1B1B)
val InfoDark = Color(0xFF8AAEE0)
val InfoWashDark = Color(0xFF1E2A3A)
val AccentTasksDark = Color(0xFF7C93F0)
val AccentDccDark = Color(0xFFA98BF0)
val AccentAttendanceDark = Color(0xFF4CC49E)
val AccentGoalsDark = Color(0xFFF0864C)
val AccentDashDark = Color(0xFFFF6B62)
val OnPrimary = Color(0xFFFFFFFF)
