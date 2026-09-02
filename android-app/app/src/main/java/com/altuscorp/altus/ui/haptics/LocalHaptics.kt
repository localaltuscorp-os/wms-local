package com.altuscorp.altus.ui.haptics

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalView

/**
 * CompositionLocal carrying the app's haptic vocabulary.
 *
 * Nullable default so previews and isolated component tests never crash;
 * production code reads through [currentHaptics], which lazily builds an
 * instance from [LocalView] when no provider is present.
 */
val LocalHaptics: ProvidableCompositionLocal<AltusHaptics?> =
    staticCompositionLocalOf { null }

/** Resolve the haptics vocabulary — provided instance or a view-scoped one. */
@Composable
fun currentHaptics(): AltusHaptics {
    val provided = LocalHaptics.current
    if (provided != null) return provided
    val view = LocalView.current
    return remember(view) { AltusHaptics(view) }
}

/** Wrap once near the root (inside AltusTheme) so all screens share one instance. */
@Composable
fun ProvideAltusHaptics(content: @Composable () -> Unit) {
    val view = LocalView.current
    val haptics = remember(view) { AltusHaptics(view) }
    CompositionLocalProvider(LocalHaptics provides haptics, content = content)
}
