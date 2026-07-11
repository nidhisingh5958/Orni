package com.orni.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.orni.app.ad.ui.AudioAdCanvasScreen
import com.orni.app.ui.theme.OrniTheme
import com.orni.app.wardrobe.ui.WardrobeTryOnScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OrniTheme {
                val navController = rememberNavController()
                val backStack by navController.currentBackStackEntryAsState()
                val currentRoute = backStack?.destination?.route

                Scaffold(
                    bottomBar = {
                        NavigationBar {
                            NavigationBarItem(
                                selected = currentRoute == "wardrobe",
                                onClick = { navController.navigate("wardrobe") { launchSingleTop = true } },
                                icon = { Icon(Icons.Filled.Checkroom, contentDescription = null) },
                                label = { Text("Try-On") },
                            )
                            NavigationBarItem(
                                selected = currentRoute == "ad_canvas",
                                onClick = { navController.navigate("ad_canvas") { launchSingleTop = true } },
                                icon = { Icon(Icons.Filled.Mic, contentDescription = null) },
                                label = { Text("Ad Canvas") },
                            )
                        }
                    },
                ) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = "wardrobe",
                        modifier = Modifier.padding(innerPadding),
                    ) {
                        composable("wardrobe") { WardrobeTryOnScreen() }
                        composable("ad_canvas") { AudioAdCanvasScreen() }
                    }
                }
            }
        }
    }
}
