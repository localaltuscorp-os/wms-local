@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.profile

import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.core.firebase.BiometricAvailability
import com.altuscorp.altus.data.prefs.ThemeMode
import com.altuscorp.altus.ui.designsystem.AltusBottomSheet
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusDeepCard
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusSheetValue
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.rememberAltusSheetState
import com.altuscorp.altus.ui.designsystem.tapSettle
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

/**
 * S9 — Profile / You. The deep identity card + honest rhythm tiles + settings
 * ledger, ending in the danger sign-out row.
 *
 * Anatomy, top to bottom (§S9):
 *  1. **Identity card** — the one deep hero surface here: 56dp avatar, name,
 *     dept · email, a quiet ADMIN chip when applicable. Painted from the live
 *     `/me` snapshot with the cached identity as an instant fallback.
 *  2. **Rhythm strip** — three mono stat tiles (punch streak, today's DCC
 *     compliance, tasks closed this week). Zeros are shown as zeros; the streak
 *     tile earns the zest flame at ≥5 — the only zest outside the Day Seal.
 *  3. **Settings ledger** — appearance segmented control, the biometric-unlock
 *     toggle (gated on real hardware), notifications (→ system), about/version.
 *  4. **Sign out** — a danger row → confirm sheet whose button commit-morphs to
 *     a spinner through the teardown (DELETE register-push → clear caches →
 *     Firebase sign-out), then the [ProfileEvent.SignedOut] event pops to Login.
 *
 * Cache paints instantly; skeletons appear only on a true cold start and keep
 * the exact resolved geometry (Signature 8). Pull-to-refresh is evergreen with a
 * CLOCK_TICK when the pull arms (§S2/§1.6).
 */
@Composable
fun ProfileScreen(
    onSignedOut: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = currentHaptics()
    val currentOnSignedOut by rememberUpdatedState(onSignedOut)

    // One-shot effects (Part 6: effects ≠ state) — navigation + haptics only.
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                ProfileEvent.SignedOut -> currentOnSignedOut()
                ProfileEvent.BiometricEnabled -> haptics.commitTick()
                ProfileEvent.BiometricRejected -> haptics.gateUhUh()
            }
        }
    }

    ProfileContent(state = state, onIntent = viewModel::onIntent)
}

@Composable
private fun ProfileContent(
    state: ProfileUiState,
    onIntent: (ProfileIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens

    // Box root so the sign-out sheet overlays the ledger rather than stacking
    // below it (AltusBottomSheet fills its parent and draws its own scrim).
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(tokens.canvas),
        ) {
            AltusTopAppBar(title = "You")

            if (state.loading && !state.hasIdentity) {
                ProfileSkeleton()
            } else {
                ProfileLedger(state = state, onIntent = onIntent)
            }
        }

        if (state.signOutSheetVisible) {
            SignOutSheet(
                signingOut = state.signingOut,
                onConfirm = { onIntent(ProfileIntent.ConfirmSignOut) },
                onDismiss = { onIntent(ProfileIntent.DismissSignOut) },
            )
        }
    }
}

// ─── Loaded ledger ────────────────────────────────────────────────────────────

@Composable
private fun ProfileLedger(
    state: ProfileUiState,
    onIntent: (ProfileIntent) -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    val haptics = currentHaptics()

    // CLOCK_TICK the moment the pull crosses the arm threshold (§1.6).
    LaunchedEffect(pullState, haptics) {
        snapshotFlow { pullState.distanceFraction >= 1f }
            .distinctUntilChanged()
            .filter { it }
            .collect { haptics.clockTick() }
    }

    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = { onIntent(ProfileIntent.Refresh) },
        state = pullState,
        modifier = Modifier.fillMaxSize(),
        indicator = {
            PullToRefreshDefaults.Indicator(
                state = pullState,
                isRefreshing = state.refreshing,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = AltusTheme.tokens.raised,
                color = MaterialTheme.colorScheme.primary,
            )
        },
    ) {
        // No horizontal contentPadding: SectionHeader owns its own gutter, so
        // content items apply the screen gutter themselves (matches S2/history).
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = AltusDimens.cardGap,
                bottom = AltusDimens.space8,
            ),
        ) {
            item(key = "identity", contentType = "identity") {
                IdentityCard(
                    state = state,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            item(key = "rhythm-header", contentType = "section-header") {
                SectionHeader(
                    title = "Rhythm",
                    modifier = Modifier.padding(
                        top = AltusDimens.sectionGap - AltusDimens.cardGap,
                    ),
                )
            }
            item(key = "rhythm", contentType = "rhythm") {
                RhythmStrip(
                    state = state,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            item(key = "settings-header", contentType = "section-header") {
                SectionHeader(
                    title = "Settings",
                    modifier = Modifier.padding(
                        top = AltusDimens.sectionGap - AltusDimens.cardGap,
                    ),
                )
            }
            item(key = "settings", contentType = "settings") {
                SettingsLedger(
                    state = state,
                    onIntent = onIntent,
                    modifier = Modifier.padding(horizontal = AltusDimens.screenGutter),
                )
            }

            item(key = "sign-out", contentType = "sign-out") {
                SignOutRow(
                    modifier = Modifier.padding(
                        start = AltusDimens.screenGutter,
                        end = AltusDimens.screenGutter,
                        top = AltusDimens.sectionGap - AltusDimens.cardGap,
                    ),
                    onClick = { onIntent(ProfileIntent.RequestSignOut) },
                )
            }
        }
    }
}

// ─── Identity card (the one deep hero surface here) ──────────────────────────

@Composable
private fun IdentityCard(
    state: ProfileUiState,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusDeepCard(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(
                name = state.name,
                imageUrl = state.avatarUrl,
                size = 56.dp,
            )
            Spacer(Modifier.width(AltusDimens.space4))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = state.name.ifBlank { "—" },
                        style = AltusType.title2,
                        color = tokens.onDeep,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (state.isAdmin) {
                        Spacer(Modifier.width(AltusDimens.space2))
                        AdminChip()
                    }
                }
                val department = state.department
                if (!department.isNullOrBlank()) {
                    Spacer(Modifier.height(AltusDimens.space1))
                    Text(
                        text = department,
                        style = AltusType.label,
                        color = tokens.onDeepSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = state.email,
                    style = AltusType.monoData,
                    color = tokens.onDeepSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Quiet "ADMIN" caption chip — a low-alpha wash on the deep bed, never zest. */
@Composable
private fun AdminChip(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(tokens.onDeep.copy(alpha = 0.14f))
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    ) {
        Text(
            text = "ADMIN",
            style = AltusType.caption,
            color = tokens.onDeep,
        )
    }
}

// ─── Rhythm strip (three honest stat tiles) ──────────────────────────────────

@Composable
private fun RhythmStrip(
    state: ProfileUiState,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        StatTile(
            eyebrow = "Streak",
            value = "${state.punchStreak}",
            suffix = if (state.punchStreak == 1) "day" else "days",
            meta = "days present",
            flame = state.streakEarnsFlame,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            eyebrow = "Compliance",
            value = "${state.dccPct}",
            suffix = "%",
            meta = "${state.dccFilled}/${state.dccDue} today",
            flame = false,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            eyebrow = "Closed",
            value = "${state.tasksClosedThisWeek}",
            suffix = null,
            meta = "this week",
            flame = false,
            modifier = Modifier.weight(1f),
        )
    }
}

/**
 * S2 stat-card grammar: caption eyebrow, `numeral-stat` mono count with a quiet
 * mono suffix, quiet meta. The streak tile lights the zest flame at [flame].
 */
@Composable
private fun StatTile(
    eyebrow: String,
    value: String,
    suffix: String?,
    meta: String,
    flame: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = eyebrow.uppercase(),
                style = AltusType.caption,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (flame) {
                Spacer(Modifier.width(AltusDimens.space1))
                Icon(
                    imageVector = ProfileIcons.Flame,
                    contentDescription = "On a streak",
                    tint = tokens.zest,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space2))
        Row {
            Text(
                text = value,
                style = AltusType.numeralStat,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.alignByBaseline(),
            )
            if (suffix != null) {
                Text(
                    text = suffix,
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    modifier = Modifier
                        .alignByBaseline()
                        .padding(start = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = meta,
            style = AltusType.label,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Settings ledger ──────────────────────────────────────────────────────────

@Composable
private fun SettingsLedger(
    state: ProfileUiState,
    onIntent: (ProfileIntent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()
    val context = LocalContext.current
    val activity = remember(context) { context.findFragmentActivity() }

    // AltusCard padding = 0 so rows run edge-to-edge with indented hairlines.
    AltusCard(modifier = modifier.fillMaxWidth(), padding = 0.dp) {
        // Appearance — a labelled block with a full-width segmented control so it
        // never truncates at fontScale 1.3x (§1.2).
        Column(
            modifier = Modifier.padding(
                horizontal = AltusDimens.space4,
                vertical = AltusDimens.space3,
            ),
        ) {
            Text(
                text = "Appearance",
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(AltusDimens.space3))
            ThemeSegmented(
                selected = state.themeMode,
                onSelect = { mode ->
                    if (mode != state.themeMode) haptics.commitTick()
                    onIntent(ProfileIntent.SelectTheme(mode))
                },
            )
        }

        LedgerDivider()

        // Biometric unlock.
        SettingRow(
            title = "Biometric unlock",
            subtitle = biometricSubtitle(state.biometricAvailability, state.biometricEnabled),
            leadingIcon = ProfileIcons.Fingerprint,
        ) {
            Switch(
                checked = state.biometricEnabled,
                onCheckedChange = { checked ->
                    activity?.let { onIntent(ProfileIntent.SetBiometric(checked, it)) }
                },
                enabled = state.biometricToggleEnabled && activity != null,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                    uncheckedTrackColor = tokens.sunken,
                    uncheckedBorderColor = tokens.hairline,
                ),
            )
        }

        LedgerDivider()

        // Notifications → system app-notification settings.
        SettingRow(
            title = "Notifications",
            subtitle = "Manage in system settings",
            leadingIcon = ProfileIcons.Bell,
            onClick = {
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                context.startActivity(intent)
            },
        ) {
            Icon(
                imageVector = ProfileIcons.ChevronRight,
                contentDescription = null,
                tint = tokens.ink400,
                modifier = Modifier.size(20.dp),
            )
        }

        LedgerDivider()

        // About / version.
        SettingRow(
            title = "Version",
            subtitle = null,
            leadingIcon = ProfileIcons.Info,
        ) {
            Text(
                text = state.version,
                style = AltusType.monoData,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

/**
 * One 48dp+ hairline setting row: optional leading glyph, title + optional
 * subtitle, a trailing control ([trailing]). `heightIn` (not a fixed height)
 * keeps fontScale 1.3x from truncating; the whole row is pressable when
 * [onClick] is non-null (ripple kept — it is a row, not a card).
 */
@Composable
private fun SettingRow(
    title: String,
    subtitle: String?,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailing: @Composable () -> Unit,
) {
    val tokens = AltusTheme.tokens
    val rowModifier = if (onClick != null) {
        modifier.tapSettleClickable(withRipple = true, role = Role.Button, onClick = onClick)
    } else {
        modifier
    }
    Row(
        modifier = rowModifier
            .fillMaxWidth()
            .heightIn(min = AltusDimens.touchMin)
            .padding(
                horizontal = AltusDimens.space4,
                vertical = AltusDimens.space3,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = leadingIcon,
            contentDescription = null,
            tint = tokens.ink400,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(AltusDimens.space3))
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = AltusType.label,
                    color = tokens.ink400,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(AltusDimens.space3))
        trailing()
    }
}

/** Indented hairline between ledger rows (§1.4 borders do separation). */
@Composable
private fun LedgerDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(start = AltusDimens.space4),
        thickness = AltusDimens.hairline,
        color = AltusTheme.tokens.hairline,
    )
}

/** Light / Dark / System segmented control on a sunken bed. */
@Composable
private fun ThemeSegmented(
    selected: ThemeMode,
    onSelect: (ThemeMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.sunken)
            .padding(AltusDimens.space1),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        THEME_ORDER.forEach { option ->
            ThemeSegment(
                label = option.label,
                selected = option.mode == selected,
                onClick = { onSelect(option.mode) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ThemeSegment(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = AltusTheme.tokens
    val container = if (selected) scheme.primaryContainer else Color.Transparent
    val content = if (selected) scheme.onPrimaryContainer else tokens.ink400

    Box(
        modifier = modifier
            .heightIn(min = 40.dp)
            .clip(AltusShapeTokens.chip)
            .background(container)
            .tapSettleClickable(
                withRipple = false,
                role = Role.RadioButton,
                onClickLabel = label,
                onClick = onClick,
            )
            .padding(vertical = AltusDimens.space2),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = AltusType.label,
            color = content,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

/** The danger row that opens the confirm sheet (§S9). */
@Composable
private fun SignOutRow(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        onClick = onClick,
        padding = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = AltusDimens.touchMin)
                .padding(
                    horizontal = AltusDimens.space4,
                    vertical = AltusDimens.space3,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = ProfileIcons.LogOut,
                contentDescription = null,
                tint = tokens.danger.color,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Text(
                text = "Sign out",
                style = AltusType.bodyStrong,
                color = tokens.danger.color,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/**
 * Sign-out confirm sheet (Part 3 rule 3: a mutating ≤1-decision action is a
 * sheet, never a screen). The confirm button commit-morphs to a spinner through
 * the teardown; the [ProfileEvent.SignedOut] event pops the screen away, which
 * disposes this sheet.
 */
@Composable
private fun SignOutSheet(
    signingOut: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    // Half-detent sheet; block scrim-dismiss while the teardown is running so a
    // stray tap can't orphan the sign-out mid-flight.
    val sheetState = rememberAltusSheetState(
        initialTarget = AltusSheetValue.Half,
        confirmValueChange = { target -> !(signingOut && target == AltusSheetValue.Hidden) },
    )

    AltusBottomSheet(
        state = sheetState,
        onDismissRequest = onDismiss,
        halfFraction = 0.42f,
    ) {
        Column(
            modifier = Modifier.padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.space4,
                bottom = AltusDimens.space6,
            ),
        ) {
            Text(
                text = "Sign out?",
                style = AltusType.title2,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = "You'll need to sign in again next time. Any pending changes finish syncing first.",
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(AltusDimens.space6))
            DangerButton(
                text = "Sign out",
                loading = signingOut,
                onClick = onConfirm,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(AltusDimens.space3))
            AltusGhostButton(
                text = "Cancel",
                onClick = onDismiss,
                enabled = !signingOut,
                fillMaxWidth = true,
                contentColor = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * The destructive twin of `AltusPrimaryButton`: a 56dp filled danger pill whose
 * label commit-morphs to an inline spinner while [loading], holding full width
 * (it always `fillMaxWidth`s, so no measured-width pin is needed).
 */
@Composable
private fun DangerButton(
    text: String,
    loading: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val container = if (pressed) tokens.danger.color.copy(alpha = 0.88f) else tokens.danger.color

    Box(
        modifier = modifier
            .tapSettle(interactionSource, enabled = !loading)
            .fillMaxWidth()
            .height(AltusDimens.actionPrimary)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .tapSettleClickableProxy(interactionSource, enabled = !loading, onClick = onClick)
            .padding(horizontal = AltusDimens.space6),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = loading,
            transitionSpec = { fadeIn(tween(150)) togetherWith fadeOut(tween(100)) },
            label = "DangerButtonCommitMorph",
        ) { isLoading ->
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    color = scheme.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else {
                Text(
                    text = text,
                    style = AltusType.bodyStrong,
                    color = scheme.onPrimary,
                )
            }
        }
    }
}

/** Clickable bound to the SAME interaction source that drives [tapSettle]. */
@Composable
private fun Modifier.tapSettleClickableProxy(
    interactionSource: MutableInteractionSource,
    enabled: Boolean,
    onClick: () -> Unit,
): Modifier = this.clickable(
    interactionSource = interactionSource,
    indication = androidx.compose.material3.ripple(),
    enabled = enabled,
    role = Role.Button,
    onClick = onClick,
)

// ─── Skeleton (Signature 8: exact resolved geometry) ─────────────────────────

@Composable
private fun ProfileSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(
                start = AltusDimens.screenGutter,
                end = AltusDimens.screenGutter,
                top = AltusDimens.cardGap,
            ),
    ) {
        // Identity card silhouette — avatar + two lines.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(96.dp),
            shape = AltusShapeTokens.hero,
        )

        Spacer(Modifier.height(AltusDimens.sectionGap - AltusDimens.cardGap))
        SkeletonLine(width = 96.dp, height = 12.dp)
        Spacer(Modifier.height(AltusDimens.space3))

        // Three stat tiles.
        Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap)) {
            repeat(3) {
                SkeletonBox(
                    modifier = Modifier
                        .weight(1f)
                        .height(104.dp),
                )
            }
        }

        Spacer(Modifier.height(AltusDimens.sectionGap - AltusDimens.cardGap))
        SkeletonLine(width = 96.dp, height = 12.dp)
        Spacer(Modifier.height(AltusDimens.space3))

        // Settings ledger.
        SkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .height(232.dp),
        )
    }
}

// ─── Copy helpers ─────────────────────────────────────────────────────────────

private fun biometricSubtitle(
    availability: BiometricAvailability,
    enabled: Boolean,
): String = when {
    enabled -> "On — unlock with your fingerprint"
    availability == BiometricAvailability.Available -> "Unlock with your fingerprint"
    availability == BiometricAvailability.NotEnrolled -> "No fingerprint enrolled on this device"
    availability == BiometricAvailability.NoHardware -> "No biometric hardware"
    availability == BiometricAvailability.TemporarilyUnavailable -> "Sensor unavailable right now"
    else -> "Not supported on this device"
}

private data class ThemeOption(val mode: ThemeMode, val label: String)

private val THEME_ORDER = listOf(
    ThemeOption(ThemeMode.LIGHT, "Light"),
    ThemeOption(ThemeMode.DARK, "Dark"),
    ThemeOption(ThemeMode.SYSTEM, "System"),
)

/** Unwrap the Compose context chain to the biometric-hosting FragmentActivity. */
private tailrec fun Context.findFragmentActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.findFragmentActivity()
    else -> null
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object ProfileIcons {

    /** lucide `flame` — the ≥5-day streak zest glyph. */
    val Flame: ImageVector by lazy {
        lucide(
            "Profile.Flame",
            "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
        )
    }

    /** lucide `fingerprint` — the biometric row glyph. */
    val Fingerprint: ImageVector by lazy {
        lucide(
            "Profile.Fingerprint",
            "M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4",
            "M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2",
            "M17.29 21.02c.12-.6.43-2.3.5-3.02",
            "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
            "M8.65 22c.21-.66.45-1.32.57-2",
            "M14 13.12c0 2.38 0 6.38-1 8.88",
            "M2 16h.01",
            "M21.8 16c.2-2 .13-5.35 0-6",
            "M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2",
        )
    }

    /** lucide `bell` — notifications row glyph. */
    val Bell: ImageVector by lazy {
        lucide(
            "Profile.Bell",
            "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
            "M10.3 21a1.94 1.94 0 0 0 3.4 0",
        )
    }

    /** lucide `info` — the about row glyph. */
    val Info: ImageVector by lazy {
        lucide(
            "Profile.Info",
            "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0",
            "M12 16v-4",
            "M12 8h.01",
        )
    }

    /** lucide `chevron-right` — the drill affordance on the notifications row. */
    val ChevronRight: ImageVector by lazy {
        lucide("Profile.ChevronRight", "M9 18l6-6-6-6")
    }

    /** lucide `log-out` — the danger sign-out glyph. */
    val LogOut: ImageVector by lazy {
        lucide(
            "Profile.LogOut",
            "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
            "M16 17l5-5-5-5",
            "M21 12H9",
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
