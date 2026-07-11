package com.orni.app.wardrobe

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.orni.app.wardrobe.network.WardrobeRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class WardrobeViewModel(
    private val repository: WardrobeRepository = WardrobeRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow<WardrobeUiState>(WardrobeUiState.Idle)
    val uiState: StateFlow<WardrobeUiState> = _uiState.asStateFlow()

    private val _selectedPhotoUri = MutableStateFlow<Uri?>(null)
    val selectedPhotoUri: StateFlow<Uri?> = _selectedPhotoUri.asStateFlow()

    // Keyed to the current photo. A new photo means a new Omni Flash session -
    // edits must never bleed across unrelated try-ons.
    private var sessionId: String? = null
    private var currentPhotoBase64: String? = null
    private var lastDescription: String = ""

    fun onPhotoSelected(uri: Uri, photoBase64: String) {
        sessionId = null
        currentPhotoBase64 = photoBase64
        _selectedPhotoUri.value = uri
        _uiState.value = WardrobeUiState.Idle
    }

    fun onDescriptionSubmitted(description: String) {
        val photoBase64 = currentPhotoBase64 ?: return
        lastDescription = description
        viewModelScope.launch {
            _uiState.value = WardrobeUiState.GeneratingGarment
            // NB2 Lite renders the garment (including any text/logos) first.
            repository.generateGarment(description)
                .onSuccess { garmentImageBase64 -> applyGarment(photoBase64, garmentImageBase64, description) }
                .onFailure { error -> _uiState.value = WardrobeUiState.Error(error.message ?: "Failed to generate garment") }
        }
    }

    fun retry() {
        if (lastDescription.isNotBlank()) onDescriptionSubmitted(lastDescription)
    }

    private suspend fun applyGarment(photoBase64: String, garmentImageBase64: String, instruction: String) {
        _uiState.value = WardrobeUiState.ApplyingGarment
        // Omni Flash composites the garment onto the photo, threading the same
        // session across turns so follow-up edits are incremental, not cold starts.
        repository.applyGarment(
            photoBase64 = photoBase64,
            garmentImageBase64 = garmentImageBase64,
            sessionId = sessionId,
            instruction = instruction,
        ).onSuccess { (resultImageBase64, newSessionId) ->
            sessionId = newSessionId
            _uiState.value = WardrobeUiState.Success(resultImageBase64)
        }.onFailure { error ->
            _uiState.value = WardrobeUiState.Error(error.message ?: "Failed to apply garment")
        }
    }
}
