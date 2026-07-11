package com.orni.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.orni.app.ui.theme.OrniTheme
import com.orni.app.wardrobe.ui.WardrobeTryOnScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OrniTheme {
                WardrobeTryOnScreen()
            }
        }
    }
}
