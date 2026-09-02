package com.altuscorp.altus.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp

/**
 * Altus typography.
 *
 * Two faces only:
 *  - [AltusSans]  — Inter (variable, weights 400/500/600) for everything.
 *  - [AltusMono]  — JetBrains Mono 500, tabular, for every hard number in the
 *    product: task numbers, timestamps, punch clock, KPI counts, percentages,
 *    badges. The mono face is the app's fingerprint.
 *
 * The families below fall back to the platform sans / monospace faces so this
 * module compiles standalone. When the bundled variable fonts are added under
 * res/font, replace these two vals with FontFamily(Font(R.font.inter_variable))
 * and FontFamily(Font(R.font.jetbrains_mono_medium)); every TextStyle picks
 * them up.
 *
 * Readability house rule: nothing below 12sp anywhere. Support fontScale to
 * 1.3x without truncation.
 */
val AltusSans: FontFamily = FontFamily.Default
val AltusMono: FontFamily = FontFamily.Monospace

private const val TNUM = "tnum"

/**
 * The full named type scale. Screens reference these by role name so the scale
 * stays authoritative (e.g. AltusType.numeralHero for the punch clock).
 */
object AltusType {

    /** 32/38, 600, -0.5 — greeting, empty-state headlines. */
    val display = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.5).sp,
    )

    /** 44/48 mono, 500, tnum — punch clock, Day Ring %. */
    val numeralHero = TextStyle(
        fontFamily = AltusMono,
        fontWeight = FontWeight.Medium,
        fontSize = 44.sp,
        lineHeight = 48.sp,
        fontFeatureSettings = TNUM,
    )

    /** 28/34 mono, 500, tnum — stat-card counts. */
    val numeralStat = TextStyle(
        fontFamily = AltusMono,
        fontWeight = FontWeight.Medium,
        fontSize = 28.sp,
        lineHeight = 34.sp,
        fontFeatureSettings = TNUM,
    )

    /** 24/30, 600 — screen titles. */
    val title1 = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
    )

    /** 20/26, 600 — section/sheet titles. */
    val title2 = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    )

    /** 17/24, 600 — card titles, task titles. */
    val heading = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp,
        lineHeight = 24.sp,
    )

    /** 16/24, 400 — primary content, the reading floor. */
    val body = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    )

    /** 16/24, 500 — inline emphasis. */
    val bodyStrong = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    )

    /** 13/18, 500, +0.1 — meta, tab labels, chips. */
    val label = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.Medium,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.1.sp,
    )

    /**
     * 12/16, 500, +0.4 — eyebrows ("DUE TODAY", "SECTION B").
     * Rendered UPPERCASE at the call site (use .uppercase()).
     */
    val caption = TextStyle(
        fontFamily = AltusSans,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp,
    )

    /** 14/20 mono, 500, tnum — task no., times, counts. */
    val monoData = TextStyle(
        fontFamily = AltusMono,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontFeatureSettings = TNUM,
    )
}

/**
 * M3 [Typography] mapped from the named scale so stock Material components stay
 * on-brand. Custom roles (numerals, caption, monoData) are read directly from
 * [AltusType].
 */
val AltusMaterialTypography: Typography = Typography(
    displayLarge = AltusType.display,
    displayMedium = AltusType.display,
    headlineLarge = AltusType.title1,
    headlineMedium = AltusType.title2,
    titleLarge = AltusType.title1,
    titleMedium = AltusType.title2,
    titleSmall = AltusType.heading,
    bodyLarge = AltusType.body,
    bodyMedium = AltusType.body,
    bodySmall = AltusType.label,
    labelLarge = AltusType.bodyStrong,
    labelMedium = AltusType.label,
    labelSmall = AltusType.caption,
)

/** Convenience: a center-aligned variant, used by the Day Ring % readout. */
fun TextStyle.centered(): TextStyle = copy(textAlign = TextAlign.Center)
