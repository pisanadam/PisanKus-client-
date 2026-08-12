package com.opbay.client

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import com.opbay.client.ui.theme.Palette
import com.opbay.client.ui.theme.SEED_PRESETS
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * The palette is generated at runtime from whatever colour the player picks, so
 * nobody reviews the result by eye. These tests stand in for that review: every
 * seed the UI offers must produce text/background pairs that stay readable.
 */
class PaletteTest {

    private fun relativeLuminance(color: Color): Double {
        fun channel(value: Float): Double {
            val v = value.toDouble()
            return if (v <= 0.03928) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue)
    }

    /** WCAG 2.1 contrast ratio, 1..21. */
    private fun contrast(a: Color, b: Color): Double {
        val la = relativeLuminance(a)
        val lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private fun pairs(scheme: ColorScheme): List<Triple<String, Color, Color>> = listOf(
        Triple("onSurface/surface", scheme.onSurface, scheme.surface),
        Triple("onBackground/background", scheme.onBackground, scheme.background),
        Triple("onPrimary/primary", scheme.onPrimary, scheme.primary),
        Triple("onSecondary/secondary", scheme.onSecondary, scheme.secondary),
        Triple("onTertiary/tertiary", scheme.onTertiary, scheme.tertiary),
        Triple("onPrimaryContainer/primaryContainer", scheme.onPrimaryContainer, scheme.primaryContainer),
        Triple("onSecondaryContainer/secondaryContainer", scheme.onSecondaryContainer, scheme.secondaryContainer),
        Triple("onTertiaryContainer/tertiaryContainer", scheme.onTertiaryContainer, scheme.tertiaryContainer),
        Triple("onSurfaceVariant/surfaceVariant", scheme.onSurfaceVariant, scheme.surfaceVariant),
        Triple("onSurface/surfaceContainer", scheme.onSurface, scheme.surfaceContainer),
        Triple("onSurface/surfaceContainerHighest", scheme.onSurface, scheme.surfaceContainerHighest)
    )

    private fun checkScheme(label: String, scheme: ColorScheme) {
        for ((name, foreground, background) in pairs(scheme)) {
            val ratio = contrast(foreground, background)
            assertTrue(
                "$label $name kontrastı yetersiz: %.2f".format(ratio),
                ratio >= 4.5
            )
        }
    }

    @Test
    fun `every preset seed produces readable light and dark schemes`() {
        for ((name, value) in SEED_PRESETS) {
            checkScheme("$name light", Palette.light(Color(value)))
            checkScheme("$name dark", Palette.dark(Color(value)))
            checkScheme("$name amoled", Palette.dark(Color(value), amoled = true))
        }
    }

    @Test
    fun `extreme seeds stay readable`() {
        // Pure black, pure white and a fully saturated primary are the cases most
        // likely to break a tone mapper.
        val extremes = listOf(0xFF000000, 0xFFFFFFFF, 0xFFFF0000, 0xFF00FF00, 0xFF0000FF, 0xFF808080)
        for (value in extremes) {
            checkScheme("extreme %08X light".format(value), Palette.light(Color(value)))
            checkScheme("extreme %08X dark".format(value), Palette.dark(Color(value)))
        }
    }

    @Test
    fun `tones preserve the seed hue`() {
        // A generated primary must still look like the colour the player chose.
        val seed = Color(0xFF5B8CFF)
        val scheme = Palette.light(seed)
        val seedHue = hueOf(seed)
        val primaryHue = hueOf(scheme.primary)
        val delta = abs(seedHue - primaryHue).let { min(it, 360 - it) }
        assertTrue("Ton kayması çok büyük: $delta°", delta < 25)
    }

    private fun hueOf(color: Color): Double {
        val r = color.red.toDouble()
        val g = color.green.toDouble()
        val b = color.blue.toDouble()
        val maxV = maxOf(r, g, b)
        val minV = minOf(r, g, b)
        val d = maxV - minV
        if (d == 0.0) return 0.0
        val hue = when (maxV) {
            r -> 60 * (((g - b) / d) % 6)
            g -> 60 * (((b - r) / d) + 2)
            else -> 60 * (((r - g) / d) + 4)
        }
        return (hue + 360) % 360
    }
}
