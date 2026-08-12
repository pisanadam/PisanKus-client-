package com.opbay.client.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.core.view.WindowCompat
import com.opbay.client.data.ThemeMode
import com.opbay.client.data.ThemeSettings
import androidx.compose.foundation.shape.RoundedCornerShape

/** Swatches offered in Settings; the player can also enter any hex value. */
val SEED_PRESETS: List<Pair<String, Long>> = listOf(
    "Gök" to 0xFF5B8CFF,
    "Menekşe" to 0xFF8B5CF6,
    "Gül" to 0xFFE0567A,
    "Kehribar" to 0xFFF0873C,
    "Zümrüt" to 0xFF3FB98A,
    "Turkuaz" to 0xFF2FB6C8,
    "Altın" to 0xFFD9B23C,
    "Kiremit" to 0xFFD1553F,
    "Çivit" to 0xFF4F46E5,
    "Orman" to 0xFF4B8B3B
)

/** Scales the default type ramp so the player can size the whole UI. */
private fun scaledTypography(scale: Float): Typography {
    val base = Typography()
    fun TextStyle.scaled() = copy(
        fontSize = fontSize * scale,
        lineHeight = if (lineHeight.isSpecified) lineHeight * scale else lineHeight
    )
    return Typography(
        displayLarge = base.displayLarge.scaled(),
        displayMedium = base.displayMedium.scaled(),
        displaySmall = base.displaySmall.scaled(),
        headlineLarge = base.headlineLarge.scaled(),
        headlineMedium = base.headlineMedium.scaled(),
        headlineSmall = base.headlineSmall.scaled(),
        titleLarge = base.titleLarge.scaled(),
        titleMedium = base.titleMedium.scaled(),
        titleSmall = base.titleSmall.scaled(),
        bodyLarge = base.bodyLarge.scaled(),
        bodyMedium = base.bodyMedium.scaled(),
        bodySmall = base.bodySmall.scaled(),
        labelLarge = base.labelLarge.scaled(),
        labelMedium = base.labelMedium.scaled(),
        labelSmall = base.labelSmall.scaled()
    )
}

@Composable
fun OpbayTheme(
    theme: ThemeSettings,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val dark = when (theme.mode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }

    val colorScheme = remember(theme.seedColor, theme.dynamicColor, theme.amoled, dark) {
        val wallpaperDriven = theme.dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        when {
            wallpaperDriven && dark -> dynamicDarkColorScheme(context).let {
                if (theme.amoled) it.copy(background = Color.Black, surface = Color.Black) else it
            }
            wallpaperDriven -> dynamicLightColorScheme(context)
            dark -> Palette.dark(Color(theme.seedColor), theme.amoled)
            else -> Palette.light(Color(theme.seedColor))
        }
    }

    val shapes = remember(theme.cornerRadiusDp) {
        val radius = theme.cornerRadiusDp
        Shapes(
            extraSmall = RoundedCornerShape((radius / 4).coerceAtLeast(2).dp),
            small = RoundedCornerShape((radius / 2).coerceAtLeast(4).dp),
            medium = RoundedCornerShape(radius.dp),
            large = RoundedCornerShape((radius * 1.4f).dp),
            extraLarge = RoundedCornerShape((radius * 1.8f).dp)
        )
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            // Edge-to-edge draws the bars transparent, so only the icon tint has
            // to follow the theme — setting bar colours directly is deprecated.
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = remember(theme.fontScale) { scaledTypography(theme.fontScale) },
        shapes = shapes,
        content = content
    )
}
