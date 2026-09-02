package com.altuscorp.altus.feature.wms

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.feature.dailychecklist.DailyChecklistScreen
import com.altuscorp.altus.feature.kanban.WmsKanbanScreen
import com.altuscorp.altus.feature.myday.WmsMyDayScreen
import com.altuscorp.altus.feature.projects.WmsProjectsScreen
import com.altuscorp.altus.feature.tasks.list.TaskListScreen
import com.altuscorp.altus.feature.team.WmsTeamScreen
import com.altuscorp.altus.feature.weeklygoals.WmsWeeklyGoalsScreen
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * The eight WMS workspace pages, in the web main-nav order (the `wms` group of
 * `components/layout/main-nav.tsx`): Dashboard · My Day · Tasks · Kanban ·
 * Projects · Weekly Goals · Team · Daily Checklist. Attendance/DCC belong to the
 * Employees workspace and are intentionally NOT here.
 *
 * [label] is the exact pill text. The enum is the shell's page state — a pill
 * tap sets it, [WmsShell] renders the matching page; the Pages phase swaps each
 * page's placeholder for its real screen at the single `when` in [WmsShell].
 */
enum class WmsPage(val label: String) {
    Dashboard("Dashboard"),
    MyDay("My Day"),
    Tasks("Tasks"),
    Kanban("Kanban"),
    Projects("Projects"),
    WeeklyGoals("Weekly Goals"),
    Team("Team"),
    DailyChecklist("Daily Checklist"),
}

/**
 * The WMS workspace SHELL — the destination the WMS hub card lands on. It hosts
 * the currently-selected WMS page over a horizontal, scrollable PILL-BAR docked
 * at the bottom (the native rendition of the web main-nav's WMS pill group). The
 * active pill is a filled Altus-red (`primary`) pill; the rest are red-tinted
 * outline pills; a leading "Hub" pill returns to the workspace front door.
 *
 * State-preserving: the selected page is a [rememberSaveable] enum and each
 * page's `@HiltViewModel` is scoped to this shell's back-stack entry, so
 * switching pills swaps the view WITHOUT re-fetching — the Dashboard's data (and
 * every future page's) survives a round-trip across the pill bar. The shell is a
 * pushed destination (no app bottom-bar here), so it owns the status-bar inset
 * via [Modifier.statusBarsPadding]; hosted pages must NOT re-apply it.
 *
 * @param onBackToHub returns to the hub (the "Hub" pill + system back).
 * @param onOpenTask opens a task detail — threaded into every page that lists tasks.
 * @param onNewTask opens the new-task form — threaded into the task-bearing pages.
 * @param initialPage the page selected on entry (Dashboard for the hub card).
 */
@Composable
fun WmsShell(
    onBackToHub: () -> Unit,
    onOpenTask: (taskId: String) -> Unit,
    onNewTask: () -> Unit,
    modifier: Modifier = Modifier,
    initialPage: WmsPage = WmsPage.Dashboard,
) {
    val tokens = AltusTheme.tokens
    var page by rememberSaveable { mutableStateOf(initialPage) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas)
            .statusBarsPadding(),
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            // ── The single page plug-point ───────────────────────────────────
            // Dashboard is live; the Pages phase replaces each placeholder with
            // its real screen, threading `onOpenTask` / `onNewTask` as needed.
            when (page) {
                WmsPage.Dashboard -> WmsDashboardScreen(onOpenTask = onOpenTask)
                // My Day — the web `/tasks/agenda` page. The doer's own tasks
                // bucketed by urgency (Overdue / Due Today / Upcoming), each a
                // SectionHeader over its cards; a per-card quick-status pill
                // stands in for the web board's drag-to-reschedule. Reuses the
                // already-cached `/api/mobile/tasks` board (no new endpoint),
                // so it shares state with the Tasks tab and paints instantly.
                // Its @HiltViewModel scopes to this shell's back-stack entry.
                WmsPage.MyDay -> WmsMyDayScreen(onOpenTask = onOpenTask)
                // Tasks — the web `/tasks` page. The web-parity S6 list screen
                // (counted All/Pending/Overdue/Done chips, #no·title·client·subject
                // cards, StatusPill + due phrase, New task) plugs in here. Its
                // @HiltViewModel scopes to this shell's back-stack entry, so the
                // board survives a pill round-trip and shares cache with Dashboard.
                // No deep-link filter when reached via the pill (starts on All).
                WmsPage.Tasks -> TaskListScreen(
                    filter = null,
                    onOpenTask = onOpenTask,
                    onNewTask = onNewTask,
                )
                // Kanban — the web `/tasks/kanban` status board. The read-only,
                // horizontally-scrolling rail of status columns (server label +
                // mono count header, task cards with overdue keyline) plugs in
                // content-only; the shell owns the status-bar inset and the pill
                // nav. Its @HiltViewModel scopes to this shell's back-stack
                // entry, so the board survives a pill round-trip.
                WmsPage.Kanban -> WmsKanbanScreen(onOpenTask = onOpenTask)
                // Projects — the web `/projects` overview. The read-only
                // completion screen (overview stats + per-project cards with a
                // linked-task meter) plugs in here content-only; the shell owns
                // the status-bar inset and the pill nav. Its @HiltViewModel
                // scopes to this shell's back-stack entry, so the tree survives
                // a pill round-trip.
                WmsPage.Projects -> WmsProjectsScreen()
                // Weekly Goals — the web `/weekly-goals` board. The read-only,
                // owner-scoped per-week card list (week pager + weighted-score /
                // weight-budget summary; each card's client·subject eyebrow, the
                // TARGET as title, weight, target date, StatusPill and effective
                // %Done bar) plugs in content-only; the shell owns the status-bar
                // inset. Its @HiltViewModel scopes to this shell's back-stack
                // entry, so the board survives a pill round-trip.
                WmsPage.WeeklyGoals -> WmsWeeklyGoalsScreen()
                // Team — the web `/weekly-goals/team` "Team performance" page.
                // The viewer's A-to-Z scoped roster (self → downline → all) as a
                // four-tile summary strip over per-member cards (status, goal
                // score, workload/DCC/training metrics, in/out) plugs in here
                // content-only; the shell owns the status-bar inset and the pill
                // nav. Its @HiltViewModel scopes to this shell's back-stack
                // entry, so the board survives a pill round-trip.
                WmsPage.Team -> WmsTeamScreen()
                // Daily Checklist — the web `/daily-checklist` page (DayLedger).
                // Today's committed items (assigned tasks live, then personal),
                // the carry-forward strip for unfinished earlier-day items, and
                // the "pull from weekly goals" rail plug in here content-only;
                // the shell owns the status-bar inset and the pill nav. Its
                // @HiltViewModel scopes to this shell's back-stack entry, so the
                // board survives a pill round-trip.
                WmsPage.DailyChecklist -> DailyChecklistScreen()
            }
        }

        WmsPillBar(
            selected = page,
            onSelect = { page = it },
            onBackToHub = onBackToHub,
        )
    }
}

/**
 * Placeholder for a WMS page not yet ported. Present and honest, calm not cute —
 * the Pages phase replaces the matching `when` branch in [WmsShell]. Fills the
 * page area so the pill bar never jumps.
 */
@Composable
private fun WmsPagePlaceholder(page: WmsPage, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        EmptyState(
            headline = page.label,
            body = "This WMS page plugs in here.",
        )
    }
}

// ─── The docked pill bar ────────────────────────────────────────────────────────

/**
 * The horizontal, scrollable WMS pill bar. A leading "Hub" back pill, then the
 * eight WMS page pills in nav order. Selected pill = filled `primary`; the rest
 * are `primary`-tinted outline pills. Docks above the gesture inset.
 */
@Composable
private fun WmsPillBar(
    selected: WmsPage,
    onSelect: (WmsPage) -> Unit,
    onBackToHub: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(tokens.surface),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(AltusDimens.hairline)
                .background(tokens.hairline),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        ) {
            HubBackPill(onClick = onBackToHub)
            WmsPage.entries.forEach { entry ->
                WmsPill(
                    label = entry.label,
                    selected = entry == selected,
                    onClick = { onSelect(entry) },
                )
            }
        }
    }
}

/** The leading "Hub" affordance — a quiet outline pill that pops back to the hub. */
@Composable
private fun HubBackPill(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .heightIn(min = PILL_HEIGHT)
            .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill)
            .tapSettleClickable(withRipple = true, onClickLabel = "Back to Hub", onClick = onClick)
            .padding(horizontal = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        Icon(
            imageVector = WmsShellIcons.ArrowLeft,
            contentDescription = null,
            tint = scheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = "Hub",
            style = AltusType.label,
            color = scheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

/** One WMS page pill: filled `primary` when active, `primary`-tinted outline otherwise. */
@Composable
private fun WmsPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val springSpec = spring<Color>(dampingRatio = 0.85f, stiffness = 500f)
    val container by animateColorAsState(
        targetValue = if (selected) scheme.primary else Color.Transparent,
        animationSpec = springSpec,
        label = "WmsPillContainer",
    )
    val content by animateColorAsState(
        targetValue = if (selected) scheme.onPrimary else scheme.primary,
        animationSpec = springSpec,
        label = "WmsPillContent",
    )
    Row(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .heightIn(min = PILL_HEIGHT)
            .background(container)
            .then(
                if (selected) {
                    Modifier
                } else {
                    Modifier.border(AltusDimens.hairline, scheme.primary.copy(alpha = OUTLINE_ALPHA), AltusShapeTokens.pill)
                },
            )
            .tapSettleClickable(withRipple = true, onClickLabel = label, role = Role.Tab, onClick = onClick)
            .padding(horizontal = AltusDimens.space4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = AltusType.label, color = content, maxLines = 1)
    }
}

private val PILL_HEIGHT = 40.dp
private const val OUTLINE_ALPHA = 0.40f

// ─── Screen-local iconography (Lucide, 2dp stroke, round caps) ──────────────────

private object WmsShellIcons {
    val ArrowLeft: ImageVector by lazy { lucide("WmsShell.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

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
