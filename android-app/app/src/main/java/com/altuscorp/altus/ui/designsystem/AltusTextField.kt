package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The Altus input (S1 login fields, composers, numeric notes): 12dp radius,
 * sunken fill, hairline border that becomes a 2dp evergreen focus ring, 16sp
 * input text (`body` — the reading floor). Error state swaps the ring to
 * `danger` and renders [error] beneath in `label`.
 *
 * Keyboard-first house rule: pass a [focusRequester] to autofocus, and wire
 * [keyboardActions] so Enter advances/submits.
 */
@Composable
fun AltusTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    isPassword: Boolean = false,
    error: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    focusRequester: FocusRequester? = null,
    leadingIcon: ImageVector? = null,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    var passwordVisible by rememberSaveable { mutableStateOf(false) }

    val borderWidth = if (focused) 2.dp else AltusDimens.hairline
    val borderColor by animateColorAsState(
        targetValue = when {
            error != null -> tokens.danger.color
            focused -> scheme.primary
            else -> tokens.hairline
        },
        label = "AltusTextFieldBorder",
    )

    Column(modifier = modifier) {
        if (label != null) {
            Text(
                text = label.uppercase(),
                style = AltusType.caption,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = AltusDimens.space2),
            )
        }

        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
            enabled = enabled,
            textStyle = AltusType.body.copy(
                color = if (enabled) scheme.onSurface else tokens.ink300,
            ),
            cursorBrush = SolidColor(scheme.primary),
            visualTransformation = if (isPassword && !passwordVisible) {
                PasswordVisualTransformation()
            } else {
                VisualTransformation.None
            },
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            singleLine = singleLine,
            interactionSource = interactionSource,
            decorationBox = { innerTextField ->
                Row(
                    modifier = Modifier
                        .defaultMinSize(minHeight = 52.dp)
                        .clip(AltusShapeTokens.input)
                        .background(tokens.sunken)
                        .border(borderWidth, borderColor, AltusShapeTokens.input)
                        .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (leadingIcon != null) {
                        Icon(
                            imageVector = leadingIcon,
                            contentDescription = null,
                            tint = scheme.onSurfaceVariant,
                            modifier = Modifier
                                .size(20.dp),
                        )
                        Box(Modifier.size(AltusDimens.space3, 0.dp))
                    }
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty() && placeholder != null) {
                            Text(
                                text = placeholder,
                                style = AltusType.body,
                                color = tokens.ink300,
                            )
                        }
                        innerTextField()
                    }
                    if (isPassword) {
                        Text(
                            text = if (passwordVisible) "HIDE" else "SHOW",
                            style = AltusType.caption,
                            color = scheme.primary,
                            modifier = Modifier
                                .clip(AltusShapeTokens.chip)
                                .clickable(enabled = enabled) { passwordVisible = !passwordVisible }
                                .padding(AltusDimens.space2),
                        )
                    }
                }
            },
        )

        if (error != null) {
            Text(
                text = error,
                style = AltusType.label,
                color = tokens.danger.color,
                modifier = Modifier.padding(top = AltusDimens.space1),
            )
        }
    }
}
