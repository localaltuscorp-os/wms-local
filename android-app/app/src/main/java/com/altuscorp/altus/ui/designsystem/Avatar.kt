package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The Altus avatar: Coil-backed circle at the three canonical sizes —
 * 32dp (Today header), 48dp (roster rows), 56dp (identity card) — with a
 * mint-initials fallback while loading, on error, or when [imageUrl] is null.
 * The type role scales with the diameter so initials stay readable at every
 * size (readability house rule).
 */
@Composable
fun Avatar(
    name: String,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    size: Dp = 32.dp,
    contentDescription: String? = name,
) {
    val frame = modifier
        .size(size)
        .clip(CircleShape)

    if (imageUrl.isNullOrBlank()) {
        InitialsFallback(name = name, size = size, modifier = frame)
    } else {
        SubcomposeAsyncImage(
            model = imageUrl,
            contentDescription = contentDescription,
            modifier = frame,
            contentScale = ContentScale.Crop,
            loading = { InitialsFallback(name = name, size = size, modifier = Modifier.fillMaxSize()) },
            error = { InitialsFallback(name = name, size = size, modifier = Modifier.fillMaxSize()) },
        )
    }
}

@Composable
private fun InitialsFallback(
    name: String,
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val initials = remember(name) { initialsOf(name) }

    Box(
        modifier = modifier.background(scheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = initialsStyle(size),
            color = scheme.onPrimaryContainer,
            maxLines = 1,
        )
    }
}

/** First letter of the first two words; "?" for a blank name. */
private fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(1).uppercase()
        else -> (parts[0].take(1) + parts[1].take(1)).uppercase()
    }
}

private fun initialsStyle(size: Dp): TextStyle = when {
    size < 40.dp -> AltusType.label
    size < 52.dp -> AltusType.bodyStrong
    else -> AltusType.title2
}
