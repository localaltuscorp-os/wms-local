package com.altuscorp.altus.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Radii mapping (Part 1.3):
 *   chips/steppers 8 · inputs 12 · cards 16 · sheets 20 (top) · hero 24 · pills full.
 *
 * Mapped onto the five M3 shape roles so stock components inherit the scale.
 */
val AltusShapes: Shapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),   // chips, steppers
    small = RoundedCornerShape(12.dp),       // inputs
    medium = RoundedCornerShape(16.dp),      // cards
    large = RoundedCornerShape(20.dp),       // dialogs
    extraLarge = RoundedCornerShape(24.dp),  // hero cards (punch, ring, identity)
)

/** Named shapes for roles M3 has no slot for. */
object AltusShapeTokens {
    val chip = RoundedCornerShape(8.dp)
    val input = RoundedCornerShape(12.dp)
    val card = RoundedCornerShape(16.dp)
    val hero = RoundedCornerShape(24.dp)

    /** Bottom sheets: 20dp top corners only. */
    val sheet = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)

    /** Pills / FAB / punch control: full pill. */
    val pill = RoundedCornerShape(percent = 50)
}
