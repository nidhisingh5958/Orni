package com.orni.app.wardrobe.ui

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.orni.app.wardrobe.WardrobeUiState
import com.orni.app.wardrobe.WardrobeViewModel
import com.orni.app.wardrobe.util.base64ToByteArray
import com.orni.app.wardrobe.util.readBytes
import com.orni.app.wardrobe.util.toBase64

@Composable
fun WardrobeTryOnScreen(
    viewModel: WardrobeViewModel = viewModel(),
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val selectedPhotoUri by viewModel.selectedPhotoUri.collectAsState()
    var description by remember { mutableStateOf("") }

    val isBusy = uiState is WardrobeUiState.GeneratingGarment || uiState is WardrobeUiState.ApplyingGarment

    val pickPhotoLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val photoBase64 = uri.readBytes(context.contentResolver).toBase64()
            viewModel.onPhotoSelected(uri, photoBase64)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "Wardrobe Try-On", style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))

        WardrobePreview(
            uiState = uiState,
            selectedPhotoUri = selectedPhotoUri,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedButton(
            onClick = {
                pickPhotoLauncher.launch(
                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                )
            },
            enabled = !isBusy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (selectedPhotoUri == null) "Choose a photo" else "Change photo")
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Describe the outfit") },
            placeholder = { Text("e.g. black oversized t-shirt with beige cargo pants") },
            enabled = selectedPhotoUri != null && !isBusy,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = { viewModel.onDescriptionSubmitted(description) },
            enabled = selectedPhotoUri != null && description.isNotBlank() && !isBusy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Filled.Checkroom, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Try it on")
        }

        if (uiState is WardrobeUiState.Error) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = (uiState as WardrobeUiState.Error).message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
            TextButton(onClick = { viewModel.retry() }) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Retry")
            }
        }
    }
}

@Composable
private fun WardrobePreview(
    uiState: WardrobeUiState,
    selectedPhotoUri: Uri?,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        when (uiState) {
            is WardrobeUiState.Success -> {
                val bytes = remember(uiState.resultImageBase64) { uiState.resultImageBase64.base64ToByteArray() }
                val bitmap = remember(bytes) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = "Try-on result",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            is WardrobeUiState.GeneratingGarment, is WardrobeUiState.ApplyingGarment -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = if (uiState is WardrobeUiState.GeneratingGarment) {
                            "Generating garment..."
                        } else {
                            "Applying to your photo..."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            is WardrobeUiState.Error -> {
                if (selectedPhotoUri != null) {
                    AsyncImage(
                        model = selectedPhotoUri,
                        contentDescription = "Selected photo",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Text(
                        text = "Something went wrong",
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }

            WardrobeUiState.Idle -> {
                if (selectedPhotoUri != null) {
                    AsyncImage(
                        model = selectedPhotoUri,
                        contentDescription = "Selected photo",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Text(
                        text = "Pick a photo to get started",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }
    }
}
