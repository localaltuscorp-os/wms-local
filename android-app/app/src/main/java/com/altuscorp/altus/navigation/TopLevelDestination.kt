package com.altuscorp.altus.navigation

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The four state-preserving bottom-bar destinations (Part 3 of the design
 * contract): Hub · Tasks · Fill · You. Hub is the home tab — the workspace
 * front door login lands on. The daily Today ledger is reached through the Hub's
 * WMS card; Inbox stays a pushed screen.
 *
 * @property graph the @Serializable graph route object navigated to on tab tap.
 * @property label 13sp `label`-style tab text.
 * @property icon Lucide glyph (2dp stroke, round caps) rendered at 24dp and
 *   tinted at the call-site: active = `primary`, inactive = `onSurfaceVariant`.
 * @property showsTaskBadge true only for Tasks, which carries the mono pending
 *   count badge (badges are mono counts, never dots).
 */
enum class TopLevelDestination(
    val graph: Any,
    val label: String,
    val icon: ImageVector,
    val showsTaskBadge: Boolean = false,
) {
    HUB(graph = HubGraph, label = "Hub", icon = AltusTabIcons.House),
    TASKS(graph = TasksGraph, label = "Tasks", icon = AltusTabIcons.CheckSquare, showsTaskBadge = true),
    FILL(graph = FillGraph, label = "Fill", icon = AltusTabIcons.LayoutGrid),
    YOU(graph = YouGraph, label = "You", icon = AltusTabIcons.CircleUser),
}

/**
 * Lucide tab glyphs built as stroked [ImageVector]s (24×24 grid, 2dp stroke,
 * round caps/joins — §1.7). Built in code so no icon library ships; the base
 * stroke colour is a placeholder that every render replaces via `Icon(tint=…)`.
 */
object AltusTabIcons {

    /** lucide `house` — Hub (the workspace front door / home tab). */
    val House: ImageVector by lazy {
        lucide(
            name = "AltusTab.House",
            "M3 9.5l9-7 9 7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
        )
    }

    /** lucide `sun` — the Today ledger (reached through the Hub's WMS card). */
    val Sun: ImageVector by lazy {
        lucide(
            name = "AltusTab.Sun",
            "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8",
            "M12 2v2",
            "M12 20v2",
            "M4.93 4.93l1.41 1.41",
            "M17.66 17.66l1.41 1.41",
            "M2 12h2",
            "M20 12h2",
            "M6.34 17.66l-1.41 1.41",
            "M19.07 4.93l-1.41 1.41",
        )
    }

    /** lucide `square-check-big` — Tasks. */
    val CheckSquare: ImageVector by lazy {
        lucide(
            name = "AltusTab.CheckSquare",
            "M9 11l3 3L22 4",
            "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
        )
    }

    /** lucide `layout-grid` — Fill (DCC board, §1.7). */
    val LayoutGrid: ImageVector by lazy {
        lucide(
            name = "AltusTab.LayoutGrid",
            "M3 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
            "M14 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z",
            "M14 15a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z",
            "M3 15a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
        )
    }

    /** lucide `circle-user` — You. */
    val CircleUser: ImageVector by lazy {
        lucide(
            name = "AltusTab.CircleUser",
            "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20",
            "M12 6a4 4 0 1 0 0 8 4 4 0 1 0 0-8",
            "M18 20a6 6 0 0 0-12 0",
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
