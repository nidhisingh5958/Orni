package com.orni.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = Charcoal,
    onPrimary = Cream,
    secondary = WarmTaupe,
    onSecondary = Cream,
    tertiary = Terracotta,
    background = Cream,
    onBackground = Charcoal,
    surface = Cream,
    onSurface = Charcoal,
    surfaceVariant = SurfaceLight,
    onSurfaceVariant = WarmTaupe,
    error = Terracotta,
)

private val DarkColorScheme = darkColorScheme(
    primary = CharcoalDark,
    onPrimary = SurfaceDark,
    secondary = WarmTaupeDark,
    onSecondary = SurfaceDark,
    tertiary = TerracottaDark,
    background = SurfaceDark,
    onBackground = CharcoalDark,
    surface = SurfaceDark,
    onSurface = CharcoalDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = WarmTaupeDark,
    error = TerracottaDark,
)

@Composable
fun OrniTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = Typography,
        content = content,
    )
}
