package com.altuscorp.altus.feature.hub

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusTopAppBar
import com.altuscorp.altus.ui.designsystem.EmptyState
import com.altuscorp.altus.ui.designsystem.SectionHeader
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * A per-workspace module list — the landing for the front-door workspaces whose
 * native module screens don't exist yet (Sales, Marketing, Training, Accounts,
 * Admin). It lists that workspace's modules as rows carrying the workspace's
 * colour keyline, each with a quiet "SOON" pill: present and honest, not yet
 * pressable (the S8 roadmap treatment). Purely presentational — no ViewModel.
 */
@Composable
fun WorkspaceScreen(
    workspaceSlug: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenModule: (target: String) -> Unit = {},
) {
    val tokens = AltusTheme.tokens
    val workspace = HubWorkspace.fromSlug(workspaceSlug)
    val modules = workspace?.let(::modulesFor) ?: persistentListOf()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.canvas),
    ) {
        AltusTopAppBar(
            title = workspace?.label ?: "Workspace",
            navigationIcon = WorkspaceIcons.ArrowLeft,
            onNavigationClick = onBack,
            navigationContentDescription = "Back",
        )

        if (workspace == null || modules.isEmpty()) {
            EmptyState(
                headline = "Nothing here yet",
                body = "This workspace's modules are on the way.",
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            val accent = workspace.accent(tokens).base

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = AltusDimens.screenGutter,
                    end = AltusDimens.screenGutter,
                    bottom = AltusDimens.space12,
                ),
                verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
            ) {
                item(key = "intro", contentType = "intro") {
                    Column(modifier = Modifier.padding(bottom = AltusDimens.space1)) {
                        Text(
                            text = workspace.tagline,
                            style = AltusType.body,
                            color = tokens.ink400,
                        )
                        Spacer(Modifier.height(AltusDimens.space4))
                        SectionHeader(title = "Modules", count = modules.size.toString())
                    }
                }

                items(
                    items = modules,
                    key = { it.title },
                    contentType = { "module-row" },
                ) { module ->
                    ModuleRowCard(module = module, accent = accent, onOpenModule = onOpenModule)
                }
            }
        }
    }
}

/**
 * One module row: colour keyline, title + subtitle. A module with a [target] is
 * a live native screen — the card is pressable and shows a chevron; a module
 * without one is on the roadmap and shows the quiet inert "SOON" pill.
 */
@Composable
private fun ModuleRowCard(
    module: WorkspaceModule,
    accent: Color,
    onOpenModule: (target: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val target = module.target
    AltusCard(
        modifier = modifier.fillMaxWidth(),
        onClick = if (target != null) ({ onOpenModule(target) }) else null,
        accentKeyline = accent,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = module.title,
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = module.subtitle,
                    style = AltusType.body,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(AltusDimens.space3))
            if (target != null) {
                Icon(
                    imageVector = WorkspaceIcons.ChevronRight,
                    contentDescription = null,
                    tint = AltusTheme.tokens.ink400,
                    modifier = Modifier.size(20.dp),
                )
            } else {
                SoonPill()
            }
        }
    }
}

/** Quiet "SOON" pill — sunken bed, meta ink, never a control. */
@Composable
private fun SoonPill(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Box(
        modifier = modifier
            .clip(AltusShapeTokens.pill)
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.space2, vertical = AltusDimens.space1),
    ) {
        Text(text = "SOON", style = AltusType.caption, color = tokens.ink400)
    }
}

// ─── Per-workspace module catalogue (mirror of the web workspace nav) ────────

/** One module row inside a workspace. [target] non-null = a live native screen
 *  the NavHost can open (see WorkspaceScreen's onOpenModule); null = roadmap. */
private data class WorkspaceModule(
    val title: String,
    val subtitle: String,
    val target: String? = null,
) {
    companion object {
        /** onOpenModule target for the WMS Projects overview. */
        const val TARGET_PROJECTS = "projects"

        /** onOpenModule target for the WMS Team agenda ("My Day"). */
        const val TARGET_TEAM = "team"

        /** onOpenModule target for the WMS Weekly Goals board. */
        const val TARGET_WEEKLY_GOALS = "weekly-goals"

        /** onOpenModule target for the WMS Kanban status board. */
        const val TARGET_KANBAN = "kanban"

        /** onOpenModule target for the Employees Performance (PMS score) screen. */
        const val TARGET_PERFORMANCE = "performance"

        /** onOpenModule target for the Employees HR attendance record. */
        const val TARGET_HR_RECORD = "hr-record"

        /** onOpenModule target for the Employees Signals (recognition/promotion) feed. */
        const val TARGET_SIGNALS = "signals"

        /** onOpenModule target for the Employees Salary (own payslip) screen. */
        const val TARGET_SALARY = "salary"

        /** onOpenModule target for the Employees Overtime (own ledger) screen. */
        const val TARGET_OVERTIME = "overtime"

        /** onOpenModule target for the Sales People Gives (referral network) screen. */
        const val TARGET_PEOPLE_GIVES = "people-gives"

        /** onOpenModule target for the Admin · Accounts front door (section registry). */
        const val TARGET_ACCOUNTS = "accounts"
    }
}

private fun modulesFor(workspace: HubWorkspace): ImmutableList<WorkspaceModule> = when (workspace) {
    HubWorkspace.Sales -> persistentListOf(
        WorkspaceModule("Outstanding", "Receivables tracker & collections.", target = "outstanding"),
        WorkspaceModule("Participant Breakthrough", "Capture a participant's breakthrough.", target = "breakthrough"),
        WorkspaceModule("Record a Reference", "Log a business reference for sales.", target = "reference"),
        WorkspaceModule("People Gives", "The referral database.", target = WorkspaceModule.TARGET_PEOPLE_GIVES),
        WorkspaceModule("Ambassadors", "Sales partner intelligence.", target = "ambassadors"),
    )
    HubWorkspace.Marketing -> persistentListOf(
        WorkspaceModule("Index Hub", "Campaign index, reach & lead generation.", target = "index-hub"),
    )
    HubWorkspace.Training -> persistentListOf(
        WorkspaceModule(
            title = "Training Centre",
            subtitle = "Material library, tests & your induction path.",
            target = "training",
        ),
        WorkspaceModule(
            title = "Training Calendar",
            subtitle = "Upcoming & past sessions — trainer, mode & attendance.",
            target = "training-calendar",
        ),
    )
    HubWorkspace.Accounts -> persistentListOf(
        WorkspaceModule(
            title = "Accounts index",
            subtitle = "Every checklist, compliance tracker & master register — one front door.",
            target = WorkspaceModule.TARGET_ACCOUNTS,
        ),
        WorkspaceModule("CA Handover", "The encrypted credentials vault.", target = WorkspaceModule.TARGET_ACCOUNTS),
        WorkspaceModule("Compliance Trackers", "Filings, dues & statutory trackers.", target = WorkspaceModule.TARGET_ACCOUNTS),
    )
    HubWorkspace.Admin -> persistentListOf(
        WorkspaceModule(
            title = "Accounts",
            subtitle = "Accounts totality, compliance, checklists & trackers.",
            target = WorkspaceModule.TARGET_ACCOUNTS,
        ),
    )
    // WMS's hub card lands on the daily Today loop; its deeper modules (like
    // the Projects overview) live here as pressable rows.
    HubWorkspace.Wms -> persistentListOf(
        WorkspaceModule(
            title = "Team agenda",
            subtitle = "My Day — your tasks bucketed by day, overdue first.",
            target = WorkspaceModule.TARGET_TEAM,
        ),
        WorkspaceModule(
            title = "Projects",
            subtitle = "Break work down — projects, milestones & completion.",
            target = WorkspaceModule.TARGET_PROJECTS,
        ),
        WorkspaceModule(
            title = "Weekly goals",
            subtitle = "Your per-week priorities — weighted, scored, %-done.",
            target = WorkspaceModule.TARGET_WEEKLY_GOALS,
        ),
        WorkspaceModule(
            title = "Weekly Goals dashboard",
            subtitle = "Team weekly-score overview — ranked by attainment.",
            target = "wg-dashboard",
        ),
        WorkspaceModule(
            title = "Kanban",
            subtitle = "Your tasks on a status board — grouped into columns.",
            target = WorkspaceModule.TARGET_KANBAN,
        ),
    )
    // Employees' hub card lands on this module list; the 14-day punch ledger
    // stays reachable from the Today hero.
    HubWorkspace.Employees -> persistentListOf(
        WorkspaceModule("Attendance", "Clock in & out — biometric, geofenced punch.", target = "attendance"),
        WorkspaceModule("Daily Compliance (DCC)", "Fill today's KPIs, streaks & leaderboard.", target = "dcc"),
        WorkspaceModule("DCC Dashboard", "Admin: team compliance leaderboard & fill rates.", target = "dcc-dashboard"),
        WorkspaceModule("Att Report", "Admin: the org-wide monthly attendance summary.", target = "att-report"),
        WorkspaceModule("Incentive", "Your incentive earnings, attainment & requests.", target = "incentive"),
        WorkspaceModule("Reimbursements", "Your expense claims — raise, track & settle.", target = "reimbursements"),
        WorkspaceModule(
            title = "Overtime",
            subtitle = "Your logged extra hours — approval status & totals.",
            target = WorkspaceModule.TARGET_OVERTIME,
        ),
        WorkspaceModule(
            title = "Overtime dashboard",
            subtitle = "Admin: team overtime hours, ranked.",
            target = "ot-dashboard",
        ),
        WorkspaceModule(
            title = "Reimbursement dashboard",
            subtitle = "Admin: team claims — approved / pending / paid.",
            target = "reimb-dashboard",
        ),
        WorkspaceModule(
            title = "Salary",
            subtitle = "Your payslip — net pay, breakdown & recent months.",
            target = WorkspaceModule.TARGET_SALARY,
        ),
        WorkspaceModule(
            title = "Performance",
            subtitle = "Your PMS score — the 5-pillar performance summary.",
            target = WorkspaceModule.TARGET_PERFORMANCE,
        ),
        WorkspaceModule(
            title = "Performance Dashboard",
            subtitle = "Manager: team PMS leaderboard, avg score & promo-ready.",
            target = "pms-dashboard",
        ),
        WorkspaceModule(
            title = "HR record",
            subtitle = "Your HR attendance-log record — months, day codes & paid leave.",
            target = WorkspaceModule.TARGET_HR_RECORD,
        ),
        WorkspaceModule(
            title = "360 Review",
            subtitle = "Rate your team, manager & peers this month.",
            target = "review360",
        ),
        WorkspaceModule(
            title = "Signals",
            subtitle = "Recognition & promotion signals raised about you.",
            target = WorkspaceModule.TARGET_SIGNALS,
        ),
    )
}

// ─── Screen-local iconography (§1.7 Lucide, 2dp stroke, round caps) ──────────

private object WorkspaceIcons {
    val ArrowLeft: ImageVector by lazy { lucide("Workspace.ArrowLeft", "M12 19l-7-7 7-7", "M19 12H5") }

    /** lucide `chevron-right` — the pressable-module affordance. */
    val ChevronRight: ImageVector by lazy { lucide("Workspace.ChevronRight", "M9 18l6-6-6-6") }

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
                stroke = SolidColor(Color.Black), // overridden by Icon tint
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return builder.build()
    }
}
