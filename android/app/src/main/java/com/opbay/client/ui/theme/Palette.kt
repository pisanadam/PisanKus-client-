package com.opbay.client.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.atan2
import kotlin.math.sqrt

/**
 * Builds a full Material 3 colour scheme from a single seed colour.
 *
 * Tones are picked in OkLCH, where the L axis is perceptually uniform — so a
 * "tone 40" swatch reads as the same lightness whatever hue the player chose,
 * which is what keeps text contrast predictable across seeds. Chroma is reduced
 * until the colour fits inside sRGB rather than clipped per channel, which would
 * shift the hue.
 */
object Palette {

    // ------------------------------------------------------------ colour space

    private fun srgbToLinear(value: Float): Float =
        if (value <= 0.04045f) value / 12.92f else ((value + 0.055f) / 1.055f).pow(2.4f)

    private fun linearToSrgb(value: Float): Float =
        if (value <= 0.0031308f) value * 12.92f else 1.055f * value.pow(1f / 2.4f) - 0.055f

    private data class Lch(val l: Float, val c: Float, val h: Float)

    private fun toLch(color: Color): Lch {
        val r = srgbToLinear(color.red)
        val g = srgbToLinear(color.green)
        val b = srgbToLinear(color.blue)

        val l = cbrt(0.4122214708f * r + 0.5363325363f * g + 0.0514459929f * b)
        val m = cbrt(0.2119034982f * r + 0.6806995451f * g + 0.1073969566f * b)
        val s = cbrt(0.0883024619f * r + 0.2817188376f * g + 0.6299787005f * b)

        val okL = 0.2104542553f * l + 0.7936177850f * m - 0.0040720468f * s
        val okA = 1.9779984951f * l - 2.4285922050f * m + 0.4505937099f * s
        val okB = 0.0259040371f * l + 0.7827717662f * m - 0.8086757660f * s

        return Lch(okL, sqrt(okA * okA + okB * okB), atan2(okB, okA))
    }

    /** Converts back, returning null when the colour falls outside sRGB. */
    private fun fromLchOrNull(lch: Lch): Color? {
        val okA = lch.c * cos(lch.h)
        val okB = lch.c * sin(lch.h)

        val l = (lch.l + 0.3963377774f * okA + 0.2158037573f * okB).pow(3)
        val m = (lch.l - 0.1055613458f * okA - 0.0638541728f * okB).pow(3)
        val s = (lch.l - 0.0894841775f * okA - 1.2914855480f * okB).pow(3)

        val r = linearToSrgb(4.0767416621f * l - 3.3077115913f * m + 0.2309699292f * s)
        val g = linearToSrgb(-1.2684380046f * l + 2.6097574011f * m - 0.3413193965f * s)
        val b = linearToSrgb(-0.0041960863f * l - 0.7034186147f * m + 1.7076147010f * s)

        val tolerance = -0.0005f..1.0005f
        if (r !in tolerance || g !in tolerance || b !in tolerance) return null
        return Color(r.coerceIn(0f, 1f), g.coerceIn(0f, 1f), b.coerceIn(0f, 1f))
    }

    /** Reduces chroma until the colour is representable, preserving hue and tone. */
    private fun fromLch(lch: Lch): Color {
        fromLchOrNull(lch)?.let { return it }
        var low = 0f
        var high = lch.c
        var best = fromLchOrNull(lch.copy(c = 0f)) ?: Color.Black
        repeat(20) {
            val mid = (low + high) / 2
            val candidate = fromLchOrNull(lch.copy(c = mid))
            if (candidate != null) {
                best = candidate
                low = mid
            } else {
                high = mid
            }
        }
        return best
    }

    /**
     * Material tone (0 = black, 100 = white) mapped onto OkLab lightness.
     * `chromaScale` pulls a swatch toward neutral for surfaces and secondaries.
     */
    private fun tone(seed: Lch, tone: Int, chromaScale: Float = 1f, hueShift: Float = 0f): Color {
        val target = (tone / 100f).coerceIn(0f, 1f)
        // Chroma has to fall off near the extremes or light/dark tones look muddy.
        val falloff = 1f - (2f * target - 1f).pow(2) * 0.55f
        return fromLch(
            Lch(
                l = target,
                c = seed.c * chromaScale * falloff,
                h = seed.h + Math.toRadians(hueShift.toDouble()).toFloat()
            )
        )
    }

    // ------------------------------------------------------------------ schemes

    fun light(seedColor: Color): ColorScheme {
        val seed = toLch(seedColor)
        return lightColorScheme(
            primary = tone(seed, 40),
            onPrimary = tone(seed, 100),
            primaryContainer = tone(seed, 90),
            onPrimaryContainer = tone(seed, 10),
            inversePrimary = tone(seed, 80),

            secondary = tone(seed, 40, chromaScale = 0.34f),
            onSecondary = tone(seed, 100, chromaScale = 0.34f),
            secondaryContainer = tone(seed, 90, chromaScale = 0.34f),
            onSecondaryContainer = tone(seed, 10, chromaScale = 0.34f),

            tertiary = tone(seed, 40, chromaScale = 0.8f, hueShift = 60f),
            onTertiary = tone(seed, 100, chromaScale = 0.8f, hueShift = 60f),
            tertiaryContainer = tone(seed, 90, chromaScale = 0.8f, hueShift = 60f),
            onTertiaryContainer = tone(seed, 10, chromaScale = 0.8f, hueShift = 60f),

            background = tone(seed, 99, chromaScale = 0.05f),
            onBackground = tone(seed, 10, chromaScale = 0.05f),
            surface = tone(seed, 99, chromaScale = 0.05f),
            onSurface = tone(seed, 10, chromaScale = 0.05f),
            surfaceVariant = tone(seed, 92, chromaScale = 0.12f),
            onSurfaceVariant = tone(seed, 30, chromaScale = 0.12f),
            surfaceContainerLowest = tone(seed, 100, chromaScale = 0.05f),
            surfaceContainerLow = tone(seed, 97, chromaScale = 0.05f),
            surfaceContainer = tone(seed, 95, chromaScale = 0.06f),
            surfaceContainerHigh = tone(seed, 93, chromaScale = 0.06f),
            surfaceContainerHighest = tone(seed, 91, chromaScale = 0.06f),

            outline = tone(seed, 50, chromaScale = 0.1f),
            outlineVariant = tone(seed, 80, chromaScale = 0.1f),
            inverseSurface = tone(seed, 20, chromaScale = 0.05f),
            inverseOnSurface = tone(seed, 95, chromaScale = 0.05f)
        )
    }

    fun dark(seedColor: Color, amoled: Boolean = false): ColorScheme {
        val seed = toLch(seedColor)
        val base = darkColorScheme(
            primary = tone(seed, 80),
            onPrimary = tone(seed, 20),
            primaryContainer = tone(seed, 30),
            onPrimaryContainer = tone(seed, 90),
            inversePrimary = tone(seed, 40),

            secondary = tone(seed, 80, chromaScale = 0.34f),
            onSecondary = tone(seed, 20, chromaScale = 0.34f),
            secondaryContainer = tone(seed, 30, chromaScale = 0.34f),
            onSecondaryContainer = tone(seed, 90, chromaScale = 0.34f),

            tertiary = tone(seed, 80, chromaScale = 0.8f, hueShift = 60f),
            onTertiary = tone(seed, 20, chromaScale = 0.8f, hueShift = 60f),
            tertiaryContainer = tone(seed, 30, chromaScale = 0.8f, hueShift = 60f),
            onTertiaryContainer = tone(seed, 90, chromaScale = 0.8f, hueShift = 60f),

            background = tone(seed, 8, chromaScale = 0.08f),
            onBackground = tone(seed, 90, chromaScale = 0.05f),
            surface = tone(seed, 8, chromaScale = 0.08f),
            onSurface = tone(seed, 90, chromaScale = 0.05f),
            surfaceVariant = tone(seed, 26, chromaScale = 0.12f),
            onSurfaceVariant = tone(seed, 80, chromaScale = 0.12f),
            surfaceContainerLowest = tone(seed, 5, chromaScale = 0.08f),
            surfaceContainerLow = tone(seed, 11, chromaScale = 0.08f),
            surfaceContainer = tone(seed, 13, chromaScale = 0.08f),
            surfaceContainerHigh = tone(seed, 18, chromaScale = 0.08f),
            surfaceContainerHighest = tone(seed, 23, chromaScale = 0.08f),

            outline = tone(seed, 55, chromaScale = 0.1f),
            outlineVariant = tone(seed, 30, chromaScale = 0.1f),
            inverseSurface = tone(seed, 90, chromaScale = 0.05f),
            inverseOnSurface = tone(seed, 20, chromaScale = 0.05f)
        )

        if (!amoled) return base
        // OLED panels save power on true black, and the seam between surfaces
        // disappears, so containers keep a little lift.
        return base.copy(
            background = Color.Black,
            surface = Color.Black,
            surfaceContainerLowest = Color.Black,
            surfaceContainerLow = tone(seed, 6, chromaScale = 0.08f),
            surfaceContainer = tone(seed, 9, chromaScale = 0.08f)
        )
    }
}
