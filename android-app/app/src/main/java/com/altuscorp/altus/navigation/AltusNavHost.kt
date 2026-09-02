@file:OptIn(ExperimentalSharedTransitionApi::class)

package com.altuscorp.altus.navigation

import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.core.util.Consumer
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDeepLinkRequest
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navDeepLink
import androidx.navigation.toRoute
import com.altuscorp.altus.feature.accounts.AccountsDueDatesScreen
import com.altuscorp.altus.feature.accounts.AccountsScreen
import com.altuscorp.altus.feature.accounts.AccountsSectionScreen
import com.altuscorp.altus.feature.ambassadors.AmbassadorsScreen
import com.altuscorp.altus.feature.attendance.AttendanceHistoryScreen
import com.altuscorp.altus.feature.dcc.DccScreen
import com.altuscorp.altus.feature.gate.DailyGateScreen
import com.altuscorp.altus.feature.goals.GoalsFillScreen
import com.altuscorp.altus.feature.hub.HubScreen
import com.altuscorp.altus.feature.hub.HubWorkspace
import com.altuscorp.altus.feature.hub.WorkspaceScreen
import com.altuscorp.altus.feature.incentive.IncentiveScreen
import com.altuscorp.altus.feature.outstanding.OutstandingScreen
import com.altuscorp.altus.feature.overtime.OvertimeScreen
import com.altuscorp.altus.feature.peoplegives.PeopleGivesScreen
import com.altuscorp.altus.feature.reimbursements.ReimbursementsScreen
import com.altuscorp.altus.feature.hrrecord.HrRecordScreen
import com.altuscorp.altus.feature.inbox.InboxScreen
import com.altuscorp.altus.feature.login.EnrollmentGateScreen
import com.altuscorp.altus.feature.login.LoginScreen
import com.altuscorp.altus.feature.performance.PerformanceScreen
import com.altuscorp.altus.feature.plan.PlanScreen
import com.altuscorp.altus.feature.profile.ProfileScreen
import com.altuscorp.altus.feature.kanban.KanbanScreen
import com.altuscorp.altus.feature.projects.ProjectsScreen
import com.altuscorp.altus.feature.weeklygoals.WeeklyGoalsScreen
import com.altuscorp.altus.feature.punch.PunchScreen
import com.altuscorp.altus.feature.attreport.AttReportScreen
import com.altuscorp.altus.feature.indexhub.IndexHubScreen
import com.altuscorp.altus.feature.moduleform.ModuleFormScreen
import com.altuscorp.altus.feature.teamdashboard.TeamDashboardScreen
import com.altuscorp.altus.feature.wgdashboard.WgDashboardScreen
import com.altuscorp.altus.feature.review360.Review360Screen
import com.altuscorp.altus.feature.salary.SalaryScreen
import com.altuscorp.altus.feature.signals.SignalsScreen
import com.altuscorp.altus.feature.tasks.detail.TaskDetailScreen
import com.altuscorp.altus.feature.tasks.list.TaskListScreen
import com.altuscorp.altus.feature.training.TrainingScreen
import com.altuscorp.altus.feature.tasks.newtask.NewTaskScreen
import com.altuscorp.altus.feature.team.TeamScreen
import com.altuscorp.altus.feature.today.TodayScreen
import com.altuscorp.altus.feature.wms.WmsShell
import timber.log.Timber

/**
 * The [SharedTransitionScope] hoisted at NavHost level. Feature screens read it
 * (together with [LocalNavAnimatedVisibilityScope]) to run `sharedBounds`
 * card→screen morphs with keys `task-{id}` and `module-{slug}` (Part 3).
 */
val LocalSharedTransitionScope = staticCompositionLocalOf<SharedTransitionScope?> { null }

/**
 * The [AnimatedVisibilityScope] of the current navigation destination —
 * the second half of every `sharedBounds` call.
 */
val LocalNavAnimatedVisibilityScope = staticCompositionLocalOf<AnimatedVisibilityScope?> { null }

// ─── Motion (Part 1.5): push-forward / tab-cross / sheet-rise ────────────────
// Navigation transition lambdas are not composable, so the named specs live
// here as the navigation layer's rendition of the motion tokens.

private val EmphasizedDecelerate = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)
private val EmphasizedAccelerate = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)

private const val PUSH_ENTER_MS = 260
private const val PUSH_EXIT_MS = 200
private const val TAB_ENTER_MS = 220
private const val TAB_EXIT_MS = 150
private const val PUSH_SLIDE_DP = 24

/**
 * Root navigation host (Part 3, the three-surface rule):
 *
 * 1. **Destinations** — four state-preserving tabs (Today · Tasks · Fill · You)
 *    via `saveState`/`restoreState`, swapped with the `tab-cross` transition.
 * 2. **Drill-downs** — pushed screens with `push-forward`; card→screen shared
 *    elements ride [LocalSharedTransitionScope] + [LocalNavAnimatedVisibilityScope].
 * 3. **Decisions** — bottom sheets owned by the screens themselves.
 *
 * Deep links: altus://task/{id}, altus://punch, altus://dcc?date=,
 * altus://goals-fill, altus://inbox — wired below and forwarded from
 * `onNewIntent` (the activity is `singleTask`).
 *
 * @param tasksBadgeCount mono pending count for the Tasks tab.
 * @param dayStrip the persistent Day Strip slot, shown above the bottom bar on
 *   tab roots while the day is open (the Today layer supplies it).
 */
@Composable
fun AltusNavHost(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    tasksBadgeCount: Int = 0,
    dayStrip: (@Composable () -> Unit)? = null,
) {
    // Forward deep links delivered to the live singleTask activity.
    val activity = LocalContext.current as? ComponentActivity
    DisposableEffect(activity, navController) {
        val listener = Consumer<Intent> { intent -> navController.handleDeepLink(intent) }
        activity?.addOnNewIntentListener(listener)
        onDispose { activity?.removeOnNewIntentListener(listener) }
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val onTabRoot = currentDestination.isTopLevelRoot()

    val density = LocalDensity.current
    val pushSlidePx = with(density) { PUSH_SLIDE_DP.dp.roundToPx() }

    SharedTransitionLayout(modifier = modifier) {
        CompositionLocalProvider(LocalSharedTransitionScope provides this) {
            AltusScaffold(
                bottomBar = {
                    if (onTabRoot) {
                        AltusBottomBar(
                            currentDestination = currentDestination,
                            onNavigateToDestination = navController::navigateToTab,
                            tasksBadgeCount = tasksBadgeCount,
                        )
                    }
                },
                dayStrip = if (onTabRoot) dayStrip else null,
            ) { padding ->
                NavHost(
                    navController = navController,
                    startDestination = LoginRoute,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding),
                    enterTransition = { altusEnter(pushSlidePx) },
                    exitTransition = { altusExit() },
                    popEnterTransition = { altusPopEnter() },
                    popExitTransition = { altusPopExit(pushSlidePx) },
                    sizeTransform = { SizeTransform(clip = false) },
                ) {
                    authGraph(navController)
                    hubGraph(navController)
                    todayGraph(navController)
                    tasksGraph(navController)
                    fillGraph(navController)
                    youGraph(navController)
                }
            }
        }
    }
}

// ─── Graphs ──────────────────────────────────────────────────────────────────

private fun androidx.navigation.NavGraphBuilder.authGraph(navController: NavHostController) {
    composable<LoginRoute> {
        WithNavScope {
            LoginScreen(
                onSignedIn = {
                    // The unified daily gate is the FIRST stop after a successful
                    // sign-in — it walls the app until both morning rituals clear
                    // (or fails open). It enters HubGraph itself once satisfied.
                    navController.navigate(DailyGateRoute) {
                        popUpTo<LoginRoute> { inclusive = true }
                    }
                },
                onEnrollmentBlocked = { kind ->
                    navController.navigate(EnrollmentGateRoute(kind)) {
                        popUpTo<LoginRoute> { inclusive = true }
                    }
                },
            )
        }
    }

    composable<EnrollmentGateRoute> { entry ->
        val route = entry.toRoute<EnrollmentGateRoute>()
        WithNavScope {
            EnrollmentGateScreen(
                kind = route.kind,
                onSignOut = {
                    navController.navigate(LoginRoute) {
                        popUpTo<EnrollmentGateRoute> { inclusive = true }
                    }
                },
            )
        }
    }

    // THE UNIFIED DAILY GATE — plan-your-day + DCC in one scroll; enters the app
    // (HubGraph) once both clear, or immediately on fail-open. No bottom bar:
    // it lives outside the tab graphs, so `isTopLevelRoot()` stays false here.
    composable<DailyGateRoute> {
        WithNavScope {
            DailyGateScreen(
                onEnter = {
                    navController.navigate(HubGraph) {
                        popUpTo<DailyGateRoute> { inclusive = true }
                    }
                },
            )
        }
    }
}

// ─── Hub stack: the workspace front door (home tab) → per-workspace lists ────

private fun androidx.navigation.NavGraphBuilder.hubGraph(navController: NavHostController) {
    navigation<HubGraph>(startDestination = HubRoute) {
        composable<HubRoute> {
            WithNavScope {
                HubScreen(
                    onOpenWorkspace = navController::navigateToWorkspaceLanding,
                )
            }
        }

        // WMS workspace shell — the WMS hub card lands here (Dashboard selected).
        // The pill bar swaps pages in-place; task taps route across graphs to
        // the shared Task detail / New-task destinations.
        composable<WmsShellRoute> {
            WithNavScope {
                WmsShell(
                    onBackToHub = { navController.popBackStack() },
                    onOpenTask = { id -> navController.navigate(TaskDetailRoute(id)) },
                    onNewTask = { navController.navigate(NewTaskRoute) },
                )
            }
        }

        composable<WorkspaceRoute> { entry ->
            val route = entry.toRoute<WorkspaceRoute>()
            WithNavScope {
                WorkspaceScreen(
                    workspaceSlug = route.workspace,
                    onBack = { navController.popBackStack() },
                    onOpenModule = { target ->
                        when (target) {
                            "attendance" -> navController.navigate(PunchRoute)
                            "projects" -> navController.navigate(ProjectsRoute)
                            "outstanding" -> navController.navigate(OutstandingRoute)
                            "people-gives" -> navController.navigate(PeopleGivesRoute)
                            "ambassadors" -> navController.navigate(AmbassadorsRoute)
                            "reference" -> navController.navigate(ModuleFormRoute("reference"))
                            "breakthrough" -> navController.navigate(ModuleFormRoute("breakthrough"))
                            "index-hub" -> navController.navigate(IndexHubRoute)
                            "wg-dashboard" -> navController.navigate(WgDashboardRoute)
                            "ot-dashboard" -> navController.navigate(TeamDashboardRoute("overtime"))
                            "reimb-dashboard" -> navController.navigate(TeamDashboardRoute("reimbursements"))
                            "dcc-dashboard" -> navController.navigate(TeamDashboardRoute("dcc"))
                            "pms-dashboard" -> navController.navigate(TeamDashboardRoute("pms"))
                            "training-calendar" -> navController.navigate(AccountsSectionRoute(slug = "training-calendar", api = "section", eyebrow = "TRAINING"))
                            "incentive" -> navController.navigate(IncentiveRoute)
                            "reimbursements" -> navController.navigate(ReimbursementsRoute)
                            "overtime" -> navController.navigate(OvertimeRoute)
                            "kanban" -> navController.navigate(KanbanRoute)
                            "team" -> navController.navigate(TeamRoute)
                            "weekly-goals" -> navController.navigate(WeeklyGoalsBoardRoute)
                            "hr-record" -> navController.navigate(HrRecordRoute)
                            "salary" -> navController.navigate(SalaryRoute)
                            "review360" -> navController.navigate(Review360Route)
                            "att-report" -> navController.navigate(AttReportRoute)
                            "dcc" -> navController.navigateToTab(TopLevelDestination.FILL)
                            "signals" -> navController.navigate(SignalsRoute)
                            "performance" -> navController.navigate(PerformanceRoute)
                            "accounts" -> navController.navigate(AccountsRoute)
                            "training" -> navController.navigate(TrainingRoute)
                        }
                    },
                )
            }
        }

        // WMS module — the read-only Projects overview (list + completion).
        composable<ProjectsRoute> {
            WithNavScope {
                ProjectsScreen(onBack = { navController.popBackStack() })
            }
        }

        // Admin · Accounts module — the read-only Accounts front door (registry).
        composable<AccountsRoute> {
            WithNavScope {
                AccountsScreen(
                    onBack = { navController.popBackStack() },
                    onOpenSection = { slug ->
                        // Due Dates has a bespoke screen; the register sections share the
                        // generic AccountsSectionScreen; the rest stay inert.
                        when (slug) {
                            "due-dates" -> navController.navigate(AccountsDueDatesRoute)
                            // Everything else routes to the generic register/section screen;
                            // it shows a clean "best on web" state for any slug the endpoint 404s.
                            else -> navController.navigate(AccountsSectionRoute(slug))
                        }
                    },
                )
            }
        }

        // Admin · Accounts → Due Dates Checklist (read-only section).
        composable<AccountsDueDatesRoute> {
            WithNavScope {
                AccountsDueDatesScreen(onBack = { navController.popBackStack() })
            }
        }

        // Admin · Accounts → generic register section (Vasa · Shares · IT · SIP · Bank).
        composable<AccountsSectionRoute> {
            WithNavScope {
                AccountsSectionScreen(onBack = { navController.popBackStack() })
            }
        }

        // Sales module — the read-only receivables dashboard (Outstanding).
        composable<OutstandingRoute> {
            WithNavScope {
                OutstandingScreen(onBack = { navController.popBackStack() })
            }
        }

        // Sales module — the read-only People Gives referral network.
        composable<PeopleGivesRoute> {
            WithNavScope {
                PeopleGivesScreen(onBack = { navController.popBackStack() })
            }
        }

        // Sales module — the read-only Ambassadors "Partner Intelligence" dashboard.
        composable<AmbassadorsRoute> {
            WithNavScope {
                AmbassadorsScreen(onBack = { navController.popBackStack() })
            }
        }

        // Training module — the material library + the viewer's induction path.
        composable<TrainingRoute> {
            WithNavScope {
                TrainingScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the signed-in user's incentive analytics + requests.
        composable<IncentiveRoute> {
            WithNavScope {
                IncentiveScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the signed-in user's own reimbursement claims (read-only).
        composable<ReimbursementsRoute> {
            WithNavScope {
                ReimbursementsScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the signed-in user's own overtime ledger (read-only).
        composable<OvertimeRoute> {
            WithNavScope {
                OvertimeScreen(onBack = { navController.popBackStack() })
            }
        }

        // WMS module — the read-only Weekly Goals board (per-week goal cards).
        composable<WeeklyGoalsBoardRoute> {
            WithNavScope {
                WeeklyGoalsScreen(onBack = { navController.popBackStack() })
            }
        }

        // WMS module — the read-only, owner-scoped Kanban status board.
        composable<KanbanRoute> {
            WithNavScope {
                KanbanScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTask = { id -> navController.navigate(TaskDetailRoute(id)) },
                )
            }
        }

        // WMS module — Team performance: the viewer's A-to-Z scoped roster
        // (self → downline → all) with each member's live performance snapshot.
        composable<TeamRoute> {
            WithNavScope {
                TeamScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTask = { id -> navController.navigate(TaskDetailRoute(id)) },
                )
            }
        }

        // Employees module — the read-only HR "Attendance log" sheet record.
        composable<HrRecordRoute> {
            WithNavScope {
                HrRecordScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the signed-in user's own payslip (net pay + breakdown).
        composable<SalaryRoute> {
            WithNavScope {
                SalaryScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the signed-in user's own recognition + promotion
        // signals feed (read-only mirror of the admin `/pms/signals` console).
        composable<SignalsRoute> {
            WithNavScope {
                SignalsScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the read-only Monthly 360 review surface.
        composable<Review360Route> {
            WithNavScope {
                Review360Screen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module (admin) — the org-wide monthly attendance report.
        composable<AttReportRoute> {
            WithNavScope {
                AttReportScreen(onBack = { navController.popBackStack() })
            }
        }

        // Sales module — form-driven modules (Reference · Participant Breakthrough).
        composable<ModuleFormRoute> {
            WithNavScope {
                ModuleFormScreen(onBack = { navController.popBackStack() })
            }
        }

        // Marketing module — the Index Hub link directory.
        composable<IndexHubRoute> {
            WithNavScope {
                IndexHubScreen(onBack = { navController.popBackStack() })
            }
        }

        // WMS module — the Weekly Goals team-score dashboard.
        composable<WgDashboardRoute> {
            WithNavScope {
                WgDashboardScreen(onBack = { navController.popBackStack() })
            }
        }

        // Admin team dashboards (overtime · reimbursements).
        composable<TeamDashboardRoute> {
            WithNavScope {
                TeamDashboardScreen(onBack = { navController.popBackStack() })
            }
        }

        // Employees module — the signed-in user's own 5-pillar PMS score.
        composable<PerformanceRoute> {
            WithNavScope {
                PerformanceScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}

private fun androidx.navigation.NavGraphBuilder.todayGraph(navController: NavHostController) {
    navigation<TodayGraph>(startDestination = TodayRoute) {
        composable<TodayRoute> {
            WithNavScope {
                TodayScreen(
                    onOpenPunch = { navController.navigate(PunchRoute) },
                    onOpenPlan = { navController.navigate(PlanYourDayRoute) },
                    onOpenGoalsFill = { navController.navigate(GoalsFillRoute) },
                    onOpenHub = { navController.navigateToTab(TopLevelDestination.HUB) },
                    onOpenAttendanceHistory = { navController.navigate(AttendanceHistoryRoute) },
                    onOpenInbox = { navController.navigate(InboxRoute) },
                    onOpenProfile = { navController.navigateToTab(TopLevelDestination.YOU) },
                    onOpenTasks = { filter ->
                        if (filter == null) {
                            navController.navigateToTab(TopLevelDestination.TASKS)
                        } else {
                            navController.navigate(TaskListRoute(filter))
                        }
                    },
                    onOpenDcc = { navController.navigateToTab(TopLevelDestination.FILL) },
                )
            }
        }

        // S3 punch — full-screen modal with the sheet-rise entrance and a
        // slide-down dismissal; gates route out and pop back to a re-armed control.
        composable<PunchRoute>(
            deepLinks = listOf(navDeepLink<PunchRoute>(basePath = DeepLinks.PUNCH)),
            enterTransition = {
                slideInVertically(
                    animationSpec = spring(
                        dampingRatio = 0.85f,
                        stiffness = 380f,
                        visibilityThreshold = IntOffset.VisibilityThreshold,
                    ),
                    initialOffsetY = { fullHeight -> fullHeight },
                )
            },
            popEnterTransition = { fadeIn(tween(PUSH_ENTER_MS, easing = EmphasizedDecelerate)) },
            popExitTransition = {
                slideOutVertically(
                    animationSpec = tween(PUSH_EXIT_MS, easing = EmphasizedAccelerate),
                    targetOffsetY = { fullHeight -> fullHeight },
                )
            },
        ) {
            WithNavScope {
                PunchScreen(
                    onDismiss = { navController.popBackStack() },
                    onRoutePlan = { navController.navigate(PlanYourDayRoute) },
                    onRouteDcc = { navController.navigate(DccRoute()) },
                    onRouteGoals = { navController.navigate(GoalsFillRoute) },
                )
            }
        }

        composable<PlanYourDayRoute> {
            WithNavScope {
                PlanScreen(onBack = { navController.popBackStack() })
            }
        }

        composable<GoalsFillRoute>(
            deepLinks = listOf(navDeepLink<GoalsFillRoute>(basePath = DeepLinks.GOALS_FILL)),
        ) {
            WithNavScope {
                GoalsFillScreen(onBack = { navController.popBackStack() })
            }
        }

        composable<AttendanceHistoryRoute> {
            WithNavScope {
                AttendanceHistoryScreen(onBack = { navController.popBackStack() })
            }
        }

        composable<InboxRoute>(
            deepLinks = listOf(navDeepLink<InboxRoute>(basePath = DeepLinks.INBOX)),
        ) {
            WithNavScope {
                InboxScreen(
                    onBack = { navController.popBackStack() },
                    onOpenDeepLink = navController::navigateToAltusUri,
                )
            }
        }
    }
}

private fun androidx.navigation.NavGraphBuilder.tasksGraph(navController: NavHostController) {
    navigation<TasksGraph>(startDestination = TaskListRoute()) {
        composable<TaskListRoute> { entry ->
            val route = entry.toRoute<TaskListRoute>()
            WithNavScope {
                TaskListScreen(
                    filter = route.filter,
                    onOpenTask = { id -> navController.navigate(TaskDetailRoute(id)) },
                    onNewTask = { navController.navigate(NewTaskRoute) },
                )
            }
        }

        composable<TaskDetailRoute>(
            deepLinks = listOf(navDeepLink<TaskDetailRoute>(basePath = DeepLinks.TASK_BASE)),
        ) { entry ->
            val route = entry.toRoute<TaskDetailRoute>()
            WithNavScope {
                TaskDetailScreen(
                    taskId = route.id,
                    onBack = { navController.popBackStack() },
                )
            }
        }

        composable<NewTaskRoute> {
            WithNavScope {
                NewTaskScreen(
                    onBack = { navController.popBackStack() },
                    onCreated = { taskId ->
                        navController.navigate(TaskDetailRoute(taskId)) {
                            popUpTo<NewTaskRoute> { inclusive = true }
                        }
                    },
                )
            }
        }
    }
}

private fun androidx.navigation.NavGraphBuilder.fillGraph(navController: NavHostController) {
    navigation<FillGraph>(startDestination = DccRoute()) {
        composable<DccRoute>(
            deepLinks = listOf(navDeepLink<DccRoute>(basePath = DeepLinks.DCC_BASE)),
        ) { entry ->
            val route = entry.toRoute<DccRoute>()
            WithNavScope {
                DccScreen(
                    initialDate = route.date,
                    onOpenPunch = { navController.navigate(PunchRoute) },
                )
            }
        }
    }
}

private fun androidx.navigation.NavGraphBuilder.youGraph(navController: NavHostController) {
    navigation<YouGraph>(startDestination = ProfileRoute) {
        composable<ProfileRoute> {
            WithNavScope {
                ProfileScreen(
                    onSignedOut = {
                        navController.navigate(LoginRoute) {
                            popUpTo(navController.graph.id) { inclusive = true }
                        }
                    },
                )
            }
        }
    }
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

/**
 * State-preserving tab switch: pop back to the Hub root (the home tab) saving
 * each tab's stack, single-top, restoring the target tab's saved stack.
 */
private fun NavHostController.navigateToTab(destination: TopLevelDestination) {
    navigate(destination.graph) {
        popUpTo<HubRoute> { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Open a workspace card's landing (mirrors `WORKSPACE_LANDING`): WMS drops into
 * its workspace shell (Dashboard selected, the pill bar swapping pages);
 * every other workspace opens its per-workspace module list. The landings live
 * in the Hub graph and resolve by route across graphs.
 */
private fun NavHostController.navigateToWorkspaceLanding(workspace: HubWorkspace) {
    when (workspace) {
        HubWorkspace.Wms -> navigate(WmsShellRoute)
        HubWorkspace.Employees,
        HubWorkspace.Sales,
        HubWorkspace.Marketing,
        HubWorkspace.Training,
        HubWorkspace.Accounts,
        HubWorkspace.Admin,
        -> navigate(WorkspaceRoute(workspace.slug))
    }
}

/** Resolve an altus:// URI (e.g. from an inbox row) against the graph. */
private fun NavHostController.navigateToAltusUri(uri: String) {
    val request = NavDeepLinkRequest.Builder.fromUri(uri.toUri()).build()
    runCatching { navigate(request) }
        .onFailure { Timber.w(it, "Unresolvable deep link: %s", uri) }
}

/** Provides the destination's [AnimatedVisibilityScope] for sharedBounds. */
@Composable
private fun AnimatedVisibilityScope.WithNavScope(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalNavAnimatedVisibilityScope provides this, content = content)
}

// ─── Destination classification ──────────────────────────────────────────────

private fun NavDestination?.isTopLevelRoot(): Boolean = this != null && (
    hasRoute<HubRoute>() ||
        hasRoute<TaskListRoute>() ||
        hasRoute<DccRoute>() ||
        hasRoute<ProfileRoute>()
    )

private fun NavDestination?.topLevelIndex(): Int = when {
    this == null -> -1
    hasRoute<HubRoute>() -> 0
    hasRoute<TaskListRoute>() -> 1
    hasRoute<DccRoute>() -> 2
    hasRoute<ProfileRoute>() -> 3
    else -> -1
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.isTabSwap(): Boolean =
    initialState.destination.isTopLevelRoot() && targetState.destination.isTopLevelRoot()

// ─── Transition builders ─────────────────────────────────────────────────────

/** `tab-cross` between tab roots (direction-aware); `push-forward` otherwise. */
private fun AnimatedContentTransitionScope<NavBackStackEntry>.altusEnter(
    pushSlidePx: Int,
): EnterTransition = if (isTabSwap()) {
    val forward =
        targetState.destination.topLevelIndex() >= initialState.destination.topLevelIndex()
    fadeIn(tween(TAB_ENTER_MS)) +
        slideInHorizontally(tween(TAB_ENTER_MS, easing = EmphasizedDecelerate)) { fullWidth ->
            if (forward) fullWidth / 4 else -fullWidth / 4
        }
} else {
    fadeIn(tween(PUSH_ENTER_MS, easing = EmphasizedDecelerate)) +
        slideInHorizontally(tween(PUSH_ENTER_MS, easing = EmphasizedDecelerate)) { pushSlidePx }
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.altusExit(): ExitTransition =
    if (isTabSwap()) {
        fadeOut(tween(TAB_EXIT_MS))
    } else {
        fadeOut(tween(PUSH_EXIT_MS, easing = EmphasizedAccelerate))
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.altusPopEnter(): EnterTransition =
    fadeIn(tween(PUSH_ENTER_MS, easing = EmphasizedDecelerate))

private fun AnimatedContentTransitionScope<NavBackStackEntry>.altusPopExit(
    pushSlidePx: Int,
): ExitTransition =
    fadeOut(tween(PUSH_EXIT_MS, easing = EmphasizedAccelerate)) +
        slideOutHorizontally(tween(PUSH_EXIT_MS, easing = EmphasizedAccelerate)) { pushSlidePx }
