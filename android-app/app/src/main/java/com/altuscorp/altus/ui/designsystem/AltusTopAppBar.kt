package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The standard app bar (§1.2 anatomy): center-aligned title in `title1` style,
 * optional navigation icon (usually back), and optional actions.
 *
 * It uses a transparent container by default to let the underlying canvas or
 * background show through, keeping the header light.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AltusTopAppBar(
    title: String,
    modifier: Modifier = Modifier,
    navigationIcon: ImageVector? = null,
    onNavigationClick: () -> Unit = {},
    navigationContentDescription: String? = null,
    containerColor: Color = Color.Transparent,
    titleContentColor: Color = MaterialTheme.colorScheme.onSurface,
    actions: @Composable RowScope.() -> Unit = {},
) {
    CenterAlignedTopAppBar(
        title = {
            Text(
                text = title,
                style = AltusType.title1,
                color = titleContentColor,
            )
        },
        modifier = modifier,
        navigationIcon = {
            if (navigationIcon != null) {
                IconButton(onClick = onNavigationClick) {
                    Icon(
                        imageVector = navigationIcon,
                        contentDescription = navigationContentDescription,
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
            containerColor = containerColor,
        ),
    )
}
