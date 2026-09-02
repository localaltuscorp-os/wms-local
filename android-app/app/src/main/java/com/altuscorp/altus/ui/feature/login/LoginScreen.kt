package com.altuscorp.altus.feature.login

import android.content.Context
import android.content.ContextWrapper
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.grainOverlay
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.liftedShadow

/**
 * S1 Login — "the day, in order."
 *
 * Top 42%: the `deep` brand field + grain — wordmark small top-left in
 * `caption`, one `display` line. Lower 58%: the raised panel (20dp top radius)
 * sliding up out of the brand field with `sheet-rise`, hosting one of three
 * panes: the password form, the biometric returning-user unlock (the default
 * once a session + toggle exist), or the silent resume spinner.
 *
 * Continue's label commit-morphs to an inline spinner (width held) inside
 * [AltusPrimaryButton]. Every rejection fires the "uh-uh" double tick.
 */
@Composable
fun LoginScreen(
    onSignedIn: () -> Unit,
    onEnrollmentBlocked: (kind: String) -> Unit,
) {
    val viewModel: LoginViewModel = hiltViewModel()
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val haptics = currentHaptics()

    val context = LocalContext.current
    val activity = remember(context) { context.findFragmentActivity() }

    val currentOnSignedIn by rememberUpdatedState(onSignedIn)
    val currentOnEnrollmentBlocked by rememberUpdatedState(onEnrollmentBlocked)

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                LoginEvent.SignedIn -> currentOnSignedIn()
                is LoginEvent.EnrollmentBlocked -> currentOnEnrollmentBlocked(event.kind)
                LoginEvent.Rejected -> haptics.gateUhUh()
            }
        }
    }

    // The biometric pane prompts itself once per screen life — the fingerprint
    // sheet IS the returning-user front door, not a button hunt.
    var autoPrompted by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.bootstrapped, state.mode) {
        if (state.bootstrapped &&
            state.mode == LoginMode.Biometric &&
            !autoPrompted &&
            activity != null
        ) {
            autoPrompted = true
            viewModel.onIntent(LoginIntent.UnlockWithBiometrics(activity))
        }
    }

    // sheet-rise, retyped for the panel's IntOffset slide.
    val riseSpec = remember(motion) {
        spring(
            dampingRatio = motion.sheetRiseFloat.dampingRatio,
            stiffness = motion.sheetRiseFloat.stiffness,
            visibilityThreshold = IntOffset.VisibilityThreshold,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.deep)
            .imePadding(),
    ) {
        BrandField(
            modifier = Modifier
                .fillMaxWidth()
                .weight(BRAND_WEIGHT),
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(PANEL_WEIGHT),
            contentAlignment = Alignment.BottomCenter,
        ) {
            androidx.compose.animation.AnimatedVisibility(
                visible = state.bootstrapped,
                enter = slideInVertically(riseSpec) { fullHeight -> fullHeight } +
                    fadeIn(motion.tabFadeIn),
                modifier = Modifier.fillMaxSize(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .liftedShadow(AltusShapeTokens.sheet)
                        .clip(AltusShapeTokens.sheet)
                        .background(tokens.raised)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = AltusDimens.screenGutter)
                        .navigationBarsPadding(),
                ) {
                    AnimatedContent(
                        targetState = state.mode,
                        transitionSpec = {
                            fadeIn(motion.tabFadeIn) togetherWith fadeOut(motion.tabFadeOut)
                        },
                        label = "LoginPane",
                    ) { mode ->
                        when (mode) {
                            LoginMode.Resuming -> ResumingPane()

                            LoginMode.Biometric -> BiometricPane(
                                state = state,
                                onUnlock = {
                                    activity?.let {
                                        viewModel.onIntent(LoginIntent.UnlockWithBiometrics(it))
                                    }
                                },
                                onUsePassword = { viewModel.onIntent(LoginIntent.UsePassword) },
                            )

                            LoginMode.Password -> PasswordPane(
                                state = state,
                                onIntent = viewModel::onIntent,
                            )
                        }
                    }
                }
            }
        }
    }
}

private const val BRAND_WEIGHT = 0.42f
private const val PANEL_WEIGHT = 0.58f

// ─── The deep brand field ─────────────────────────────────────────────────────

@Composable
private fun BrandField(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier
            .background(tokens.deep)
            .grainOverlay()
            .statusBarsPadding()
            .padding(horizontal = AltusDimens.screenGutter)
            .padding(top = AltusDimens.space4, bottom = AltusDimens.space6),
    ) {
        Text(
            text = "ALTUS",
            style = AltusType.caption,
            color = tokens.onDeepSecondary,
        )
        Spacer(Modifier.weight(1f))
        Text(
            text = "The day, in order.",
            style = AltusType.display,
            color = tokens.onDeep,
        )
    }
}

// ─── Panes ────────────────────────────────────────────────────────────────────

/** Silent session revalidation — quiet, geometry-stable, never a dead end. */
@Composable
private fun ResumingPane() {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(AltusDimens.space12))
        CircularProgressIndicator(
            modifier = Modifier.size(28.dp),
            color = scheme.primary,
            strokeWidth = 2.dp,
        )
        Spacer(Modifier.height(AltusDimens.space4))
        Text(
            text = "Signing you in…",
            style = AltusType.label,
            color = scheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(AltusDimens.space12))
    }
}

/** The returning-user default: avatar, greeting, one fingerprint action. */
@Composable
private fun BiometricPane(
    state: LoginUiState,
    onUnlock: () -> Unit,
    onUsePassword: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(AltusDimens.space8))
        Avatar(
            name = state.cachedName.orEmpty(),
            imageUrl = state.cachedAvatarUrl,
            size = 56.dp,
        )
        Spacer(Modifier.height(AltusDimens.space4))
        Text(
            text = state.firstName?.let { "Welcome back, $it" } ?: "Welcome back",
            style = AltusType.title2,
            color = scheme.onSurface,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = state.cachedEmail.orEmpty(),
            style = AltusType.monoData,
            color = tokens.ink400,
        )

        if (state.formError != null) {
            Spacer(Modifier.height(AltusDimens.space4))
            FormErrorBanner(message = state.formError)
        }

        Spacer(Modifier.height(AltusDimens.space6))
        AltusPrimaryButton(
            text = "Unlock with biometrics",
            onClick = onUnlock,
            loading = state.unlocking,
            leadingIcon = LoginIcons.Fingerprint,
        )
        Spacer(Modifier.height(AltusDimens.space3))
        AltusGhostButton(
            text = "Use password instead",
            onClick = onUsePassword,
            enabled = !state.busy,
            fillMaxWidth = true,
        )
        Spacer(Modifier.height(AltusDimens.space6))
    }
}

/** Email + password — keyboard-first: autofocus, Next chains, Go submits. */
@Composable
private fun PasswordPane(
    state: LoginUiState,
    onIntent: (LoginIntent) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme

    val emailFocus = remember { FocusRequester() }
    val passwordFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        if (state.email.isBlank()) emailFocus.requestFocus() else passwordFocus.requestFocus()
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Spacer(Modifier.height(AltusDimens.space6))
        Text(
            text = "Sign in",
            style = AltusType.title2,
            color = scheme.onSurface,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = "Use your work email and password.",
            style = AltusType.body,
            color = scheme.onSurfaceVariant,
        )

        if (state.formError != null) {
            Spacer(Modifier.height(AltusDimens.space4))
            FormErrorBanner(message = state.formError)
        }

        Spacer(Modifier.height(AltusDimens.space6))
        AltusTextField(
            value = state.email,
            onValueChange = { onIntent(LoginIntent.EmailChanged(it)) },
            label = "Email",
            placeholder = "you@carbideindia.com",
            error = state.emailError,
            enabled = !state.busy,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
            focusRequester = emailFocus,
        )
        Spacer(Modifier.height(AltusDimens.space4))
        AltusTextField(
            value = state.password,
            onValueChange = { onIntent(LoginIntent.PasswordChanged(it)) },
            label = "Password",
            placeholder = "Your password",
            isPassword = true,
            error = state.passwordError,
            enabled = !state.busy,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { onIntent(LoginIntent.Submit) }),
            focusRequester = passwordFocus,
        )

        Spacer(Modifier.height(AltusDimens.space6))
        AltusPrimaryButton(
            text = "Continue",
            onClick = { onIntent(LoginIntent.Submit) },
            loading = state.submitting,
        )

        if (state.biometricReady) {
            Spacer(Modifier.height(AltusDimens.space3))
            AltusGhostButton(
                text = "Unlock with biometrics",
                onClick = { onIntent(LoginIntent.UseBiometrics) },
                enabled = !state.busy,
                leadingIcon = LoginIcons.Fingerprint,
                fillMaxWidth = true,
            )
        }
        Spacer(Modifier.height(AltusDimens.space6))
    }
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

/** The form-level rejection banner: danger wash, `label` copy, input radius. */
@Composable
internal fun FormErrorBanner(message: String, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.danger.wash)
            .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = message,
            style = AltusType.label,
            color = tokens.danger.color,
        )
    }
}

/** Unwrap the Compose context chain to the biometric-hosting FragmentActivity. */
internal tailrec fun Context.findFragmentActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.findFragmentActivity()
    else -> null
}

/**
 * Login-only Lucide glyphs (2dp stroke, round caps — §1.7), built in code like
 * [com.altuscorp.altus.navigation.AltusTabIcons]. The base stroke colour is a
 * placeholder every render overrides via `Icon(tint = …)`.
 */
internal object LoginIcons {

    /** lucide `fingerprint` — biometric unlock. */
    val Fingerprint: ImageVector by lazy {
        lucide(
            name = "Login.Fingerprint",
            "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
            "M14 13.12c0 2.38 0 6.38-1 8.88",
            "M17.29 21.02c.12-.6.43-2.3.5-3.02",
            "M2 12a10 10 0 0 1 18-6",
            "M2 16h.01",
            "M21.8 16c.2-2 .131-5.354 0-6",
            "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
            "M8.65 22c.21-.66.45-1.32.57-2",
            "M9 6.8a6 6 0 0 1 9 5.2v2",
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
