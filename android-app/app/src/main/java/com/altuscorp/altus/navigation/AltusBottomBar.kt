package com.altuscorp.altus.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy

/**
 * The signature Altus nav: a FLOATING pill bar (not an edge-to-edge strip). It
 * sizes to its content and centres itself above the gesture inset, with a soft
 * lift shadow so it hovers over the page. The selected tab morphs into an Altus
 * red pill that expands to reveal its label and springs between destinations;
 * unselected tabs are quiet icon-only glyphs. Tasks keeps its mono pending
 * badge.
 *
 * @param currentDestination current back-stack destination; selection is
 *   resolved by graph-hierarchy membership, so pushed screens inside a tab keep
 *   that tab lit.
 * @param tasksBadgeCount pending-task count shown on the Tasks tab when > 0.
 */
@Composable
fun AltusBottomBar(
    currentDestination: NavDestination?,
    onNavigateToDestination: (TopLevelDestination) -> Unit,
    modifier: Modifier = Modifier,
    tasksBadgeCount: Int = 0,
    destinations: List<TopLevelDestination> = TopLevelDestination.entries,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(26.dp),
            color = scheme.surface,
            shadowElevation = 18.dp,
            border = BorderStroke(1.dp, scheme.outlineVariant),
        ) {
            Row(
                modifier = Modifier
                    .height(60.dp)
                    .padding(horizontal = 6.dp)
                    .selectableGroup(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                destinations.forEach { destination ->
                    val selected = currentDestination?.hierarchy
                        ?.any { it.hasRoute(destination.graph::class) } == true
                    PillTab(
                        destination = destination,
                        selected = selected,
                        tasksBadgeCount = tasksBadgeCount,
                        onClick = { onNavigateToDestination(destination) },
                    )
                }
            }
        }
    }
}

@Composable
private fun PillTab(
    destination: TopLevelDestination,
    selected: Boolean,
    tasksBadgeCount: Int,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val spring = spring<Color>(dampingRatio = 0.8f, stiffness = 500f)
    val pill by animateColorAsState(if (selected) scheme.primary else Color.Transparent, spring, label = "pill")
    val content by animateColorAsState(if (selected) scheme.onPrimary else scheme.onSurfaceVariant, spring, label = "content")
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(pill)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        BadgedBox(
            badge = {
                if (destination.showsTaskBadge && tasksBadgeCount > 0 && !selected) {
                    Badge(containerColor = scheme.primary, contentColor = scheme.onPrimary) {
                        Text(tasksBadgeCount.toString(), style = MaterialTheme.typography.labelSmall)
                    }
                }
            },
        ) {
            Icon(
                imageVector = destination.icon,
                contentDescription = destination.label,
                tint = content,
                modifier = Modifier.size(22.dp),
            )
        }
        AnimatedVisibility(
            visible = selected,
            enter = fadeIn() + expandHorizontally(clip = false),
            exit = fadeOut() + shrinkHorizontally(clip = false),
        ) {
            Text(
                text = destination.label,
                style = MaterialTheme.typography.labelLarge,
                color = content,
                maxLines = 1,
            )
        }
    }
}
