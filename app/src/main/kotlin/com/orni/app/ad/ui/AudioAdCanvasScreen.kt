package com.orni.app.ad.ui

import android.Manifest
import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.orni.app.ad.AdUiState
import com.orni.app.ad.AdViewModel
import com.orni.app.wardrobe.util.base64ToByteArray
import kotlin.math.sin

@Composable
fun AudioAdCanvasScreen(
    viewModel: AdViewModel = viewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val amplitude by viewModel.amplitude.collectAsState()

    var permissionGranted by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> permissionGranted = granted }

    // Request permission on first composition
    LaunchedEffect(Unit) {
        permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    // Start/stop session based on permission
    LaunchedEffect(permissionGranted) {
        if (permissionGranted) viewModel.startSession()
    }

    DisposableEffect(Unit) {
        onDispose { viewModel.stopSession() }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars),
        ) {
            // Top bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Ad Canvas", style = MaterialTheme.typography.headlineSmall)
                Spacer(modifier = Modifier.weight(1f))
                LiveIndicator(
                    isLive = permissionGranted && uiState !is AdUiState.Error && uiState !is AdUiState.PermissionRequired,
                )
            }

            // Main canvas area
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 20.dp)
                    .clip(RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center,
            ) {
                AnimatedContent(
                    targetState = uiState,
                    transitionSpec = { fadeIn(tween(400)) togetherWith fadeOut(tween(400)) },
                    label = "canvas",
                ) { state ->
                    when (state) {
                        is AdUiState.Success -> {
                            val bytes = remember(state.imageBase64) { state.imageBase64.base64ToByteArray() }
                            val bitmap = remember(bytes) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
                            Box(modifier = Modifier.fillMaxSize()) {
                                Image(
                                    bitmap = bitmap.asImageBitmap(),
                                    contentDescription = "Generated ad",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize(),
                                )
                                // Live overlay text — updated instantly on localize without re-render
                                val overlayText = state.overlayText ?: state.intent.copyText
                                if (!overlayText.isNullOrBlank()) {
                                    Text(
                                        text = overlayText,
                                        style = MaterialTheme.typography.headlineMedium,
                                        color = Color.White,
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier
                                            .align(Alignment.BottomCenter)
                                            .fillMaxWidth()
                                            .background(Color.Black.copy(alpha = 0.45f))
                                            .padding(horizontal = 16.dp, vertical = 12.dp),
                                    )
                                }
                            }
                        }

                        is AdUiState.Generating  -> ShimmerCanvas(label = "Generating ad…", modifier = Modifier.fillMaxSize())
                        is AdUiState.Animating   -> ShimmerCanvas(label = "Animating (Omni Flash)…", modifier = Modifier.fillMaxSize())
                        is AdUiState.Localizing  -> ShimmerCanvas(label = "Translating copy…", modifier = Modifier.fillMaxSize())

                        is AdUiState.PermissionRequired -> PermissionRequiredState(
                            onRequest = { permissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                        )

                        is AdUiState.Error -> ErrorState(
                            message = state.message,
                            canRetry = state.canRetry,
                            onRetry = { viewModel.retry() },
                        )

                        else -> EmptyCanvasState(amplitude = amplitude)
                    }
                }
            }

            // Bottom strip
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.navigationBars)
                    .padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Live transcript / intent strip — one collapsible line
                val transcript = when (val s = uiState) {
                    is AdUiState.IntentStabilizing -> s.transcript
                    is AdUiState.Generating  -> "Generating: ${s.intent.product}…"
                    is AdUiState.Animating   -> "Animating: ${s.intent.motion?.take(40) ?: s.intent.product}…"
                    is AdUiState.Localizing  -> "Translating to ${s.language}…"
                    is AdUiState.Success     -> s.intent.product
                    else -> null
                }
                AnimatedVisibility(visible = transcript != null) {
                    Text(
                        text = transcript.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }

                // Waveform
                if (permissionGranted && uiState !is AdUiState.Error) {
                    WaveformBar(amplitude = amplitude, modifier = Modifier.fillMaxWidth().height(40.dp))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Sub-composables
// ---------------------------------------------------------------------------

@Composable
private fun LiveIndicator(isLive: Boolean) {
    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "alpha",
    )
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(
                    if (isLive) Color(0xFF4CAF50).copy(alpha = pulse) else MaterialTheme.colorScheme.error,
                ),
        )
        Spacer(modifier = Modifier.width(6.dp))
        Icon(
            if (isLive) Icons.Filled.Mic else Icons.Filled.MicOff,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun WaveformBar(amplitude: Float, modifier: Modifier = Modifier) {
    val smoothed by animateFloatAsState(targetValue = amplitude, animationSpec = tween(80), label = "amp")
    val phase by rememberInfiniteTransition(label = "wave").animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
    val barColor = MaterialTheme.colorScheme.primary

    Canvas(modifier = modifier) {
        val midY = size.height / 2f
        val barCount = 40
        val barWidth = size.width / (barCount * 2f)
        for (i in 0 until barCount) {
            val x = i * size.width / barCount + barWidth
            val sinVal = sin(phase + i * 0.4f).toFloat()
            val barHeight = (smoothed * size.height * 0.9f * ((sinVal + 1f) / 2f)).coerceAtLeast(4f)
            drawLine(
                color = barColor,
                start = Offset(x, midY - barHeight / 2),
                end = Offset(x, midY + barHeight / 2),
                strokeWidth = barWidth,
            )
        }
    }
}

@Composable
private fun ShimmerCanvas(label: String = "Generating…", modifier: Modifier = Modifier) {
    val shimmer by rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "offset",
    )
    Box(
        modifier = modifier.background(
            Brush.linearGradient(
                colors = listOf(
                    MaterialTheme.colorScheme.surfaceVariant,
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                    MaterialTheme.colorScheme.surfaceVariant,
                ),
                start = Offset(shimmer * 2000f - 1000f, 0f),
                end = Offset(shimmer * 2000f, 1000f),
            ),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptyCanvasState(amplitude: Float) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(32.dp),
    ) {
        val pulse by animateFloatAsState(
            targetValue = 0.6f + amplitude * 0.4f,
            animationSpec = tween(80),
            label = "mic_scale",
        )
        Box(
            modifier = Modifier
                .size((72 * pulse).dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Mic,
                contentDescription = null,
                modifier = Modifier.size(32.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            "Listening…",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            "Say something like:\n\"Generate an Instagram ad for a smart water bottle, text says 'Hydrate Smart'\"",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun PermissionRequiredState(onRequest: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.padding(32.dp),
    ) {
        Icon(
            Icons.Filled.MicOff,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            "Microphone access needed",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Text(
            "This feature listens continuously so you can direct ad generation by voice.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onRequest, shape = RoundedCornerShape(16.dp)) {
            Text("Grant access")
        }
    }
}

@Composable
private fun ErrorState(message: String, canRetry: Boolean, onRetry: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(32.dp),
    ) {
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
        )
        if (canRetry) {
            TextButton(
                onClick = onRetry,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.primary),
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Retry", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
