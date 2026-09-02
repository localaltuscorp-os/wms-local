@file:OptIn(ExperimentalMaterial3Api::class)

package com.altuscorp.altus.feature.moduleform

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.data.remote.dto.ModuleFieldDto
import com.altuscorp.altus.data.remote.dto.ModuleSubmissionDto
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.designsystem.AltusTextField
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * Sales · form-driven module (Record a Reference / Participant Breakthrough).
 * Renders the request-field schema as a dynamic form (text inputs keyed by type,
 * a Product dropdown), submits, and lists the user's own entries below with a
 * status pill. One screen serves both modules (the key comes from the route).
 */
@Composable
fun ModuleFormScreen(
    onBack: () -> Unit,
    viewModel: ModuleFormViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val tokens = AltusTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = state.title.ifBlank { "Sales" },
            navigationIcon = ModuleFormIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )
        when {
            state.isLoading && !state.hasContent -> FormSkeleton()
            state.loadFailed && !state.hasContent -> FormError(onRetry = { viewModel.onIntent(ModuleFormIntent.Retry) })
            else -> FormBody(state = state, onIntent = viewModel::onIntent)
        }
    }
}

@Composable
private fun FormBody(
    state: ModuleFormUiState,
    onIntent: (ModuleFormIntent) -> Unit,
) {
    val tokens = AltusTheme.tokens
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = AltusDimens.screenGutter,
            end = AltusDimens.screenGutter,
            top = AltusDimens.space4,
            bottom = AltusDimens.space12,
        ),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        if (state.subtitle.isNotBlank()) {
            item(key = "subtitle") {
                Text(text = state.subtitle, style = AltusType.body, color = tokens.ink400)
            }
        }

        state.banner?.let { banner ->
            item(key = "banner") {
                Banner(text = banner, isError = state.bannerIsError)
            }
        }

        items(items = state.fields, key = { "f-${it.key}" }) { field ->
            FormField(
                field = field,
                value = state.values[field.key] ?: "",
                productOptions = state.productOptions,
                onChange = { v -> onIntent(ModuleFormIntent.FieldChanged(field.key, v)) },
            )
        }

        item(key = "submit") {
            Spacer(Modifier.height(AltusDimens.space1))
            AltusPrimaryButton(
                text = state.buttonLabel,
                onClick = { onIntent(ModuleFormIntent.Submit) },
                enabled = !state.submitting,
                loading = state.submitting,
            )
        }

        item(key = "entries-header") {
            SectionHeader(
                title = "Your entries",
                count = "${state.submissions.size}",
                modifier = Modifier.padding(top = AltusDimens.sectionGap - AltusDimens.space3),
            )
        }

        if (state.submissions.isEmpty()) {
            item(key = "entries-empty") {
                EmptyState(headline = "No entries yet.", body = "What you submit appears here.")
            }
        } else {
            items(items = state.submissions, key = { it.id }) { sub ->
                SubmissionCard(sub = sub)
            }
        }
    }
}

// ─── Dynamic field ──────────────────────────────────────────────────────────

@Composable
private fun FormField(
    field: ModuleFieldDto,
    value: String,
    productOptions: List<String>,
    onChange: (String) -> Unit,
) {
    val label = if (field.required) "${field.label} *" else field.label
    when (field.type) {
        "product" -> ProductPicker(label = label, value = value, options = productOptions, onPick = onChange)
        else -> {
            val multiline = field.type == "textarea"
            AltusTextField(
                value = value,
                onValueChange = onChange,
                label = label,
                placeholder = field.placeholder,
                singleLine = !multiline,
                keyboardOptions = KeyboardOptions(
                    keyboardType = when (field.type) {
                        "email" -> KeyboardType.Email
                        "tel" -> KeyboardType.Phone
                        "number" -> KeyboardType.Number
                        "url" -> KeyboardType.Uri
                        else -> KeyboardType.Text
                    },
                    imeAction = if (multiline) ImeAction.Default else ImeAction.Next,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun ProductPicker(
    label: String,
    value: String,
    options: List<String>,
    onPick: (String) -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    var expanded by remember { mutableStateOf(false) }

    Column {
        Text(
            text = label.uppercase(),
            style = AltusType.caption,
            color = scheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = AltusDimens.space2),
        )
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 52.dp)
                    .clip(AltusShapeTokens.input)
                    .background(tokens.sunken)
                    .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.input)
                    .clickable { expanded = true }
                    .padding(horizontal = AltusDimens.space4, vertical = AltusDimens.space3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = value.ifBlank { "Select…" },
                    style = AltusType.body,
                    color = if (value.isBlank()) tokens.ink300 else scheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Icon(ModuleFormIcons.ChevronDown, contentDescription = null, tint = scheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                DropdownMenuItem(
                    text = { Text("None", style = AltusType.body, color = tokens.ink400) },
                    onClick = { onPick(""); expanded = false },
                )
                options.forEach { opt ->
                    DropdownMenuItem(
                        text = { Text(opt, style = AltusType.body) },
                        onClick = { onPick(opt); expanded = false },
                    )
                }
            }
        }
    }
}

// ─── Submission card ──────────────────────────────────────────────────────────

@Composable
private fun SubmissionCard(sub: ModuleSubmissionDto) {
    val tokens = AltusTheme.tokens
    AltusCard(modifier = Modifier.fillMaxWidth(), accentKeyline = tokens.workspaces.sales.base) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = sub.title,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            SubmissionPill(status = sub.status, label = sub.statusLabel)
        }
        if (sub.createdAt.length >= 10) {
            Spacer(Modifier.height(2.dp))
            Text(text = sub.createdAt.take(10), style = AltusType.monoData, color = tokens.ink400, maxLines = 1)
        }
        if (sub.pairs.isNotEmpty()) {
            Spacer(Modifier.height(AltusDimens.space2))
            sub.pairs.take(4).forEach { pair ->
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 1.dp)) {
                    Text(
                        text = pair.label,
                        style = AltusType.label,
                        color = tokens.ink400,
                        modifier = Modifier.weight(0.42f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = pair.value,
                        style = AltusType.label,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(0.58f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun SubmissionPill(status: String, label: String) {
    val tokens = AltusTheme.tokens
    val (fg, bg) = when (status) {
        "approved" -> tokens.success.color to tokens.success.wash
        "rejected" -> tokens.danger.color to tokens.danger.wash
        else -> tokens.warn.color to tokens.warn.wash
    }
    Box(
        modifier = Modifier
            .clip(AltusShapeTokens.pill)
            .background(bg)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    ) {
        Text(text = label.uppercase(), style = AltusType.caption, color = fg, maxLines = 1)
    }
}

// ─── Banner / states ──────────────────────────────────────────────────────────

@Composable
private fun Banner(text: String, isError: Boolean) {
    val tokens = AltusTheme.tokens
    val fg = if (isError) tokens.danger.color else tokens.success.color
    val bg = if (isError) tokens.danger.wash else tokens.success.wash
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(bg)
            .padding(AltusDimens.space3),
    ) {
        Text(text = text, style = AltusType.label, color = fg)
    }
}

@Composable
private fun FormError(onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(
            headline = "Couldn't load this form.",
            body = "Check your connection and try again.",
            actionLabel = "Retry",
            onAction = onRetry,
        )
    }
}

@Composable
private fun FormSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize().padding(AltusDimens.screenGutter),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        repeat(5) { SkeletonBox(modifier = Modifier.fillMaxWidth().height(64.dp)) }
    }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

private object ModuleFormIcons {
    val ArrowLeft: ImageVector by lazy { lucide("MF.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }
    val ChevronDown: ImageVector by lazy { lucide("MF.ChevronDown", "M6 9l6 6 6-6") }

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
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
