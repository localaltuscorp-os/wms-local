package com.altuscorp.altus.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme

/**
 * AltusLight / AltusDark — the two M3 [ColorScheme]s (§1.1), mapping the raw
 * tokens in Color.kt onto Material roles so every stock component is on-brand.
 *
 * Everything M3 has no role for (deep, zest, module accents, washes, ink
 * ladder) lives in [AltusTokens] instead.
 */

val AltusLightColorScheme: ColorScheme = lightColorScheme(
    primary = EvergreenLight,
    onPrimary = OnPrimary,
    primaryContainer = MintLight,
    onPrimaryContainer = OnMintLight,
    secondary = EvergreenLight,
    onSecondary = OnPrimary,
    secondaryContainer = MintLight,
    onSecondaryContainer = OnMintLight,
    tertiary = AccentDccLight,
    onTertiary = OnPrimary,
    background = CanvasLight,
    onBackground = Ink900Light,
    surface = SurfaceLight,
    onSurface = Ink900Light,
    surfaceVariant = SunkenLight,
    onSurfaceVariant = Ink600Light,
    surfaceContainerLowest = SurfaceLight,
    surfaceContainerLow = SunkenLight,
    surfaceContainer = CanvasLight,
    surfaceContainerHigh = RaisedLight,
    surfaceContainerHighest = RaisedLight,
    outline = Ink400Light,
    outlineVariant = HairlineLight,
    error = DangerLight,
    onError = OnPrimary,
    errorContainer = DangerWashLight,
    onErrorContainer = DangerLight,
    inverseSurface = DeepLight,
    inverseOnSurface = OnDeepLight,
    inversePrimary = EvergreenDark,
)

val AltusDarkColorScheme: ColorScheme = darkColorScheme(
    primary = EvergreenDark,
    onPrimary = OnEvergreenDark,
    primaryContainer = MintDark,
    onPrimaryContainer = OnMintDark,
    secondary = EvergreenDark,
    onSecondary = OnEvergreenDark,
    secondaryContainer = MintDark,
    onSecondaryContainer = OnMintDark,
    tertiary = AccentDccDark,
    onTertiary = OnEvergreenDark,
    background = CanvasDark,
    onBackground = Ink900Dark,
    surface = SurfaceDark,
    onSurface = Ink900Dark,
    surfaceVariant = SunkenDark,
    onSurfaceVariant = Ink600Dark,
    surfaceContainerLowest = CanvasDark,
    surfaceContainerLow = SunkenDark,
    surfaceContainer = SurfaceDark,
    surfaceContainerHigh = RaisedDark,
    surfaceContainerHighest = TopMostDark,
    outline = Ink400Dark,
    outlineVariant = HairlineDark,
    error = DangerDark,
    onError = DangerWashDark,
    errorContainer = DangerWashDark,
    onErrorContainer = DangerDark,
    inverseSurface = OnDeepDark,
    inverseOnSurface = DeepDark,
    inversePrimary = EvergreenLight,
)
