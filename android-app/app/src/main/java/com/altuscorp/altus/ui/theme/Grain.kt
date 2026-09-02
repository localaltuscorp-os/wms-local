package com.altuscorp.altus.ui.theme

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.asImageBitmap
import kotlin.random.Random

/**
 * Grain (§1.1): 2%-opacity monochrome noise on hero surfaces ONLY — deep
 * cards, the login canvas, the Punch screen. Never on list content.
 *
 * The 128px tile is generated once, deterministically, in code (no asset
 * dependency) and tiled via an [ImageShader] brush. Apply through
 * `Modifier.grainOverlay()` (Modifiers.kt), which draws the brush at
 * [GRAIN_ALPHA] over the surface fill.
 */

/** The one grain opacity in the app. */
const val GRAIN_ALPHA = 0.02f

private const val GRAIN_TILE_SIZE = 128
private const val GRAIN_SEED = 0x0A5C4C

private val grainTile: ImageBitmap by lazy {
    val random = Random(GRAIN_SEED)
    val pixels = IntArray(GRAIN_TILE_SIZE * GRAIN_TILE_SIZE) {
        val v = random.nextInt(256)
        (0xFF shl 24) or (v shl 16) or (v shl 8) or v
    }
    Bitmap.createBitmap(GRAIN_TILE_SIZE, GRAIN_TILE_SIZE, Bitmap.Config.ARGB_8888)
        .apply { setPixels(pixels, 0, GRAIN_TILE_SIZE, 0, 0, GRAIN_TILE_SIZE, GRAIN_TILE_SIZE) }
        .asImageBitmap()
}

/** The tiled monochrome-noise brush. Stable across compositions. */
@Composable
fun rememberGrainBrush(): ShaderBrush = remember {
    ShaderBrush(ImageShader(grainTile, TileMode.Repeated, TileMode.Repeated))
}
