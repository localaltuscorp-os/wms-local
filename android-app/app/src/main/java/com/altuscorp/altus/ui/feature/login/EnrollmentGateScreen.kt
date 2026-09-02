package com.altuscorp.altus.feature.login

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.data.repository.AuthRepository
import com.altuscorp.altus.navigation.EnrollmentGateRoute
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.grainOverlay
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.SemanticColor
import com.altuscorp.altus.ui.theme.liftedShadow
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * S1 Enrollment gate — the designed dead-ends after a successful Firebase
 * sign-in that `/me` then refuses (403).
 *
 * Two tones on the shared login shell (deep brand field + rising raised panel):
 * `not-enrolled` reads calm/`warn` ("you're in the door but not on the roster");
 * `deactivated` reads `danger`. Both show the signed-in email in `mono-data`,
 * a "Contact your admin" mail action, and one filled **Sign out** whose label
 * commit-morphs to a spinner while the session tears down (unregister push →
 * clear outbox → clear cache → Firebase sign-out) before returning to Login.
 *
 * Matches the NavHost signature: `EnrollmentGateScreen(kind, onSignOut)`.
 */
@Composable
fun EnrollmentGateScreen(
    kind: String,
    onSignOut: () -> Unit,
) {
    val viewModel: EnrollmentGateViewModel = hiltViewModel()
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val context = LocalContext.current

    val currentOnSignOut by rememberUpdatedState(onSignOut)
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                EnrollmentGateEvent.SignedOut -> currentOnSignOut()
            }
        }
    }

    val deactivated = kind == EnrollmentGateRoute.KIND_DEACTIVATED
    val tone: SemanticColor = if (deactivated) tokens.danger else tokens.warn

    val headline = if (deactivated) {
        "Your access is turned off"
    } else {
        "You're signed in, but not enrolled"
    }
    val body = if (deactivated) {
        "This account has been deactivated. Ask your admin to restore access, " +
            "then sign in again."
    } else {
        "Your Altus account exists, but you haven't been added to the workspace " +
            "yet. Ask your admin to enrol you, then sign in again."
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.deep),
    ) {
        // ── Deep brand field (matches Login's top zone) ──────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(BRAND_WEIGHT)
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
                text = if (deactivated) "Access paused." else "Almost there.",
                style = AltusType.display,
                color = tokens.onDeep,
            )
        }

        // ── Raised panel with the designed gate copy ─────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .weight(PANEL_WEIGHT)
                .liftedShadow(AltusShapeTokens.sheet)
                .clip(AltusShapeTokens.sheet)
                .background(tokens.raised)
                .padding(horizontal = AltusDimens.screenGutter)
                .navigationBarsPadding(),
        ) {
            Spacer(Modifier.height(AltusDimens.space8))

            ToneBadge(tone = tone)

            Spacer(Modifier.height(AltusDimens.space5))
            Text(
                text = headline,
                style = AltusType.title2,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(AltusDimens.space2))
            Text(
                text = body,
                style = AltusType.body,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            state.email?.let { email ->
                Spacer(Modifier.height(AltusDimens.space5))
                EmailChip(email = email)
            }

            Spacer(Modifier.weight(1f))

            AltusPrimaryButton(
                text = "Sign out",
                onClick = { viewModel.signOut() },
                loading = state.signingOut,
            )
            Spacer(Modifier.height(AltusDimens.space3))
            AltusGhostButton(
                text = "Contact your admin",
                onClick = { context.composeAdminEmail(state.email) },
                enabled = !state.signingOut,
                leadingIcon = EnrollmentIcons.Mail,
                fillMaxWidth = true,
            )
            Spacer(Modifier.height(AltusDimens.space6))
        }
    }
}

private const val BRAND_WEIGHT = 0.42f
private const val PANEL_WEIGHT = 0.58f

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** A tinted 56dp alert badge — `warn` for not-enrolled, `danger` for deactivated. */
@Composable
private fun ToneBadge(tone: SemanticColor) {
    Box(
        modifier = Modifier
            .size(56.dp)
            .clip(AltusShapeTokens.card)
            .background(tone.wash),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = EnrollmentIcons.AlertTriangle,
            contentDescription = null,
            tint = tone.color,
            modifier = Modifier.size(28.dp),
        )
    }
}

/** The signed-in identity, shown honestly in `mono-data` inside a sunken well. */
@Composable
private fun EmailChip(email: String) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        Text(
            text = "SIGNED IN AS",
            style = AltusType.caption,
            color = tokens.ink400,
        )
        Text(
            text = email,
            style = AltusType.monoData,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Start,
        )
    }
}

/** Open the device mail composer for an access request; harmless if none installed. */
private fun android.content.Context.composeAdminEmail(email: String?) {
    val subject = "Altus access request" + (email?.let { " — $it" }.orEmpty())
    val intent = Intent(Intent.ACTION_SENDTO).apply {
        data = Uri.parse("mailto:")
        putExtra(Intent.EXTRA_SUBJECT, subject)
    }
    try {
        startActivity(Intent.createChooser(intent, "Contact your admin"))
    } catch (_: ActivityNotFoundException) {
        // No mail client — the button simply no-ops rather than crashing.
    }
}

// ─── ViewModel ─────────────────────────────────────────────────────────────────

/**
 * Tears down the blocked session on demand. [signOut] delegates to
 * [AuthRepository.signOut], which owns the ordered side effects (unregister
 * push → cancel + clear outbox → clear cache → Firebase sign-out) so the
 * returning Login screen can't silently resume back into the same 403.
 */
@HiltViewModel
class EnrollmentGateViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EnrollmentGateUiState())
    val uiState: StateFlow<EnrollmentGateUiState> = _uiState.asStateFlow()

    private val _events = Channel<EnrollmentGateEvent>(Channel.BUFFERED)
    val events: Flow<EnrollmentGateEvent> = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val cached = authRepository.cachedIdentity.first()
            _uiState.update { it.copy(email = cached?.email ?: authRepository.signedInEmail()) }
        }
    }

    fun signOut() {
        if (_uiState.value.signingOut) return
        _uiState.update { it.copy(signingOut = true) }
        viewModelScope.launch {
            authRepository.signOut()
            _events.send(EnrollmentGateEvent.SignedOut)
        }
    }
}

@androidx.compose.runtime.Immutable
data class EnrollmentGateUiState(
    val email: String? = null,
    /** Sign out pressed — the label commit-morphs to a spinner while teardown runs. */
    val signingOut: Boolean = false,
)

/** One-shot: session torn down, the NavHost pops back to Login. */
sealed interface EnrollmentGateEvent {
    data object SignedOut : EnrollmentGateEvent
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

/**
 * Screen-local Lucide glyphs (2dp stroke, round caps — §1.7), built in code like
 * [LoginIcons]. The base stroke is a placeholder every render overrides via tint.
 */
internal object EnrollmentIcons {

    /** lucide `triangle-alert`. */
    val AlertTriangle: ImageVector by lazy {
        lucide(
            name = "Enrollment.AlertTriangle",
            "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z",
            "M12 9v4",
            "M12 17h.01",
        )
    }

    /** lucide `mail`. */
    val Mail: ImageVector by lazy {
        lucide(
            name = "Enrollment.Mail",
            "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
            "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
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
