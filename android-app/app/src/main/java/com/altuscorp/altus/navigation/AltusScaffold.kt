package com.altuscorp.altus.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * App-shell scaffold: hosts the bottom bar and the persistent Day Strip
 * (the 52dp lifted pill docked 8dp above the tab bar while the day is open —
 * Part 2). The strip is a slot so the shell compiles independently of the
 * design-system `DayStrip` composable; the Today layer passes it in.
 *
 * `contentWindowInsets` is zeroed: each screen owns its status-bar inset
 * (collapsing headers bleed under it) and the bottom bar owns the nav-bar
 * inset, per `enableEdgeToEdge()`.
 */
@Composable
fun AltusScaffold(
    modifier: Modifier = Modifier,
    bottomBar: @Composable () -> Unit = {},
    dayStrip: (@Composable () -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            Column(Modifier.fillMaxWidth()) {
                if (dayStrip != null) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp) // screen gutter
                            .padding(bottom = 8.dp), // docked 8dp above the tab bar
                    ) {
                        dayStrip()
                    }
                }
                bottomBar()
            }
        },
        content = content,
    )
}
