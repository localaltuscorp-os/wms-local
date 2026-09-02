package com.altuscorp.altus.feature.login

import android.util.Patterns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.firebase.AuthOutcome
import com.altuscorp.altus.core.firebase.BiometricAuthenticator
import com.altuscorp.altus.core.firebase.BiometricAvailability
import com.altuscorp.altus.core.firebase.BiometricOutcome
import com.altuscorp.altus.core.network.EnrollmentBlock
import com.altuscorp.altus.data.repository.AuthRepository
import com.altuscorp.altus.navigation.EnrollmentGateRoute
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
 * S1 orchestration: bootstraps the returning-user snapshot (cached identity +
 * biometric readiness), then reduces [LoginIntent]s over [AuthRepository] —
 * which owns the post-login side effects (cache `/me`, register the pending
 * FCM token, flush the outbox) for both `signIn` and `resumeSession`.
 *
 * All Firebase/HTTP failure shapes arrive pre-typed as [AuthOutcome]; this
 * class only decides which pane shows and which copy renders.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val biometricAuthenticator: BiometricAuthenticator,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events: Flow<LoginEvent> = _events.receiveAsFlow()

    init {
        bootstrap()
    }

    fun onIntent(intent: LoginIntent) {
        when (intent) {
            is LoginIntent.EmailChanged -> _uiState.update {
                it.copy(email = intent.value, emailError = null, formError = null)
            }

            is LoginIntent.PasswordChanged -> _uiState.update {
                it.copy(password = intent.value, passwordError = null, formError = null)
            }

            LoginIntent.Submit -> submit()

            is LoginIntent.UnlockWithBiometrics -> unlockWithBiometrics(intent)

            LoginIntent.UsePassword -> _uiState.update {
                it.copy(
                    mode = LoginMode.Password,
                    email = it.email.ifBlank { it.cachedEmail.orEmpty() },
                    formError = null,
                    emailError = null,
                    passwordError = null,
                )
            }

            LoginIntent.UseBiometrics -> {
                if (_uiState.value.biometricReady) {
                    _uiState.update {
                        it.copy(
                            mode = LoginMode.Biometric,
                            formError = null,
                            emailError = null,
                            passwordError = null,
                        )
                    }
                }
            }
        }
    }

    // ─── Bootstrap: decide the opening pane from the session snapshot ────────

    private fun bootstrap() {
        viewModelScope.launch {
            val cached = authRepository.cachedIdentity.first()
            val toggleOn = authRepository.biometricUnlockEnabled.first()
            val available =
                biometricAuthenticator.availability() == BiometricAvailability.Available
            val signedIn = authRepository.isSignedIn()
            val biometricReady = signedIn && cached != null && toggleOn && available

            _uiState.update {
                it.copy(
                    bootstrapped = true,
                    biometricReady = biometricReady,
                    cachedName = cached?.name,
                    cachedEmail = cached?.email,
                    cachedAvatarUrl = cached?.avatarUrl,
                    email = it.email.ifBlank { cached?.email.orEmpty() },
                    mode = when {
                        !signedIn -> LoginMode.Password
                        biometricReady -> LoginMode.Biometric
                        else -> LoginMode.Resuming
                    },
                )
            }

            // A live Firebase session with no usable biometric path revalidates
            // silently — pure session resume, never a prompt.
            if (signedIn && !biometricReady) {
                handleOutcome(authRepository.resumeSession(), allowCachedOffline = cached != null)
            }
        }
    }

    // ─── Password path ────────────────────────────────────────────────────────

    private fun submit() {
        val state = _uiState.value
        if (state.busy) return

        val email = state.email.trim()
        val emailError = when {
            email.isEmpty() -> "Enter your email."
            !Patterns.EMAIL_ADDRESS.matcher(email).matches() -> "That doesn't look like an email."
            else -> null
        }
        val passwordError = if (state.password.isEmpty()) "Enter your password." else null
        if (emailError != null || passwordError != null) {
            _uiState.update { it.copy(emailError = emailError, passwordError = passwordError) }
            viewModelScope.launch { _events.send(LoginEvent.Rejected) }
            return
        }

        _uiState.update {
            it.copy(submitting = true, formError = null, emailError = null, passwordError = null)
        }
        viewModelScope.launch {
            // First-time credentials cannot be verified offline — never proceed
            // on a cached identity from the password path.
            handleOutcome(
                authRepository.signIn(email, state.password),
                allowCachedOffline = false,
            )
        }
    }

    // ─── Biometric returning-user path ───────────────────────────────────────

    private fun unlockWithBiometrics(intent: LoginIntent.UnlockWithBiometrics) {
        val state = _uiState.value
        if (state.busy || !state.biometricReady) return

        _uiState.update { it.copy(unlocking = true, formError = null) }
        viewModelScope.launch {
            val outcome = biometricAuthenticator.authenticate(
                activity = intent.activity,
                title = "Unlock Altus",
                subtitle = state.cachedEmail,
            )
            when (outcome) {
                BiometricOutcome.Success ->
                    handleOutcome(authRepository.resumeSession(), allowCachedOffline = true)

                BiometricOutcome.Cancelled ->
                    _uiState.update { it.copy(unlocking = false) }

                BiometricOutcome.LockedOut -> {
                    _uiState.update {
                        it.copy(
                            unlocking = false,
                            mode = LoginMode.Password,
                            email = it.email.ifBlank { it.cachedEmail.orEmpty() },
                            formError = "Biometrics are locked out — sign in with your password.",
                        )
                    }
                    _events.send(LoginEvent.Rejected)
                }

                is BiometricOutcome.Error -> {
                    _uiState.update {
                        it.copy(
                            unlocking = false,
                            formError = outcome.message.ifBlank { "Biometric unlock failed — try again." },
                        )
                    }
                    _events.send(LoginEvent.Rejected)
                }
            }
        }
    }

    // ─── Shared outcome reducer ──────────────────────────────────────────────

    /**
     * @param allowCachedOffline returning-user paths (resume, biometric) may
     *   proceed to a cached, read-only Today when the network is down; a typed
     *   password can never be verified offline.
     */
    private suspend fun handleOutcome(outcome: AuthOutcome, allowCachedOffline: Boolean) {
        when (outcome) {
            is AuthOutcome.Enrolled -> {
                _uiState.update { it.copy(submitting = false, unlocking = false) }
                _events.send(LoginEvent.SignedIn)
            }

            is AuthOutcome.Blocked -> {
                _uiState.update { it.copy(submitting = false, unlocking = false) }
                _events.send(LoginEvent.EnrollmentBlocked(outcome.reason.toGateKind()))
            }

            AuthOutcome.InvalidCredentials -> {
                val fromPasswordForm = _uiState.value.mode == LoginMode.Password
                _uiState.update {
                    it.copy(
                        submitting = false,
                        unlocking = false,
                        mode = LoginMode.Password,
                        email = it.email.ifBlank { it.cachedEmail.orEmpty() },
                        passwordError = if (fromPasswordForm) "Email or password is incorrect." else null,
                        formError = if (fromPasswordForm) null else "Your session ended — sign in with your password.",
                    )
                }
                _events.send(LoginEvent.Rejected)
            }

            AuthOutcome.Offline -> {
                if (allowCachedOffline && _uiState.value.cachedName != null) {
                    _uiState.update { it.copy(submitting = false, unlocking = false) }
                    _events.send(LoginEvent.SignedIn)
                } else {
                    failVisible("You're offline — check your connection and try again.")
                }
            }

            is AuthOutcome.Failed ->
                failVisible(outcome.message ?: "Something went wrong — try again.")
        }
    }

    /** Land every non-navigating failure on an interactive pane with copy. */
    private suspend fun failVisible(message: String) {
        _uiState.update {
            it.copy(
                submitting = false,
                unlocking = false,
                // A stuck Resuming spinner is a dead end — drop to the form.
                mode = if (it.mode == LoginMode.Resuming) LoginMode.Password else it.mode,
                email = it.email.ifBlank { it.cachedEmail.orEmpty() },
                formError = message,
            )
        }
        _events.send(LoginEvent.Rejected)
    }
}

/** Server 403 reason → the EnrollmentGate route's kind vocabulary. */
private fun EnrollmentBlock.toGateKind(): String = when (this) {
    EnrollmentBlock.NotEnrolled -> EnrollmentGateRoute.KIND_NOT_ENROLLED
    EnrollmentBlock.Deactivated -> EnrollmentGateRoute.KIND_DEACTIVATED
}
