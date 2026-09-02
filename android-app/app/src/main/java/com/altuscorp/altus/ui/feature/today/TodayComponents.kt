package com.altuscorp.altus.feature.today

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.AltusDeepCard
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.DayRing
import com.altuscorp.altus.ui.designsystem.SkeletonBox
import com.altuscorp.altus.ui.designsystem.SkeletonCircle
import com.altuscorp.altus.ui.designsystem.SkeletonLine
import com.altuscorp.altus.ui.designsystem.Stamp
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

// ─────────────────────────────────────────────────────────────────────────────
// STRIP 1 — Day Ring hero card (§S2, the one deep card in light mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The hero: 24dp `deep` card + grain, 96dp Day Ring left with the mono % and the
 * single next-step line, and the contextual primary action right — a 96dp
 * circular Clock-in before punch-in, the "In since …" ledger + an outlined Clock
 * out after. A pending clock-in gate rides an inset warn row inside the card.
 * The seal is driven from [DayRingState.sealPending] and persisted by the host
 * via [onSealShown].
 */
@Composable
internal fun TodayHeroCard(
    state: TodayUiState,
    onOpenPunch: () -> Unit,
    onOpenGoalsFill: () -> Unit,
    onSealShown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val ring = state.ring

    AltusDeepCard(modifier = modifier, padding = AltusDimens.space5) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space5),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                DayRing(
                    state = ring,
                    onDeepSurface = true,
                    percentStyle = AltusType.numeralStat,
                    playSeal = ring.sealPending,
                    onSealFinished = onSealShown,
                )
                Text(
                    text = ring.nextStepCopy.ifBlank { "Your day, in order" },
                    style = AltusType.label,
                    color = tokens.onDeepSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(AltusDimens.dayRingHero),
                )
            }

            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                HeroAction(punch = state.punch, onOpenPunch = onOpenPunch)
            }
        }

        // Inset gate row: the weekly-goals gate blocks clock-in and rides here
        // until it clears (§S2 Strip 1). Never buzzes on entry.
        val heroGate = state.heroGate
        if (heroGate != null) {
            Spacer(Modifier.height(AltusDimens.space4))
            HeroGateRow(gate = heroGate, onOpenGoalsFill = onOpenGoalsFill)
        }
    }
}

@Composable
private fun HeroAction(
    punch: PunchContext,
    onOpenPunch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme

    when (punch.kind) {
        PunchKind.ClockIn -> {
            // The largest, most obvious target on the screen.
            Column(
                modifier = modifier
                    .size(AltusDimens.dayRingHero)
                    .clip(CircleShape)
                    .background(scheme.primary)
                    .tapSettleClickable(onClickLabel = "Clock in", onClick = onOpenPunch),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = TodayIcons.LogIn,
                    contentDescription = null,
                    tint = scheme.onPrimary,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = "Clock in",
                    style = AltusType.label,
                    color = scheme.onPrimary,
                )
            }
        }

        PunchKind.ClockOut -> {
            Column(
                modifier = modifier,
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
            ) {
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "IN SINCE",
                        style = AltusType.caption,
                        color = tokens.onDeepSecondary,
                    )
                    Text(
                        text = punch.checkedInAt ?: "—",
                        style = AltusType.numeralHero,
                        color = tokens.onDeep,
                        maxLines = 1,
                    )
                }
                AltusGhostButton(
                    text = "Clock out",
                    onClick = onOpenPunch,
                    contentColor = tokens.onDeep,
                    leadingIcon = TodayIcons.LogIn,
                )
            }
        }

        PunchKind.Done -> {
            Column(
                modifier = modifier,
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(AltusDimens.space2),
            ) {
                HeroPunchLine(label = "IN", value = punch.checkedInAt ?: "—")
                HeroPunchLine(label = "OUT", value = punch.checkedOutAt ?: "—")
            }
        }
    }
}

@Composable
private fun HeroPunchLine(label: String, value: String) {
    val tokens = AltusTheme.tokens
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
        Text(
            text = label,
            style = AltusType.caption,
            color = tokens.onDeepSecondary,
        )
        Text(
            text = value,
            style = AltusType.numeralStat,
            color = tokens.onDeep,
            maxLines = 1,
        )
    }
}

@Composable
private fun HeroGateRow(
    gate: GoalsGateBanner,
    onOpenGoalsFill: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.warn.wash)
            .tapSettleClickable(onClickLabel = "Fill weekly goals", onClick = onOpenGoalsFill)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Icon(
            imageVector = TodayIcons.Target,
            contentDescription = null,
            tint = tokens.warn.color,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = "Set this week's goals to clock in",
            style = AltusType.label,
            color = tokens.warn.color,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = "${gate.unfilledCount} left",
            style = AltusType.monoData,
            color = tokens.warn.color,
        )
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = tokens.warn.color,
            modifier = Modifier.size(20.dp),
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP 2 — Task pressure
// ─────────────────────────────────────────────────────────────────────────────

/** Two half-width stat cards; Overdue tints `danger` when > 0. Tap → Tasks. */
@Composable
internal fun TaskPressureRow(
    pending: Int,
    overdue: Int,
    onOpenTasks: (filter: String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        PressureCard(
            eyebrow = "Pending",
            value = pending,
            tone = PressureTone.Neutral,
            onClick = { onOpenTasks(TASK_FILTER_PENDING) },
            modifier = Modifier.weight(1f),
        )
        PressureCard(
            eyebrow = "Overdue",
            value = overdue,
            tone = if (overdue > 0) PressureTone.Danger else PressureTone.Neutral,
            onClick = { onOpenTasks(TASK_FILTER_OVERDUE) },
            modifier = Modifier.weight(1f),
        )
    }
}

private enum class PressureTone { Neutral, Danger }

@Composable
private fun PressureCard(
    eyebrow: String,
    value: Int,
    tone: PressureTone,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val danger = tone == PressureTone.Danger
    val valueColor = if (danger) tokens.danger.color else MaterialTheme.colorScheme.onSurface

    AltusCard(
        modifier = modifier,
        onClick = onClick,
        accentKeyline = if (danger) tokens.danger.color else tokens.accents.tasks,
    ) {
        Text(
            text = eyebrow.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(AltusDimens.space2))
        Text(
            text = "$value",
            style = AltusType.numeralStat,
            color = valueColor,
            maxLines = 1,
        )
        Spacer(Modifier.height(AltusDimens.space1))
        Text(
            text = "View →",
            style = AltusType.label,
            color = tokens.ink400,
            maxLines = 1,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP 3 — DCC compliance card
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 64dp compliance ring + mono "3/11" + "Daily compliance" heading + a ghost
 * "Fill now →". At 100% the ring strokes success and stamps in — "Done for
 * today". Feeds (and mirrors) the Day Ring's DCC segment.
 */
@Composable
internal fun DccCard(
    dcc: DccPressure,
    onOpenDcc: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier,
        onClick = onOpenDcc,
        accentKeyline = tokens.accents.dcc,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TodayDccRing(fraction = dcc.fraction, complete = dcc.complete)
            Spacer(Modifier.width(AltusDimens.space4))
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Daily compliance",
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(AltusDimens.space1))
                Text(
                    text = if (dcc.complete) "Done for today" else "${dcc.filled}/${dcc.due} filled",
                    style = AltusType.monoData,
                    color = if (dcc.complete) tokens.success.color else tokens.ink400,
                    maxLines = 1,
                )
            }
            if (!dcc.complete) {
                AltusGhostButton(text = "Fill now →", onClick = onOpenDcc)
            }
        }
    }
}

/** A single-value compliance ring (S2 Strip 3), `ring-sweep` on load. */
@Composable
private fun TodayDccRing(
    fraction: Float,
    complete: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val motion = AltusTheme.motion

    val track = tokens.hairline
    val sweepColor = if (complete) tokens.success.color else scheme.primary

    val sweep = remember { Animatable(0f) }
    LaunchedEffect(fraction) {
        val target = fraction.coerceIn(0f, 1f)
        // Never unwinds backwards on a refresh — a lower value snaps.
        if (target >= sweep.value) sweep.animateTo(target, motion.ringSweep) else sweep.snapTo(target)
    }

    Box(
        modifier = modifier.size(AltusDimens.dccRing),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(AltusDimens.dccRing)) {
            val strokePx = 6.dp.toPx()
            val inset = strokePx / 2f
            val arcSize = Size(size.width - strokePx, size.height - strokePx)
            val topLeft = Offset(inset, inset)
            val style = Stroke(width = strokePx, cap = StrokeCap.Round)
            drawArc(
                color = track,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = style,
            )
            if (sweep.value > 0.001f) {
                drawArc(
                    color = sweepColor,
                    startAngle = -90f,
                    sweepAngle = 360f * sweep.value,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = style,
                )
            }
        }
        Crossfade(targetState = complete, animationSpec = motion.tabFadeIn, label = "DccCardCenter") { done ->
            if (done) {
                Stamp(visible = true, size = AltusDimens.dccRing * 0.4f, contentDescription = "Complete")
            } else {
                Text(
                    text = "${(fraction * 100).toInt()}%",
                    style = AltusType.label,
                    color = scheme.onSurface,
                    maxLines = 1,
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP 4 — ranked gate banner (post clock-in)
// ─────────────────────────────────────────────────────────────────────────────

/** The single ranked weekly-goals banner, shown once the user is clocked in. */
@Composable
internal fun GoalsGateBannerCard(
    gate: GoalsGateBanner,
    onOpenGoalsFill: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    AltusCard(
        modifier = modifier,
        onClick = onOpenGoalsFill,
        accentKeyline = tokens.accents.goals,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = TodayIcons.Target,
                contentDescription = null,
                tint = tokens.accents.goals,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(AltusDimens.space3))
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Set this week's goals",
                    style = AltusType.bodyStrong,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${gate.unfilledCount} still to fill",
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIP 5 — module row (last card half-visible: the "more exists" tease)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun ModuleRow(
    modules: List<ModuleTile>,
    onModule: (ModuleId) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = AltusDimens.screenGutter),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        items(items = modules, key = { it.id.name }, contentType = { "module" }) { tile ->
            ModuleCard(tile = tile, onClick = { onModule(tile.id) })
        }
    }
}

@Composable
private fun ModuleCard(
    tile: ModuleTile,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val accent = tile.id.accent(tokens.accents)
    val glyph = tile.id.glyph()

    AltusCard(
        modifier = modifier.width(140.dp),
        onClick = onClick,
        accentKeyline = accent,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(AltusShapeTokens.chip)
                .background(accent.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = glyph,
                contentDescription = null,
                tint = accent,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.height(AltusDimens.space3))
        Text(
            text = tile.title,
            style = AltusType.label,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = tile.meta,
            style = AltusType.monoData,
            color = tokens.ink400,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun ModuleId.accent(accents: com.altuscorp.altus.ui.theme.ModuleAccents): Color = when (this) {
    ModuleId.Attendance -> accents.attendance
    ModuleId.Tasks -> accents.tasks
    ModuleId.Dcc -> accents.dcc
    ModuleId.Goals -> accents.goals
    ModuleId.Inbox -> accents.dash
    ModuleId.More -> accents.dash
}

private fun ModuleId.glyph(): ImageVector = when (this) {
    ModuleId.Attendance -> TodayIcons.Clock
    ModuleId.Tasks -> TodayIcons.CheckSquare
    ModuleId.Dcc -> TodayIcons.LayoutGrid
    ModuleId.Goals -> TodayIcons.Target
    ModuleId.Inbox -> TodayIcons.Bell
    ModuleId.More -> TodayIcons.LayoutGrid
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton (Signature 8 — the exact resolved geometry)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun TodaySkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
    ) {
        // Hero silhouette.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(AltusShapeTokens.hero)
                .background(AltusTheme.tokens.deep)
                .padding(AltusDimens.space5),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space5),
        ) {
            SkeletonCircle(diameter = AltusDimens.dayRingHero)
            Spacer(Modifier.weight(1f))
            SkeletonCircle(diameter = AltusDimens.dayRingHero)
        }

        // Task pressure — two half-width cards.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
            SkeletonBox(modifier = Modifier.weight(1f).height(104.dp))
        }

        // DCC card.
        SkeletonBox(modifier = Modifier.fillMaxWidth().height(96.dp))

        // Module row.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.cardGap),
        ) {
            repeat(3) { SkeletonBox(modifier = Modifier.width(140.dp).height(104.dp)) }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Degraded shared pieces
// ─────────────────────────────────────────────────────────────────────────────

/** Quiet warn banner: content is on screen but the reconcile failed. */
@Composable
internal fun TodayStaleBanner(modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(AltusShapeTokens.input)
            .background(tokens.warn.wash)
            .padding(AltusDimens.space3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Couldn't refresh — showing your last synced day.",
            style = AltusType.label,
            color = tokens.warn.color,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen-local iconography (§1.7 — Lucide, 2dp stroke, round caps)
// ─────────────────────────────────────────────────────────────────────────────

internal object TodayIcons {

    /** lucide `log-in` — the clock-in / clock-out affordance. */
    val LogIn: ImageVector by lazy {
        lucide("Today.LogIn", "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4", "M10 17l5-5-5-5", "M15 12H3")
    }

    /** lucide `clock` — attendance module glyph. */
    val Clock: ImageVector by lazy {
        lucide("Today.Clock", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 7v5l3 2")
    }

    /** lucide `check-square` — tasks module glyph. */
    val CheckSquare: ImageVector by lazy {
        lucide(
            "Today.CheckSquare",
            "M9 11l3 3L20 4",
            "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
        )
    }

    /** lucide `layout-grid` — DCC / hub module glyph. */
    val LayoutGrid: ImageVector by lazy {
        lucide(
            "Today.LayoutGrid",
            "M4 4h6v6H4z",
            "M14 4h6v6h-6z",
            "M14 14h6v6h-6z",
            "M4 14h6v6H4z",
        )
    }

    /** lucide `target` — weekly-goals glyph. */
    val Target: ImageVector by lazy {
        lucide(
            "Today.Target",
            "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
            "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
            "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
        )
    }

    /** lucide `bell` — inbox glyph. */
    val Bell: ImageVector by lazy {
        lucide(
            "Today.Bell",
            "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
            "M10.3 21a1.94 1.94 0 0 0 3.4 0",
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

// Route filter tokens (mirror TaskListRoute companion so the row needn't import nav).
internal const val TASK_FILTER_PENDING = "pending"
internal const val TASK_FILTER_OVERDUE = "overdue"
